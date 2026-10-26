const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
function harness() {
  const storage = new Map();
  const app = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  const navigator = { onLine: false };
  const context = vm.createContext({
    console, navigator, crypto: require("node:crypto").webcrypto,
    document: { querySelector: (selector) => selector === "#app" ? app : null, querySelectorAll: () => [], addEventListener() {}, body: { classList: { toggle() {} } }, activeElement: null },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    confirm: () => true, addEventListener() {}, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
    requestAnimationFrame: () => 1, matchMedia: () => ({ matches: false }), location: { reload() {} }
  });
  context.window = context;
  vm.runInContext(source, context);
  const run = (code) => vm.runInContext(code, context);
  return { run, navigator, storage };
}

test("finished game stays pending through offline and only turns green after an acknowledged family write", async () => {
  const h = harness();
  h.run('state.sync.lastSyncedAt="2026-10-26T10:00:00Z"');
  h.run('queueSync({matchId:"game-1"})');
  assert.match(h.run('getSyncDisplay().detail'), /1 Spiel/);
  assert.equal(h.run('getSyncDisplay().status'), "offline");
  assert.deepEqual(JSON.parse(h.storage.get("dartabend.local.v1")).sync.pending.matches, ["game-1"]);
  h.navigator.onLine = true;
  h.run('setSyncRuntime("synced","Laufende Partie synchron.","",false)');
  assert.equal(h.run('getSyncDisplay().status'), "pending");
  h.run(`let releaseWrite;
    ensureFirebaseSession=async()=>({collection:()=>({doc:()=>({set:async()=>{}})})});
    watchFamilyReset=()=>{};watchFamilyData=()=>{};watchActiveGame=()=>{};
    applyRemoteFamilyReset=async()=>false;deleteQueuedRemotePlayers=async()=>{};pullRemoteData=async()=>{};
    pushLocalData=()=>new Promise(resolve=>{releaseWrite=resolve});
    window.firebase={firestore:{FieldValue:{serverTimestamp:()=>null}}};`);
  const syncing = h.run('syncWithFirebase({manual:false})');
  assert.equal(h.run('getSyncDisplay().status'), "syncing");
  await new Promise((resolve) => setImmediate(resolve));
  h.run('releaseWrite()');
  await syncing;
  assert.equal(h.run('getSyncDisplay().status'), "synced");
  assert.equal(h.run('state.sync.pending.matches.length'), 0);
});

test("a live game acknowledgement cannot hide an unsent finished match", async () => {
  const h = harness();
  h.navigator.onLine = true;
  h.run('state.sync.lastSyncedAt="2026-10-26T10:00:00Z";state.setup.selectedPlayerIds=[state.players[0].id];startGame();queueSync({matchId:"game-2"})');
  h.run(`ensureFirebaseSession=async()=>({
    collection:()=>({doc:()=>({collection:()=>({doc:()=>({})})})}),
    runTransaction:async(callback)=>callback({get:async()=>({exists:false}),set:()=>{}})
  });window.firebase={firestore:{FieldValue:{serverTimestamp:()=>null}}};`);
  await h.run('syncActiveGame()');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.run('state.sync.pending.activeGame'), null);
  assert.equal(h.run('getSyncDisplay().status'), "pending");
  assert.match(h.run('getSyncDisplay().detail'), /1 Spiel/);
});

test("a concurrent game change keeps local darts until the player chooses a version", () => {
  const h = harness();
  h.run('state.setup.selectedPlayerIds=[state.players[0].id];startGame();addDart(20,"20","single")');
  h.run('const remote=clone(state.activeGame);remote.revision=5;remote.deviceId="another-device";showActiveGameConflict(remote)');
  assert.equal(h.run('state.activeGame.currentThrows.length'), 1);
  assert.equal(h.run('getSyncDisplay().status'), "error");
  h.run('resolveActiveGameConflict(true)');
  assert.equal(h.run('state.activeGame.currentThrows.length'), 1);
  assert.equal(h.run('state.activeGame.revision'), 6);
  assert.equal(h.run('state.sync.pending.activeGame.baseRevision'), 5);
});

test("a new finished game during an in-flight sync remains pending", async () => {
  const h = harness();
  h.navigator.onLine = true;
  h.run(`state.sync.lastSyncedAt="2026-10-26T10:00:00Z";queueSync({matchId:"first"});
    let releaseWrite;
    ensureFirebaseSession=async()=>({collection:()=>({doc:()=>({set:async()=>{}})})});
    watchFamilyReset=()=>{};watchFamilyData=()=>{};watchActiveGame=()=>{};
    applyRemoteFamilyReset=async()=>false;deleteQueuedRemotePlayers=async()=>{};pullRemoteData=async()=>{};
    pushLocalData=()=>new Promise(resolve=>{releaseWrite=resolve});
    window.firebase={firestore:{FieldValue:{serverTimestamp:()=>null}}};`);
  const syncing = h.run('syncWithFirebase({manual:false})');
  await new Promise((resolve) => setImmediate(resolve));
  h.run('queueSync({matchId:"second"});releaseWrite()');
  await syncing;
  assert.equal(h.run('getSyncDisplay().status'), "pending");
  assert.deepEqual(Array.from(h.run('state.sync.pending.matches')), ["first", "second"]);
});

test("an offline cancellation stays pending until the remote active game is removed", async () => {
  const h = harness();
  h.run('state.setup.selectedPlayerIds=[state.players[0].id];startGame();cancelGame()');
  assert.equal(h.run('getSyncDisplay().status'), "offline");
  assert.equal(h.run('Boolean(state.sync.pending.activeClear)'), true);
  h.navigator.onLine = true;
  h.run(`let remoteDeleted=false;
    ensureFirebaseSession=async()=>({
      collection:()=>({doc:()=>({collection:()=>({doc:()=>({})})})}),
      runTransaction:async(callback)=>callback({
        get:async()=>({exists:true,data:()=>({id:state.sync.pending.activeClear.id,revision:0})}),
        delete:()=>{remoteDeleted=true}
      })
    });`);
  await h.run('clearRemoteActiveGame(state.sync.pending.activeClear.revision,state.sync.pending.activeClear.id)');
  assert.equal(h.run('remoteDeleted'), true);
  assert.equal(h.run('state.sync.pending.activeClear'), null);
});

test("a live listener failure remains visible after another sync succeeds", () => {
  const h = harness();
  h.navigator.onLine = true;
  h.run('state.sync.lastSyncedAt="2026-10-26T10:00:00Z";familyListenerFailure="Live-Abgleich nicht erreichbar.";setSyncRuntime("synced","Fertige Spiele übertragen.","",false)');
  assert.equal(h.run('getSyncDisplay().status'), "error");
  assert.match(h.run('getSyncDisplay().detail'), /Live-Abgleich/);
});

test("a failed local write is never labelled locally saved", () => {
  const h = harness();
  h.run('localStorage.setItem=()=>{throw new Error("quota")};saveState()');
  assert.equal(h.run('getSyncDisplay().status'), "error");
  assert.equal(h.run('getSyncDisplay().label'), "Speichern fehlgeschlagen");
});
