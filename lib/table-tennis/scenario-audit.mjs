import assert from "node:assert/strict";
import { SERVES, STROKES, ZONES, serveShot } from './catalog.mjs';
import { simulateServe, simulateReturn, verticalSpin } from './physics.mjs';
import { optionsFor } from './tactics.mjs';
let total=0, valid=0, optionCount=0, invalid=[], empty=[], bad=[];
for(const myHand of ['right','left'])for(const hand of ['right','left'])for(const actor of ['me','opponent']){
 const hands={myHand,hand};
 for(const [family,{spins}] of Object.entries(SERVES))for(const spin of spins)for(const {id:zone} of ZONES){
  total++;const shot=serveShot(family,spin,zone);const ball=simulateServe(shot,actor,hands);const label=[myHand,hand,actor,family,spin,zone].join('/');
  if(!ball?.valid){invalid.push(label);continue;} valid++;
  const opts=optionsFor(ball,hands);optionCount+=opts.length;if(!opts.length)empty.push({label,short:ball.short,top:ball.top,pace:ball.pace,exit:ball.exit?.edge});
  for(const o of opts){
   const r=simulateReturn(ball,o,ball.receiver,hands);
   if(!r?.valid)bad.push({label,tech:o.tech});
   if(r?.valid && verticalSpin(ball)==='under' && ['short','push'].includes(STROKES[o.tech].kind))
    assert.equal(verticalSpin(r),'under',label+'/'+o.tech+' must retain backspin');
  }
 }
}
console.log(JSON.stringify({total,valid,optionCount,invalid,empty,bad},null,2));

assert.deepEqual(invalid, [], "Invalid standard serve presets");
assert.deepEqual(empty, [], "Standard serve without a feasible response");
assert.deepEqual(bad, [], "Suggested response fails simulation");
