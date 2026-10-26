const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function harness(saved) {
  const storage = new Map(saved ? [['dartabend.local.v1', saved]] : []);
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
function start(h,remaining=301,checkout='straight',mode='classic') {
  h.run(`state.setup.mode=${JSON.stringify(mode)};state.setup.startScore=301;state.setup.checkout=${JSON.stringify(checkout)};state.setup.selectedPlayerIds=[state.players[0].id];startGame();clearRouletteIntro();clearRestjagdIntroTimers();restjagdIntro=null;state.activeGame.players[0].remaining=${remaining};state.activeGame.sharedRemaining=${remaining}`);
}

test('compact keypad has 20 numbers and three special fields; modifiers edit rather than multiply twice',()=>{
  const h=harness();start(h);
  assert.equal((h.run('renderActiveGame()').match(/data-action="add-dart"/g)||[]).length,23);
  h.run('addDart(20,"20","single");setDartType("triple");setDartType("double");addDart(5,"5","single")');
  assert.deepEqual(h.json('state.activeGame.currentThrows.map(d=>d.label)'),['D20','5']);
  h.run('selectDart(0);setDartType("single");addDart(1,"1","single");setDartType("triple")');
  assert.deepEqual(h.json('state.activeGame.currentThrows.map(d=>d.label)'),['20','5','T1']);
  h.run('selectDart(1);addDart(19,"19","single")');
  assert.deepEqual(h.json('state.activeGame.currentThrows.map(d=>d.label)'),['20','19','T1']);
  h.run('clearThrows();addDart(25,"Bull","bull");setDartType("triple")');
  assert.equal(h.run('state.activeGame.currentThrows[0].value'),25);
});

test('single checkout wins immediately and correction retracts and restores the exact statistics once',()=>{
  const h=harness();start(h,20);
  h.run('addDart(20,"20","single")');
  assert.equal(h.run('Boolean(state.activeGame.finishedAt)'),true);
  assert.equal(h.run('state.matches.length'),1);
  h.run('setDartType("triple")');
  assert.equal(h.run('Boolean(state.activeGame.finishedAt)'),false);
  assert.equal(h.run('evaluateTurn(state.activeGame).bust'),true);
  assert.equal(h.run('state.activeGame.players[0].remaining'),20);
  assert.equal(h.run('state.matches.length'),0);
  assert.equal(h.run('getStats().get(state.players[0].id).rounds'),0);
  h.run('setDartType("single")');
  assert.equal(h.run('state.matches.length'),1);
  assert.equal(h.run('getStats().get(state.players[0].id).totalDarts'),1);
  assert.deepEqual(h.json('state.matches[0].players[0].dartCounts'),{'20':1});
  const reloaded=harness(h.storage.get('dartabend.local.v1'));
  reloaded.run('setDartType("double")');
  assert.equal(reloaded.run('state.matches.length'),0);
  assert.equal(reloaded.run('state.activeGame.players[0].rounds'),0);
});

test('Double Out allows the multiplier after a provisional bust and after the third dart',()=>{
  const h=harness();start(h,2,'double');
  h.run('addDart(1,"1","single")');
  assert.equal(h.run('evaluateTurn(state.activeGame).bust'),true);
  h.run('setDartType("double")');
  assert.equal(h.run('Boolean(state.activeGame.finishedAt)'),true);
  h.run('setDartType("triple")');
  assert.equal(h.run('Boolean(state.activeGame.finishedAt)'),false);
  h.run('clearThrows();state.activeGame.players[0].remaining=42;addDart(20,"20","single");addDart(20,"20","single");addDart(1,"1","single");setDartType("double")');
  assert.equal(h.run('Boolean(state.activeGame.finishedAt)'),true);
  assert.deepEqual(h.json('state.matches[0].players[0].roundDetails[0].darts.map(d=>d.label)'),['20','20','D1']);
  h.run('removeLastDart()');
  assert.equal(h.run('state.matches.length'),0);
  assert.deepEqual(h.json('state.activeGame.currentThrows.map(d=>d.label)'),['20','20']);
});

test('Restjagd victory correction restores shared score and darts without creating statistics',()=>{
  const h=harness();start(h,20,'straight','restjagd');
  h.run('addDart(20,"20","single")');
  assert.equal(h.run('state.activeGame.dartsThrown'),1);
  h.run('setDartType("triple")');
  assert.equal(h.run('state.activeGame.sharedRemaining'),20);
  assert.equal(h.run('state.activeGame.dartsThrown'),0);
  h.run('setDartType("single")');
  assert.equal(h.run('state.activeGame.sharedRemaining'),0);
  assert.equal(h.run('state.activeGame.dartsThrown'),1);
  assert.equal(h.run('state.matches.length'),0);
});

test('DartRoulette advances automatically only for the exact field and cancels a corrected hit',()=>{
  const h=harness();start(h,0,'straight','dartroulette');
  h.run('state.activeGame.rouletteTarget={number:16,label:"D16",value:32,type:"double"};addDart(16,"16","single")');
  h.tick(350);
  assert.equal(h.run('state.activeGame.rouletteRound'),1);
  h.run('setDartType("double");setDartType("single")');h.tick(350);
  assert.equal(h.run('state.activeGame.rouletteRound'),1);
  h.run('setDartType("double")');h.tick(350);
  assert.equal(h.run('state.activeGame.rouletteRound'),2);
  assert.equal(h.run('state.activeGame.currentThrows.length'),0);
  assert.equal(h.run('state.matches.length'),0);
});

test('revoked checkout cannot return from stale snapshots; a newer corrected result can',()=>{
  const h=harness();start(h,20);
  h.run('addDart(20,"20","single");const staleMatch=clone(state.matches[0]);setDartType("triple");mergeRemoteMatches([staleMatch])');
  assert.equal(h.run('state.matches.length'),0);
  h.run('setDartType("single");const corrected=clone(state.matches[0]);const id=corrected.id;mergeRemoteMatches([{id,mode:"classic",deleted:true,revision:corrected.revision-1,updatedAt:new Date().toISOString()}])');
  assert.equal(h.run('state.matches.length'),1);
  h.run('mergeRemoteMatches([{id,mode:"classic",deleted:true,revision:corrected.revision+1,updatedAt:new Date().toISOString()}]);mergeRemoteMatches([corrected])');
  assert.equal(h.run('state.matches.length'),0);
});

test('late remote writes cannot overwrite a newer checkout correction or tombstone',async()=>{
  const h=harness();
  h.run(`let remote={revision:4,deleted:true};let writes=0;
    const db={runTransaction:async callback=>callback({get:async()=>({exists:true,data:()=>remote}),set:(ref,payload)=>{remote={...remote,...payload};writes++}})};`);
  await h.run('writeVersionedMatch(db,{}, {revision:3,deleted:false})');
  assert.equal(h.run('writes'),0);
  await h.run('writeVersionedMatch(db,{}, {revision:4,deleted:false})');
  assert.equal(h.run('writes'),0);
  await h.run('writeVersionedMatch(db,{}, {revision:5,deleted:false})');
  assert.equal(h.run('remote.deleted'),false);
  assert.equal(h.run('remote.revision'),5);
});

test('the actual sync outbox retracts a winner and publishes a later corrected winner without resurrection',async()=>{
  const h=harness();start(h,20);
  h.run(`isSyncEnabled=()=>true;window.firebase={firestore:{FieldValue:{serverTimestamp:()=>null}}};
    const records=new Map();
    const familyRef={collection:name=>({doc:id=>({id,kind:name,set:async()=>{}})})};
    const db={runTransaction:async callback=>callback({
      get:async ref=>({exists:records.has(ref.id),data:()=>records.get(ref.id)}),
      set:(ref,payload)=>records.set(ref.id,{...(records.get(ref.id)||{}),...clone(payload)})
    })};
    addDart(20,"20","single");const originalPayload=prepareMatchForRemote(clone(state.matches[0]));`);
  await h.run('pushLocalData(familyRef,db)');
  assert.equal(h.run('records.get(state.activeGame.id).deleted'),false);
  h.run('setDartType("triple")');
  await h.run('pushLocalData(familyRef,db)');
  assert.equal(h.run('records.get(state.activeGame.id).deleted'),true);
  await h.run('writeVersionedMatch(db,{id:state.activeGame.id},originalPayload)');
  assert.equal(h.run('records.get(state.activeGame.id).deleted'),true);
  h.run('setDartType("single")');
  await h.run('pushLocalData(familyRef,db)');
  assert.equal(h.run('records.get(state.activeGame.id).deleted'),false);
  assert.equal(h.run('records.get(state.activeGame.id).players[0].totalDarts'),1);
});

test('a revoked Restjagd win queues the restored shared game for other devices',()=>{
  const h=harness();start(h,20,'straight','restjagd');
  h.run('isSyncEnabled=()=>true;addDart(20,"20","single");setDartType("triple")');
  assert.equal(h.run('state.sync.pending.activeGame.id'),h.run('state.activeGame.id'));
  assert.equal(h.run('state.activeGame.sharedRemaining'),20);
  assert.equal(h.run('state.matches.length'),0);
});
