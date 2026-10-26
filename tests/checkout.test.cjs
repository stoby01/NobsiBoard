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
    console, navigator: { onLine: false }, crypto: require("node:crypto").webcrypto,
    document: { querySelector: (selector) => selector === "#app" ? app : null, querySelectorAll: () => [], addEventListener() {}, body: { classList: { toggle() {} } }, activeElement: null },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    confirm: () => true, addEventListener() {}, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
    requestAnimationFrame: () => 1, matchMedia: () => ({ matches: false }), location: { reload() {} }
  });
  context.window = context;
  vm.runInContext(source + "\nfunction isSyncEnabled(){return false;}", context);
  return (code) => vm.runInContext(code, context);
}

test("Double Out routes finish legally and update after a dart", () => {
  const run = harness();
  assert.equal(run('formatCheckoutRoute(getCheckoutRoutes(82,2,"double")[0])'), "T14 → D20");
  assert.equal(run('formatCheckoutRoute(getCheckoutRoutes(170,3,"double")[0])'), "T20 → T20 → Bullseye");
  assert.equal(run('getCheckoutRoutes(169,3,"double").length'), 0);
  assert.equal(run('getCheckoutRoutes(171,3,"double").length'), 0);
  assert.equal(run('formatCheckoutRoute(getCheckoutRoutes(40,2,"double")[0])'), "D20");
  assert.equal(run('getCheckoutRoutes(1,3,"double").length'), 0);
  assert.equal(run('getCheckoutRoutes(82,1,"double").length'), 0);
  assert.equal(run('getCheckoutRoutes(82,2,"double").every(route => route.reduce((sum,dart)=>sum+dart.value,0)===82 && ["double","bullseye"].includes(route.at(-1).type))'), true);
});

test("straight checkout and display stay separate from DartMix", () => {
  const run = harness();
  assert.equal(run('formatCheckoutRoute(getCheckoutRoutes(180,3,"straight")[0])'), "T20 → T20 → T20");
  run('state.setup.mode="classic";state.setup.startScore=301;state.setup.checkout="double";state.setup.selectedPlayerIds=[state.players[0].id];startGame();state.activeGame.players[0].remaining=82');
  assert.match(run('renderActiveGame()'), /Checkout<\/span><strong>T14 → D20/);
  run('addDart(42,"T14","triple")');
  assert.match(run('renderActiveGame()'), /Checkout<\/span><strong>D20/);
  run('state.setup.checkoutHelp=false');
  assert.doesNotMatch(run('renderActiveGame()'), /class="checkout-assist"/);
  run('state.activeGame.mode="restjagd";state.setup.checkoutHelp=true');
  assert.doesNotMatch(run('renderActiveGame()'), /class="checkout-assist"/);
});

test("every displayed route obeys the actual game evaluator", () => {
  const run = harness();
  const invalid = run(`(() => {
    const failures = [];
    for (const checkout of ["straight", "double"]) for (let remaining = 1; remaining <= 180; remaining += 1) {
      for (let dartsLeft = 1; dartsLeft <= 3; dartsLeft += 1) {
        for (const route of getCheckoutRoutes(remaining, dartsLeft, checkout)) {
          const game = { mode: "classic", checkout, currentIndex: 0, players: [{ remaining }], currentThrows: route };
          const result = evaluateTurn(game);
          if (!result.finished || result.bust || route.length > dartsLeft) failures.push([checkout, remaining, dartsLeft, formatCheckoutRoute(route)]);
        }
      }
    }
    return failures;
  })()`);
  assert.deepEqual(Array.from(invalid), []);
});
