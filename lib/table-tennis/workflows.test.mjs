import assert from "node:assert/strict"
import test from "node:test"
import { serveShot } from "./catalog.mjs"
import { secondLanding, simulateServe, spinDescription } from "./physics.mjs"
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
