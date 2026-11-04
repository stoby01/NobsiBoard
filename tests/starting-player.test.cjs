const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function harness(saved, deviceId) {
  const storage = new Map(saved ? [['dartabend.local.v1', saved], ['nobsiboard.device.id', deviceId]] : []);
  const timers = new Map(); let timerId = 0;
  const app = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  const context = vm.createContext({
    console, navigator: {onLine:false}, crypto: require('node:crypto').webcrypto,
    document: {querySelector: s => s === '#app' ? app : null, querySelectorAll:()=>[], addEventListener(){},body:{classList:{toggle(){}}},activeElement:null},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    confirm:()=>true,addEventListener(){},
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId},clearTimeout:id=>timers.delete(id),setInterval:()=>1,
    requestAnimationFrame:()=>1,matchMedia:()=>({matches:false}),location:{reload(){}}
  });
  context.window = context;
  vm.runInContext(source+'\nfunction isSyncEnabled(){return false;}',context);
  const run = code => vm.runInContext(code,context);
  return {run,storage,json:code=>JSON.parse(JSON.stringify(run(code))),tick:delay=>{
    const ready=[...timers].filter(([,timer])=>timer.delay===delay);
    ready.forEach(([id,timer])=>{if(timers.delete(id)) timer.fn()});
  }};
}
function start(h,mode='classic',count=2,score=501){
  h.run(`state.players=Array.from({length:${count}},(_,i)=>createPlayer('Lokaler Test '+i,colors[i%colors.length]));
    state.setup.selectedPlayerIds=state.players.map(p=>p.id);state.setup.mode=${JSON.stringify(mode)};state.setup.startScore=${score};startGame()`);
}
function enter(h,value,type='single'){
  h.run(`addDart(${value},${JSON.stringify(type==='bullseye'?'Bullseye':String(value))},${JSON.stringify(type)});submitRound()`);
}
for(const mode of ['classic-301','classic-501','restjagd','dartroulette']){
  test(`${mode}: all players throw once; Bullseye beats T20; game starts cleanly with the winner`,()=>{
    const h=harness();start(h,mode.startsWith('classic')?'classic':mode,2,mode==='classic-301'?301:501);
    const score=h.run('state.activeGame.startScore');
    assert.equal(h.run('Boolean(state.activeGame.startSelection)'),true);
    assert.equal(h.run('restjagdIntro'),null);
    assert.equal(h.run('rouletteIntro'),null);
    h.run('addDart(20,"20","single");setDartType("triple")');
    assert.equal(h.run('state.activeGame.currentThrows.length'),1);
    assert.equal(h.run('state.activeGame.currentThrows[0].value'),60);
    h.run('submitRound()');enter(h,50,'bullseye');
    assert.equal(h.run('state.activeGame.startSelection.winnerId'),h.run('state.players[1].id'));
    assert.match(h.run('renderActiveGame()'),/beginnt!/);
    h.tick(1400);
    assert.equal(h.run('state.activeGame.startSelection'),null);
    assert.equal(h.run('state.activeGame.currentIndex'),1);
    assert.equal(h.run('state.activeGame.startingIndex'),1);
    assert.equal(h.run('state.activeGame.startScore'),score);
    assert.equal(h.run('state.activeGame.currentThrows.length'),0);
    assert.equal(h.run('state.activeGame.history.length'),0);
    assert.equal(h.run('state.activeGame.players.reduce((n,p)=>n+p.totalDarts+p.rounds+p.throwsTotal,0)'),0);
    assert.equal(h.run('state.matches.length'),0);
    if(mode==='restjagd')assert.ok(h.run('restjagdIntro'));
    if(mode==='dartroulette')assert.equal(h.run('rouletteIntro.playerId'),h.run('state.players[1].id'));
  });
}
test('repeated ties include only leaders; equal numeric values tie across field types',()=>{
  const h=harness();start(h,'classic',3);
  enter(h,20);enter(h,20,'double');enter(h,5);
  assert.equal(h.run('state.activeGame.startSelection.round'),2);
  assert.deepEqual(h.json('state.activeGame.startSelection.candidates'),h.json('state.players.slice(0,2).map(p=>p.id)'));
  enter(h,0,'miss');enter(h,0,'miss');
  assert.equal(h.run('state.activeGame.startSelection.round'),3);
  enter(h,25,'bull');enter(h,40,'double');h.run('finishStartSelection()');
  assert.equal(h.run('state.activeGame.currentIndex'),1);
});
test('input replaces the single dart, permits correction and never applies checkout rules',()=>{
  const h=harness();start(h,'restjagd');
  h.run('state.activeGame.sharedRemaining=2;state.activeGame.checkout="double";addDart(20,"20","single");addDart(19,"19","single");setDartType("triple")');
  assert.equal(h.run('state.activeGame.currentThrows.length'),1);
  assert.equal(h.run('state.activeGame.currentThrows[0].value'),57);
  h.run('clearThrows();submitRound()');
  assert.equal(h.run('state.activeGame.currentIndex'),0);
  h.run('addDart(50,"Bullseye","bullseye");setDartType("double");removeLastDart()');
  assert.equal(h.run('state.activeGame.currentThrows.length'),0);
  enter(h,2);
  assert.equal(h.run('state.activeGame.finishedAt'),null);
  assert.equal(h.run('state.activeGame.sharedRemaining'),2);
});
test('all solo modes bypass selection; both DartMix rematches run a fresh selection',()=>{
  for(const mode of ['classic','restjagd','dartroulette']){
    const h=harness();start(h,mode,1);
    assert.equal(h.run('state.activeGame.startSelection'),null);
  }
  for(const mode of ['restjagd','dartroulette']){
    const h=harness();start(h,mode);
    enter(h,20);enter(h,1);h.run('finishStartSelection();clearRouletteIntro();clearRestjagdIntroTimers();restjagdIntro=null;state.activeGame.finishedAt=new Date().toISOString()');
    h.run(mode==='restjagd'?'startRestjagdRematch()':'startRouletteRematch()');
    assert.equal(h.run('state.activeGame.startSelection.round'),1);
    assert.equal(h.run('state.activeGame.startSelection.results.length'),0);
    assert.equal(h.run('restjagdIntro'),null);
    assert.equal(h.run('rouletteIntro'),null);
  }
});
test('reload and remote normalization preserve decision, pending dart, names and winner',()=>{
  const h=harness();start(h);enter(h,20);h.run('addDart(19,"19","single");setDartType("triple");saveState()');
  const restored=harness(h.storage.get('dartabend.local.v1'),h.run('DEVICE_ID'));
  assert.equal(restored.run('state.activeGame.currentThrows[0].value'),57);
  assert.deepEqual(restored.json('state.activeGame.startSelection'),h.json('state.activeGame.startSelection'));
  assert.deepEqual(h.json('normalizeRemoteActiveGame(prepareActiveGameForRemote(state.activeGame)).startSelection'),h.json('state.activeGame.startSelection'));
  restored.run('submitRound();saveState()');
  const winner=harness(restored.storage.get('dartabend.local.v1'),restored.run('DEVICE_ID'));
  winner.tick(1400);
  assert.equal(winner.run('state.activeGame.startSelection'),null);
  assert.equal(winner.run('state.activeGame.currentIndex'),1);
  assert.equal(h.run('normalizeRemoteActiveGame({...prepareActiveGameForRemote(state.activeGame),startSelection:undefined}).startSelection'),null);
});
test('AI throws one seeded decision dart, no statistics, and normal AI play resumes after selection',()=>{
  const h=harness();h.run('state.setup.aiEnabled=true;state.setup.aiLevel=7');start(h,'classic',1);
  enter(h,0,'miss');
  assert.equal(h.run('aiPlayback.darts.length'),1);
  const plan=h.json('planAiTurn(state.activeGame)');
  assert.deepEqual(h.json('planAiTurn(normalizeRemoteActiveGame(prepareActiveGameForRemote(state.activeGame)))'),plan);
  // Force only the result to exercise the AI-wins branch deterministically.
  h.run('aiPlayback.darts=[{value:50,label:"Bullseye",type:"bullseye"}];finishAiTurn()');
  assert.equal(h.run('state.activeGame.startSelection.winnerId'),h.run('state.activeGame.players[1].id'));
  assert.equal(h.run('state.activeGame.players[1].totalDarts'),0);
  h.tick(1400);
  assert.equal(h.run('aiPlayback.darts.length'),3);
  h.run('finishAiTurn()');
  assert.equal(h.run('state.activeGame.currentIndex'),0);
});
test('cancelling after decision cannot start an old game through a stale timer',()=>{
  const h=harness();start(h);enter(h,20);enter(h,5);
  h.run('leaveGame()');h.tick(1400);
  assert.equal(h.run('state.activeGame'),null);
  start(h);h.tick(1400);
  assert.equal(h.run('state.activeGame.startSelection.round'),1);
});
test('a synced decision dart can be followed by its confirmation without resurrecting the previous player',()=>{
  const h=harness();start(h);
  h.run(`let emitDecision;
    const family={collection:()=>({doc:()=>({onSnapshot:fn=>{emitDecision=fn;return()=>{}}})})};
    const remote=prepareActiveGameForRemote(state.activeGame);remote.deviceId='other-device';remote.revision=10;
    remote.currentThrows=[{value:20,label:'20',type:'single'}];
    state.activeGame=null;state.sync.pending.activeGame=null;watchActiveGame(family);
    emitDecision({exists:true,data:()=>clone(remote)});`);
  assert.equal(h.run('state.activeGame.currentThrows.length'),1);
  h.run(`remote.revision++;remote.startSelection.results=[{playerId:remote.players[0].id,dart:remote.currentThrows[0]}];
    remote.currentThrows=[];remote.currentIndex=1;emitDecision({exists:true,data:()=>clone(remote)})`);
  assert.equal(h.run('state.activeGame.currentIndex'),1);
  assert.equal(h.run('state.activeGame.currentThrows.length'),0);
  assert.equal(h.run('state.activeGame.startSelection.results.length'),1);
  h.run('addDart(19,"19","single");remote.revision+=10;emitDecision({exists:true,data:()=>clone(remote)})');
  assert.equal(h.run('state.activeGame.currentThrows[0].value'),19);
});
