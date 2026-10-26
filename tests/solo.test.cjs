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
  const run = (code) => vm.runInContext(code, context);
  return { run, json: (code) => JSON.parse(JSON.stringify(run(code))), storage };
}

test("classic 301 and 501 start with one player; no game starts with none", () => {
  const h = harness();
  for (const score of [301, 501]) {
    h.run(`state.setup.mode="classic";state.setup.startScore=${score};state.setup.selectedPlayerIds=[];startGame()`);
    assert.equal(h.run("state.activeGame"), null);
    h.run("state.setup.selectedPlayerIds=[state.players[0].id];startGame()");
    assert.equal(h.run("state.activeGame.players.length"), 1);
    assert.equal(h.run("state.activeGame.startScore"), score);
    h.run("state.activeGame=null");
  }
});

test("solo 301 straight checkout saves throws and history without wins or rank points", () => {
  const h = harness();
  h.run(`state.setup.mode="classic";state.setup.startScore=301;state.setup.selectedPlayerIds=[state.players[0].id];startGame();
    state.activeGame.players[0].remaining=20;addDart(20,"20","single");submitRound()`);
  assert.equal(h.run("Boolean(state.activeGame.finishedAt)"), true);
  assert.equal(h.run("state.matches.length"), 1);
  assert.equal(h.run("state.matches[0].players.length"), 1);
  assert.deepEqual(h.json("({games:getStats().get(state.players[0].id).games, solo:getStats().get(state.players[0].id).soloGames, wins:getStats().get(state.players[0].id).wins, losses:getStats().get(state.players[0].id).losses, points:getStats().get(state.players[0].id).points, darts:getStats().get(state.players[0].id).totalDarts})"),
    { games: 1, solo: 1, wins: 0, losses: 0, points: 0, darts: 1 });
  assert.match(h.run("renderWinner(state.activeGame)"), /301 geschafft/);
  assert.match(h.run("renderHistoryRow(state.matches[0])"), /Solo/);
  assert.doesNotMatch(h.run("renderHistoryRow(state.matches[0])"), /\+3/);
});

test("solo 501 respects Double Out and never enters the competitive win rate", () => {
  const h = harness();
  h.run(`state.setup.mode="classic";state.setup.startScore=501;state.setup.checkout="double";
    state.setup.selectedPlayerIds=[state.players[0].id];startGame();
    state.activeGame.players[0].remaining=20;addDart(20,"20","single");submitRound()`);
  assert.equal(h.run("Boolean(state.activeGame.finishedAt)"), false);
  assert.equal(h.run("state.activeGame.players[0].remaining"), 20);
  h.run('addDart(20,"D10","double");submitRound()');
  assert.equal(h.run("Boolean(state.activeGame.finishedAt)"), true);
  assert.equal(h.run("getStats().get(state.players[0].id).points"), 0);
  assert.equal(h.run("getStats().get(state.players[0].id).winRate"), 0);
  assert.equal(h.run("getStats().get(state.players[0].id).competitiveAverage"), 0);
});

test("a later two-player victory counts normally; prior solo game does not dilute win rate", () => {
  const h = harness();
  h.run(`state.setup.mode="classic";state.setup.startScore=301;state.setup.selectedPlayerIds=[state.players[0].id];startGame();
    state.activeGame.players[0].remaining=20;addDart(20,"20","single");submitRound();
    state.activeGame=null;state.setup.selectedPlayerIds=state.players.map(player=>player.id);startGame();
    state.activeGame.players[0].remaining=20;addDart(20,"20","single");submitRound()`);
  assert.deepEqual(h.json("({games:getStats().get(state.players[0].id).games,solo:getStats().get(state.players[0].id).soloGames,competitive:getStats().get(state.players[0].id).competitiveGames,wins:getStats().get(state.players[0].id).wins,points:getStats().get(state.players[0].id).points,rate:getStats().get(state.players[0].id).winRate})"),
    { games: 2, solo: 1, competitive: 1, wins: 1, points: 3, rate: 100 });
  assert.equal(h.run("getStats().get(state.players[1].id).losses"), 1);
  assert.equal(h.run("getStats().get(state.players[0].id).competitiveAverage"), 20);
});

test("solo throwing average cannot break a tie in the competitive ranking", () => {
  const h = harness();
  h.run(`state.players[0].name="Zed";state.players[1].name="Ada";
    state.setup.mode="classic";state.setup.startScore=301;state.setup.selectedPlayerIds=[state.players[0].id];startGame();
    state.activeGame.players[0].remaining=20;addDart(20,"20","single");submitRound()`);
  const ids = h.json("state.players.map(player=>player.id)");
  const html = h.run("renderStatsView()");
  assert.ok(html.indexOf(`data-player-id="${ids[1]}"`) < html.indexOf(`data-player-id="${ids[0]}"`));
  assert.equal(h.run("getStats().get(state.players[0].id).average"), 20);
  assert.equal(h.run("getStats().get(state.players[0].id).competitiveAverage"), 0);
});

test("DartMix modes still start alone and do not create classic statistics", () => {
  const h = harness();
  for (const mode of ["restjagd", "dartroulette"]) {
    h.run(`state.setup.mode=${JSON.stringify(mode)};state.setup.selectedPlayerIds=[state.players[0].id];startGame()`);
    assert.equal(h.run("state.activeGame.players.length"), 1);
    assert.equal(h.run("state.activeGame.mode"), mode);
    h.run("state.activeGame=null;clearRouletteIntro()");
  }
  assert.equal(h.run("state.matches.length"), 0);
});
