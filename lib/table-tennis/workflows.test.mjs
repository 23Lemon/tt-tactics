import assert from "node:assert/strict"
import test from "node:test"
import { openingKey, SERVE_DISTANCE, serveShot, validateSteps } from "./catalog.mjs"
import { contactFor, COURT, secondLanding, serveOrigin, simulateReturn, simulateServe, spinDescription } from "./physics.mjs"
import { assessStroke, findIdeas, optionsFor } from "./tactics.mjs"
import { exportRoutine, importRoutine } from "./sharing.mjs"

const hands = { hand: "right", myHand: "left" }
const serve = serveShot("hook", "sideUnder", "bh-short")
test("opponent receive preferences affect only opponent serve returns and suggested branches", () => {
  const ball = simulateServe(serve, "me", hands)
  const limited = optionsFor(ball, hands, ["push"])
  assert.ok(limited.length)
  assert.ok(limited.every(x => x.tech.endsWith("PushControl")))
  assert.ok(optionsFor(ball, hands, []).some(x => !x.tech.endsWith("PushControl")))
  const mine = simulateServe(serve, "opponent", hands)
  assert.deepEqual(optionsFor(mine, hands), optionsFor(mine, hands, ["push"]))
  const branches = findIdeas("serve", hands, serve, [], ["push"]).branches
  assert.ok(branches.length)
  assert.ok(branches.every(r => r.steps[1].tech.endsWith("PushControl")))
  const longUnder = simulateServe(serveShot("plain","under","fh-long"),"me",hands)
  assert.deepEqual(optionsFor(longUnder,hands,["banana"]), [])
})
test("the floor projection continues beyond the edge, preserving a real on-table second bounce", () => {
  const long = simulateServe(serveShot("plain","under","fh-long"),"me",hands)
  const outside = secondLanding(long)
  assert.equal(outside.floor,true)
  assert.ok(Math.abs(outside.point[1]) > 1.37)
  assert.ok(Math.abs(outside.point[2] + .74) < 1e-7)
  const short = simulateServe(serveShot("plain","under","mid-short"),"me",hands)
  assert.equal(secondLanding(short).floor,false)
  assert.deepEqual(secondLanding(short).point,short.follow.hit.p)
})
test("a slow high neutral ball can be punched on the backhand, a low one cannot", () => {
  const ball = { valid:true, short:false, top:42, side:0, pace:3, lane:"bh", apex:{height:.28} }
  assert.equal(spinDescription(ball),"弱上旋")
  assert.ok(assessStroke(ball,"bhPunch").allowed)
  assert.ok(!assessStroke({...ball,apex:{height:.12}},"bhPunch").allowed)
  assert.ok(!assessStroke(ball,"bhSideCut").allowed)
})
test("portable routines round trip placement, hands, category and optional notes, dropping identity", () => {
  const original = { ...hands, title:"反手起板", status:"using", mode:"serve", category:"周五球友", note:"个人笔记",
    owner:"private", id:"server-id", revision:5, steps:[serve,{tech:"bhPushControl",zone:"bh-long",point:{lateral:-.7,depth:.85}},{tech:"bhHighUnder",zone:"fh-long"}] }
  const parsed = importRoutine(exportRoutine(original,true))
  assert.deepEqual(parsed.steps, original.steps)
  assert.equal(parsed.category,original.category)
  assert.equal(parsed.note,original.note)
  assert.equal(parsed.myHand,"left")
  assert.equal(importRoutine(exportRoutine(original)).note,"")
  assert.ok(!("owner" in parsed || "id" in parsed || "revision" in parsed))
  const data = JSON.parse(exportRoutine(original))
  assert.throws(() => importRoutine(JSON.stringify({...data,version:99})))
  data.routine.steps[1].tech="unknown"
  assert.throws(() => importRoutine(JSON.stringify(data)))
  assert.throws(() => importRoutine("{"))
})

