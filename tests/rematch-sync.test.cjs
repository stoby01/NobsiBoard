const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function harness(){
 const storage=new Map();const navigator={onLine:false};
 const app={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
 const context=vm.createContext({console,navigator,crypto:require('node:crypto').webcrypto,
  document:{querySelector:s=>s==='#app'?app:null,querySelectorAll:()=>[],addEventListener(){},body:{classList:{toggle(){}}},activeElement:null},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  confirm:()=>true,addEventListener(){},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,requestAnimationFrame:()=>1,matchMedia:()=>({matches:false}),location:{reload(){}}
 });context.window=context;vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context);
 run(`window.firebase={firestore:{FieldValue:{serverTimestamp:()=>new Date().toISOString()}}};
 let remote=null;let emitActive=null;let writes=[];
 const activeRef={get:async()=>({exists:Boolean(remote),data:()=>clone(remote)}),onSnapshot:fn=>{emitActive=fn;return()=>{}}};
 const familyRef={collection:()=>({doc:()=>activeRef})};
 const db={collection:()=>({doc:()=>familyRef}),runTransaction:async callback=>callback({
  get:async()=>({exists:Boolean(remote),data:()=>clone(remote)}),
  set:(ref,payload)=>{remote=clone(payload);writes.push(remote.id)}
 })};ensureFirebaseSession=async()=>db;`);
 return {run,navigator,json:code=>JSON.parse(JSON.stringify(run(code)))};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function restjagd(h){h.run('state.setup.mode="restjagd";state.setup.selectedPlayerIds=[state.players[0].id];startGame();clearRestjagdIntroTimers();restjagdIntro=null;state.activeGame.sharedRemaining=20;addDart(20,"20","single")')}

test('repeated Restjagd rematches replace the previous game without conflict or duplicated statistics',async()=>{
 const h=harness();await flush();restjagd(h);
 for(let i=0;i<5;i++){
  h.run('remote=clone(state.activeGame);startRestjagdRematch()');
  const id=h.run('state.activeGame.id');
  assert.equal(h.run('state.activeGame.supersededGameIds.includes(remote.id)'),true);
  h.navigator.onLine=true;await h.run('syncActiveGame()');await flush();
  assert.equal(h.run('remote.id'),id);
  assert.equal(h.run('state.activeGame.id'),id);
  assert.notEqual(h.run('getSyncDisplay().status'),'error');
  assert.doesNotMatch(h.run('renderOverlays()'),/Zwei Spielstände|Sync-Konflikt/);
  h.navigator.onLine=false;
  h.run('clearRestjagdIntroTimers();restjagdIntro=null;state.activeGame.sharedRemaining=20;addDart(20,"20","single")');
 }
 assert.equal(h.run('state.matches.length'),0);
});

test('an old in-flight write cannot replace the new round or bring back a conflict prompt',async()=>{
 const h=harness();await flush();restjagd(h);
 h.run(`remote=clone(state.activeGame);let releaseOldRead;let reads=0;
 db.runTransaction=async callback=>callback({
  get:async()=>{if(++reads===1)return new Promise(resolve=>{releaseOldRead=()=>resolve({exists:true,data:()=>clone(remote)})});return {exists:Boolean(remote),data:()=>clone(remote)}},
  set:(ref,payload)=>{remote=clone(payload);writes.push(remote.id)}
 });`);
 h.navigator.onLine=true;
 const oldWrite=h.run('syncActiveGame()');await flush();
 h.run('startRestjagdRematch()');const id=h.run('state.activeGame.id');
 h.run('releaseOldRead()');await oldWrite;await flush();await flush();
 assert.equal(h.run('state.activeGame.id'),id);
 assert.equal(h.run('remote.id'),id);
 assert.deepEqual(h.json('writes'),[id]);
 assert.doesNotMatch(h.run('renderOverlays()'),/Zwei Spielstände|Sync-Konflikt/);
});

test('late snapshots of the old round are ignored, while a new successor is received on another device',()=>{
 const h=harness();restjagd(h);
 h.run('const old=clone(state.activeGame);startRestjagdRematch();const next=clone(state.activeGame);watchActiveGame(familyRef);emitActive({exists:true,data:()=>({...old,deviceId:"other",revision:999})})');
 assert.equal(h.run('state.activeGame.id'),h.run('next.id'));
 h.run('state.activeGame=clone(old);state.sync.pending.activeGame={id:old.id,revision:old.revision,baseRevision:old.revision-1};emitActive({exists:true,data:()=>({...next,deviceId:"other"})})');
 assert.equal(h.run('state.activeGame.id'),h.run('next.id'));
 assert.equal(h.run('state.sync.pending.activeGame'),null);
});

test('normalisation and sync preserve rematch ancestry and Roulette rematches use the same rule',async()=>{
 const h=harness();await flush();
 h.run('state.setup.mode="dartroulette";state.setup.selectedPlayerIds=[state.players[0].id];startGame();clearRouletteIntro();state.activeGame.finishedAt=new Date().toISOString();const oldId=state.activeGame.id;remote=clone(state.activeGame);startRouletteRematch();clearRouletteIntro()');
 assert.equal(h.run('state.activeGame.supersededGameIds.includes(oldId)'),true);
 assert.equal(h.run('normalizeRemoteActiveGame(prepareActiveGameForRemote(state.activeGame)).supersededGameIds.includes(oldId)'),true);
 h.navigator.onLine=true;await h.run('syncActiveGame()');await flush();
 assert.equal(h.run('remote.id'),h.run('state.activeGame.id'));
 assert.doesNotMatch(h.run('renderOverlays()'),/Zwei Spielstände|Sync-Konflikt/);
});
