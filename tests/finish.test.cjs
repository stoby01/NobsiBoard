const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function harness() {
  const storage = new Map();
  const app = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  const context = vm.createContext({
    console,
    navigator: { onLine: false },
    crypto: require("node:crypto").webcrypto,
    document: {
      querySelector: (selector) => selector === "#app" ? app : null,
      querySelectorAll: () => [],
      addEventListener() {},
      body: { classList: { toggle() {} } },
      activeElement: null
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    confirm: () => true,
    addEventListener() {},
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    requestAnimationFrame: () => 1,
    matchMedia: () => ({ matches: false }),
    location: { reload() {} }
  });
  context.window = context;
  vm.runInContext(source + "\nfunction isSyncEnabled(){return false;}", context);
  return (code) => vm.runInContext(code, context);
}

test("a completed classic game shows the checkout route even without high-hit badges", () => {
  const run = harness();
  run('state.setup.mode="classic";state.setup.startScore=301;state.setup.selectedPlayerIds=[state.players[0].id];startGame();state.activeGame.players[0].remaining=20;addDart(20,"20","single");submitRound()');
  const row = run("renderHistoryRow(state.matches[0])");
  assert.match(row, /history-dart-chip finish/);
  assert.match(row, /Finish<\/span><strong>20<\/strong>/);
  assert.doesNotMatch(row, /history-dart-chip triple/);
});

test("highest throw displays the recorded 171 dart sequence", () => {
  const run = harness();
  run(`const piet=state.players[0];
    state.matches=[{id:"historic",mode:"classic",startScore:301,finishedAt:"2026-10-14T21:17:53Z",winnerId:piet.id,checkout:"straight",players:[{
      id:piet.id,name:piet.name,remaining:0,rounds:2,throwsTotal:200,highestThrow:171,roundScores:[171,29],dartCounts:{T20:1,T18:1,T19:1},
      roundDetails:[{score:171,bust:false,darts:[{label:"T20",value:60},{label:"T18",value:54},{label:"T19",value:57}]},{score:29,bust:false,darts:[{label:"20",value:20},{label:"9",value:9}]}]
    }]}]`);
  const stats = run("renderStatsView()");
  assert.match(stats, /<span class="stat-value">171<\/span>/);
  assert.match(stats, /class="stat-route">T20 · T18 · T19<\/span>/);
  assert.match(run("renderHistoryRow(state.matches[0])"), /Finish<\/span><strong>20 · 9<\/strong>/);
});

test("legacy rounds without dart details do not receive a guessed route", () => {
  const run = harness();
  run(`const piet=state.players[0];state.matches=[{id:"old",mode:"classic",startScore:301,finishedAt:"2025-01-01",winnerId:piet.id,players:[{id:piet.id,name:piet.name,remaining:0,rounds:1,throwsTotal:171,highestThrow:171,roundScores:[171],dartCounts:{},roundDetails:[]}]}]`);
  assert.doesNotMatch(run("renderHistoryRow(state.matches[0])"), /Finish/);
  assert.doesNotMatch(run("renderStatsView()"), /class="stat-route"/);
});