test("stance depth moves the contact origin on either end and survives sharing", () => {
  const { distance, ...legacy } = serve
  const old = [legacy, {tech:"bhPushControl",zone:"bh-long"}, {tech:"bhHighUnder",zone:"mid-long"}]
  assert.equal(validateSteps("serve",old)[0].distance, SERVE_DISTANCE.default)
  assert.equal(openingKey("serve",hands,legacy), openingKey("serve",hands,serve))
  for (const actor of ["me","opponent"]) {
    const near = simulateServe({...serve,distance:25}, actor, hands)
    const far = simulateServe({...serve,distance:45}, actor, hands)
    assert.ok(near.valid && far.valid)
    assert.ok(Math.abs(Math.abs(serveOrigin({...serve,distance:45},actor,hands)[1]) - COURT.halfLength - .25) < 1e-10)
    assert.ok(Math.abs(Math.abs(near.points[0].p[1]-far.points[0].p[1])-.20) < 1e-10)
    assert.notDeepEqual(near.contact.v,far.contact.v)
  }
  const item = { ...hands, title:"中近台", status:"practice", mode:"serve", steps:[{...serve,distance:37},...old.slice(1)] }
  assert.equal(importRoutine(exportRoutine(item)).steps[0].distance,37)
  assert.notEqual(openingKey("serve",hands,legacy),openingKey("serve",hands,item.steps[0]))
  for (const bad of [24,46,null,"30",30.5]) assert.equal(validateSteps("serve",[{...serve,distance:bad},...old.slice(1)]),null)
})

test("height at the hitting window separates low float, high light backspin and low heavy backspin", () => {
  const h = {myHand:"right",hand:"right"}
  for (const [family,spin,point] of [["plain","dead",{depth:.4,lateral:.47}],["hook","side",{depth:.2,lateral:.8}]]) {
    const low = simulateServe(serveShot(family,spin,"fh-short","heavy",-1,point), "me",h)
    assert.ok(low.short && contactFor(low,"fhFlip").p[2] < COURT.net)
    assert.equal(optionsFor(low,h)[0].tech,"fhTouch")
    assert.ok(assessStroke(low,"fhFlip").conditional)
  }
  const light = simulateServe(serveShot("plain","under","fh-short","light"), "me",h)
  const heavy = simulateServe(serveShot("plain","under","fh-short","heavy"), "me",h)
  assert.equal(optionsFor(light,h)[0].tech,"fhFlip")
  assert.equal(optionsFor(heavy,h)[0].tech,"fhTouch")
  assert.ok(optionsFor(heavy,h).find(o=>o.tech==="fhFlip")?.conditional)
})

test("both deep backhand returns precede the short touch for a typical forehand-short hook serve", () => {
  for (const myHand of ["right","left"]) for (const hand of ["right","left"]) {
    const matchup = { myHand, hand }
    for (const actor of ["me","opponent"]) {
      const ball = simulateServe(serveShot("hook","sideUnder","fh-short"), actor, matchup)
      const choices = optionsFor(ball,matchup)
      assert.deepEqual(choices.slice(0,3).map(o => [o.tech,o.zone]), [
        ["fhPushControl","bh-long"], ["fhPush","bh-long"], ["fhTouch","mid-short"],
      ])
      for (const choice of choices.slice(0,2)) {
        const reply = simulateReturn(ball,choice,ball.receiver,matchup)
        assert.ok(reply.valid && !reply.short && reply.top < -10)
        assert.equal(reply.zone,"bh-long")
        assert.match(optionsFor(reply,matchup)[0].tech,/Under|^pivot/)
      }
      if (actor === "me") assert.equal(optionsFor(ball,matchup,["touch"])[0].tech,"fhTouch")
    }
  }
})

test("a precise short forehand landing does not promote a strongly sidespinning hook serve to a flick opportunity", () => {
  const hands = { myHand: "right", hand: "right" }
  const ball = simulateServe(serveShot("hook", "sideUnder", "fh-short", "medium", -1, { lateral: .64, depth: .18 }), "me", hands)
  const choices = optionsFor(ball, hands)
  assert.deepEqual(choices.slice(0, 2).map(o => [o.tech, o.zone]), [["fhPushControl", "bh-long"], ["fhPush", "bh-long"]])
  assert.ok(choices.some(o => o.tech === "fhFlip"))
})

test("strong lateral spin rules out the weak-spin punch and slow soft topspin needs active power", () => {
  const high = { valid:true, short:false, lane:"bh", pace:3.2, top:40, apex:{height:.26} }
  for (const side of [-240, 240]) {
    const ball = { ...high, side }
    assert.equal(assessStroke(ball, "bhPunch").allowed, false)
    assert.equal(optionsFor(ball, hands)[0].tech, "bhLoopTop")
  }
  assert.ok(assessStroke({ ...high, top:92, side:5 }, "bhBlock").conditional)
})

test("an opponent preference cannot turn a conditional reach into a priority", () => {
  const ball = simulateServe(serveShot("hook", "sideUnder", "fh-short"), "me", hands)
  const choices = optionsFor(ball, hands, ["banana"])
  assert.ok(choices.length && choices.every(o => o.conditional && !o.priority))
  assert.ok(optionsFor(ball, hands)[0].priority)
})
