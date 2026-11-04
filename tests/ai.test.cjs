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
  // These regression scenarios begin after the starting-player phase.
  vm.runInContext(`const createGameWithSelection = createGame;
    createGame = (...args) => {
      const game = createGameWithSelection(...args);
      game.startSelection = null;
      game.currentIndex = game.startingIndex;
      return game;
    };`, context);
  const run = code => vm.runInContext(code,context);
  return {run,storage,json:code=>JSON.parse(JSON.stringify(run(code))),tick:delay=>{
    const ready=[...timers].filter(([,timer])=>timer.delay===delay);
    ready.forEach(([id,timer])=>{if(timers.delete(id)) timer.fn()});
  }};
}
function startAi(h, level = 3) {
  h.run(`state.setup.aiEnabled=true;state.setup.aiLevel=${level};state.setup.selectedPlayerIds=[state.players[0].id];startGame()`);
}
test('bust visits record zero points and actual darts once, survive normalization, and undo cleanly',()=>{
  const h=harness();startAi(h);
  h.run('state.activeGame.players[0].remaining=20;state.activeGame.checkout="double";addDart(5,"5","single");addDart(20,"20","single");submitRound()');
  assert.deepEqual(h.json('({rounds:state.activeGame.players[0].rounds,darts:state.activeGame.players[0].totalDarts,points:state.activeGame.players[0].throwsTotal,rest:state.activeGame.players[0].remaining,bust:state.activeGame.players[0].roundDetails[0].bust,score:state.activeGame.players[0].roundDetails[0].score})'),{rounds:1,darts:2,points:0,rest:20,bust:true,score:0});
  assert.equal(h.run('normalizeRemoteActiveGame(prepareActiveGameForRemote(state.activeGame)).players[0].roundDetails[0].bust'),true);
  h.run('state.activeGame.currentIndex=0;undo()');
  assert.equal(h.run('state.activeGame.players[0].totalDarts'),0);
  assert.equal(h.run('state.activeGame.players[0].rounds'),0);
});
test('bust then checkout gives correct round average and correction does not duplicate history',()=>{
  const h=harness();h.run('state.setup.selectedPlayerIds=[state.players[0].id];state.setup.checkout="double";startGame();state.activeGame.players[0].remaining=20;addDart(20,"20","single");submitRound();addDart(10,"10","single");setDartType("double")');
  assert.equal(h.run('state.matches[0].players[0].rounds'),2);
  assert.equal(h.run('getStats().get(state.players[0].id).average'),10);
  assert.equal(h.run('getStats().get(state.players[0].id).totalDarts'),2);
  assert.match(h.run('renderMatchPlayerDetails(state.matches[0].players[0])'),/Bust/);
  h.run('setDartType("single");setDartType("double")');
  assert.equal(h.run('state.matches.length'),1);
  assert.equal(h.run('state.matches[0].players[0].roundDetails.length'),2);
});
test('AI busts count equally and preserve score',()=>{
  const h=harness();startAi(h);h.run('state.activeGame.currentIndex=1;state.activeGame.players[1].remaining=20;state.activeGame.currentThrows=[{value:60,label:"T20",type:"triple"}];submitRound(true)');
  assert.equal(h.run('state.activeGame.players[1].rounds'),1);
  assert.equal(h.run('state.activeGame.players[1].totalDarts'),1);
  assert.equal(h.run('state.activeGame.players[1].remaining'),20);
  assert.equal(h.run('state.activeGame.players[1].highestThrow'),0);
});
test('double scatter includes outside, same single, neighboring single and neighboring double',()=>{
  const h=harness();
  for(const [scatter,type,value] of [[.2,'miss',0],[.5,'single',20],[.9,'single',1],[.98,'double',2]]){
    const result=h.json(`(()=>{const values=[.99,${scatter},.1];return simulateAiDart({value:40,label:'D20',type:'double'},1,()=>values.shift())})()`);
    assert.equal(result.type,type);assert.equal(result.value,value);
  }
  assert.equal(h.run(`(()=>{const values=[.99,.5,.1,.01];return simulateAiDart({value:20,label:'20',type:'single'},1,()=>values.shift()).type})()`),'double');
  assert.equal(h.run(`(()=>{const values=[.99,.5,.1,.03];return simulateAiDart({value:20,label:'20',type:'single'},1,()=>values.shift()).type})()`),'triple');
});
test('difficulty influences checkout strategy and route/display use the same level',()=>{
  const h=harness();
  assert.deepEqual(h.json('getAiCheckoutRoute(70,3,"double",1).map(d=>d.label)'),['20','18','D16']);
  assert.deepEqual(h.json('getAiCheckoutRoute(70,3,"double",7).map(d=>d.label)'),['20','Bullseye']);
  startAi(h,1);h.run('state.activeGame.currentIndex=1;state.activeGame.players[1].remaining=70;state.activeGame.checkout="double"');
  assert.match(h.run('renderAiTurn(state.activeGame)'),/20 → 18 → D16/);
  h.run('let targets=[];simulateAiDart=(target)=>{targets.push(target.label);return target};planAiTurn(state.activeGame)');
  assert.deepEqual(h.json('targets'),['20','18','D16']);
});
test('every level offers legal routes across rests and dart counts',()=>{
  const h=harness();startAi(h);
  assert.equal(h.run(`(()=>{const game=state.activeGame;for(let level=1;level<=7;level++)for(const checkout of ['straight','double'])for(let rest=1;rest<=180;rest++)for(let left=1;left<=3;left++){
    const route=getAiCheckoutRoute(rest,left,checkout,level);if(!route.length)continue;
    game.checkout=checkout;game.players[0].remaining=rest;game.currentThrows=route;
    if(route.length>left||!evaluateTurn(game).finished)return false;
  }return true})()`),true);
});
test('average labels reflect selected score and checkout, including existing games',()=>{
  const h=harness();startAi(h,7);
  assert.notEqual(h.run('getAiAverage(7,"straight",301)'),h.run('getAiAverage(7,"double",501)'));
  h.run('state.activeGame.currentIndex=1;state.activeGame.checkout="double";state.activeGame.startScore=501');
  assert.ok(h.run('renderAiTurn(state.activeGame)').includes(h.run('getAiAverage(7,"double",501)')));
  h.run('state.activeGame=null;state.setup.checkout="straight";state.setup.startScore=301');
  assert.ok(h.run('renderAiSetup()').includes(h.run('getAiAverage(7,"straight",301)')));
  assert.match(h.run('renderAiSetup()'),/301 Single Out/);
});
test('8400 independent full games finish with increasing strength inside the displayed average ranges',()=>{
  const h=harness();
  const results=h.json(`(()=>{const output=[];for(const startScore of [301,501])for(const checkout of ['straight','double'])for(let level=1;level<=7;level++){
    let darts=0,finished=0;
    for(let n=0;n<300;n++){
      const game=createGame([{...createPlayer('Local simulation',colors[0]),aiLevel:level}],{startScore,checkout});
      game.id='validation-'+level+'-'+startScore+'-'+checkout+'-'+n;
      for(let turn=0;turn<2000;turn++){
        game.currentThrows=planAiTurn(game);const result=evaluateTurn(game);darts+=result.usedDarts.length;game.revision++;
        if(!result.bust)game.players[0].remaining=result.remaining;
        if(result.finished){finished++;break}
      }
    }
    output.push({startScore,checkout,level,finished,average:startScore*finished*3/darts,range:getAiAverage(level,checkout,startScore)});
  }return output})()`);
  for(let i=0;i<results.length;i++){
    const result=results[i];const [min,max]=result.range.split('–').map(Number);
    assert.equal(result.finished,300,JSON.stringify(result));
    assert.ok(result.average>=min&&result.average<=max,JSON.stringify(result));
    if(result.level>1)assert.ok(result.average>results[i-1].average);
  }
});
test('AI prefers reachable single-only finishes and all suggested routes obey checkout rules',()=>{
  const h=harness();startAi(h);
  assert.equal(h.run('getAiCheckoutRoute(20,3,"straight")[0].type'),'single');
  assert.deepEqual(h.json('getAiCheckoutRoute(40,3,"straight").map(d=>d.label)'),['20','20']);
  assert.equal(h.run('getAiCheckoutRoute(20,3,"double")[0].label'),'D10');
  assert.equal(h.run(`(()=>{const game=state.activeGame;for(const checkout of ['straight','double'])for(let rest=1;rest<=180;rest++)for(let left=1;left<=3;left++){
    const route=getAiCheckoutRoute(rest,left,checkout);if(!route.length)continue;
    game.checkout=checkout;game.players[0].remaining=rest;game.currentThrows=route;
    if(route.length>left||!evaluateTurn(game).finished)return false;
    if(checkout==='straight'&&rest<=20*left&&route.some(d=>d.type!=='single'))return false;
  }return true})()`),true);
  h.run('state.activeGame.currentIndex=1;state.activeGame.checkout="straight";state.activeGame.players[1].remaining=20;let aimed=[];simulateAiDart=(target)=>{aimed.push(target);return target};planAiTurn(state.activeGame)');
  assert.equal(h.run('aimed[0].type'),'single');
});
test('easy bots have 8, 12 and 16 percent double precision; triple strength stays separate',()=>{
  const h=harness();
  for(const [level,chance] of [[1,.08],[2,.12],[3,.16]]){
    assert.equal(h.run(`simulateAiDart({value:20,label:'D10',type:'double'},${level},()=>${chance-.001}).type`),'double');
    assert.notEqual(h.run(`simulateAiDart({value:20,label:'D10',type:'double'},${level},()=>${chance}).type`),'double');
    assert.notEqual(h.run(`simulateAiDart({value:60,label:'T20',type:'triple'},${level},()=>${chance-.001}).type`),'triple');
  }
});
test('AI checkout display follows revealed darts, disappears on bust and stays hidden during starting selection',()=>{
  const h=harness();startAi(h);
  h.run('state.activeGame.currentIndex=1;state.activeGame.players[1].remaining=40;state.activeGame.checkout="straight";aiPlayback={key:`${state.activeGame.id}:${state.activeGame.revision}`,darts:[{value:20,label:"20",type:"single"},{value:20,label:"20",type:"single"}],revealed:0}');
  assert.match(h.run('renderAiTurn(state.activeGame)'),/20 → 20/);
  h.run('aiPlayback.revealed=1');
  assert.match(h.run('renderAiTurn(state.activeGame)'),/<strong>20<\/strong>/);
  h.run('aiPlayback.revealed=2');
  assert.doesNotMatch(h.run('renderAiTurn(state.activeGame)'),/Checkout möglich/);
  h.run('aiPlayback.darts=[{value:60,label:"T20",type:"triple"}];aiPlayback.revealed=1');
  assert.doesNotMatch(h.run('renderAiTurn(state.activeGame)'),/Checkout möglich/);
  h.run('aiPlayback.revealed=0;state.activeGame.startSelection={round:1}');
  assert.doesNotMatch(h.run('renderAiTurn(state.activeGame)'),/Checkout möglich/);
});
test('family reset retains usable AI defaults',()=>{
  const h=harness();
  h.run('resetLocalFamilyState("TEST-FAMILY");state.players=[createPlayer("Lokaler Test",colors[0])];state.setup.selectedPlayerIds=[state.players[0].id];state.setup.aiEnabled=true;startGame()');
  assert.equal(h.run('state.activeGame.players[1].aiLevel'),3);
});
test('all levels exhaust their name pool before reuse, including reload', () => {
  const h = harness();
  for (let level = 1; level <= 7; level++) {
    const names = h.json(`Array.from({length:20},()=>createAiPlayer(${level}).name)`);
    assert.equal(new Set(names).size, 20);
    h.run('saveState()');
    const restored = harness(h.storage.get('dartabend.local.v1'));
    assert.notEqual(restored.run(`createAiPlayer(${level}).name`), names.at(-1));
  }
});
test('AI turns auto-complete once, block manual darts and ignore stale callbacks', () => {
  const h = harness(); startAi(h);
  h.run('addDart(20,"20","single");submitRound()');
  assert.equal(h.run('isAiTurn(state.activeGame)'), true);
  h.run('addDart(60,"T20","triple");submitRound();undo()');
  assert.equal(h.run('state.activeGame.currentThrows.length'), 0);
  h.tick(350); h.tick(500); h.tick(500); h.tick(500);
  assert.equal(h.run('state.activeGame.currentIndex'), 0);
  const revision = h.run('state.activeGame.revision');
  h.run('finishAiTurn()');
  assert.equal(h.run('state.activeGame.revision'), revision);
  h.run('addDart(20,"20","single");submitRound();leaveGame()');
  h.tick(350);h.tick(500);
  assert.equal(h.run('state.activeGame'), null);
});
test('human victories count normally, AI level survives normalization and AI hits stay out of global records', () => {
  const h=harness();startAi(h,7);
  h.run('state.activeGame.players[1].dartCounts={T20:99};state.activeGame.players[0].remaining=20;addDart(20,"20","single")');
  assert.equal(h.run('getStats().get(state.players[0].id).wins'),1);
  assert.equal(h.run('getStats().get(state.players[0].id).points'),3);
  assert.equal(h.run('getGlobalFeaturedCounts().T20'),0);
  assert.equal(h.run('normalizeLocalMatch(state.matches[0]).players[1].aiLevel'),7);
  assert.match(h.run('renderHistoryRow(state.matches[0])'),/KI Stufe 7/);
  assert.equal(h.run('state.players.length'),2);
});
test('AI victories count as human losses and cannot be edited as human darts',()=>{
  const h=harness();startAi(h);
  h.run('addDart(20,"20","single");submitRound();state.activeGame.players[1].remaining=20;aiPlayback.darts=[{value:20,label:"20",type:"single"}];finishAiTurn()');
  assert.equal(h.run('getStats().get(state.players[0].id).losses'),1);
  assert.equal(h.run('state.activeGame.checkoutEdit'),null);
  h.run('addDart(1,"1","single")');
  assert.equal(h.run('state.matches.length'),1);
});
test('plan is stable across reload and observer devices cannot submit a second AI turn',()=>{
  const h=harness();startAi(h);
  h.run('addDart(20,"20","single");submitRound()');
  const plan=h.json('planAiTurn(state.activeGame)');
  h.run('saveState()');
  const restored=harness(h.storage.get('dartabend.local.v1'));
  assert.deepEqual(restored.json('planAiTurn(state.activeGame)'),plan);
  assert.equal(h.run('normalizeRemoteActiveGame(prepareActiveGameForRemote(state.activeGame)).aiOwnerId'),h.run('DEVICE_ID'));
  h.run('state.activeGame.aiOwnerId="other-device";finishAiTurn()');
  assert.equal(h.run('state.activeGame.currentIndex'),1);
});
test('DartMix never receives an AI opponent and no human means no start',()=>{
  const h=harness();
  h.run('state.setup.aiEnabled=true;state.setup.selectedPlayerIds=[];startGame()');
  assert.equal(h.run('state.activeGame'),null);
  for(const mode of ['restjagd','dartroulette']){
    h.run(`state.setup.mode="${mode}";state.setup.selectedPlayerIds=[state.players[0].id];startGame()`);
    assert.equal(h.run('state.activeGame.players.length'),1);
    h.run('leaveGame()');
  }
});
test('seven levels have increasing scoring strength and every simulated turn obeys checkout rules',()=>{
  const h=harness();startAi(h);
  const averages=h.json(`AI_LEVELS.map((_,index)=>{
    const game=state.activeGame;game.currentIndex=1;game.players[1].aiLevel=index+1;
    let total=0;
    for(let n=0;n<3000;n++) {game.id='sample-'+n;game.players[1].remaining=501;total+=planAiTurn(game).reduce((sum,d)=>sum+d.value,0)}
    return total/3000;
  })`);
  console.log('AI scoring averages',averages.map(n=>n.toFixed(1)).join(', '));
  const ranges=[[15,25],[25,35],[35,45],[45,60],[60,75],[75,90],[90,105]];
  averages.forEach((average,i)=>assert.ok(average>=ranges[i][0]&&average<=ranges[i][1],`${i+1}: ${average}`));
  assert.equal(h.run(`(()=>{const game=state.activeGame;for(const checkout of ['straight','double'])for(let rest=2;rest<=180;rest++){
    game.checkout=checkout;game.players[1].remaining=rest;const darts=planAiTurn(game);
    game.currentThrows=darts;const result=evaluateTurn(game);
    if(darts.length<1||darts.length>3||result.usedDarts.length!==darts.length)return false;
    if(result.finished&&checkout==='double'&&!['double','bullseye'].includes(darts.at(-1).type))return false;
  }return true})()`),true);
});
test('every level can finish 301 and 501 under either checkout rule, including after busts',()=>{
  const h=harness();startAi(h);
  assert.equal(h.run(`(()=>{
    for(let level=1;level<=7;level++)for(const startScore of [301,501])for(const checkout of ['straight','double']){
      const game=createGame([createAiPlayer(level)],{startScore,checkout});game.id='complete-'+level+'-'+startScore+'-'+checkout;
      let finished=false;
      for(let turn=0;turn<2000;turn++){
        game.currentThrows=planAiTurn(game);const result=evaluateTurn(game);game.revision++;
        if(!result.bust)game.players[0].remaining=result.remaining;
        if(result.finished){finished=true;break}
      }
      if(!finished)return false;
    }
    return true;
  })()`),true);
});
