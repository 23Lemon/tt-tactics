import assert from "node:assert/strict"
import test from "node:test"
import { forehand, openingKey, pointZone, servePositionName, serveShot, serveSpinName, shotActor, validateSteps } from "./catalog.mjs"
import { analyze, COURT, secondBounceDescription, serveOrigin, simulateReturn, simulateServe, targetPoint, verticalSpin } from "./physics.mjs"
import { findIdeas, optionsFor } from "./tactics.mjs"

const rightHands = { myHand: "right", hand: "right" }
const screenshotServe = serveShot("hook", "sideUnder", "fh-short", "heavy", -.75, { lateral: .797, depth: .125 })
const incoming = simulateServe(screenshotServe, "me", rightHands)
const choices = (ball, hands = rightHands) => optionsFor(ball, hands).map(({ tech }) => tech)

test("a forehand touch can land short and still go out sideways with mostly sidespin", () => {
  const touch = { tech: "fhTouch", zone: "fh-short", point: { lateral: .629, depth: .287 } }
  const result = simulateReturn(incoming, touch, "opponent", rightHands)
  assert.equal(result.zone, "fh-short")
  assert.equal(result.short, false)
  assert.equal(secondBounceDescription(result), "二跳出台 · 侧边")
  assert.equal(verticalSpin(result), "neutral")
  assert.ok(Math.abs(result.side) >= 50)
  assert.deepEqual(new Set(choices(result)), new Set(["fhLoopTop"]))
  const next = optionsFor(result, rightHands)[0]
  assert.ok(validateSteps("serve", [screenshotServe, touch, next]))
  const reply = simulateReturn(result, next, "me", rightHands)
  assert.deepEqual(reply.points, simulateReturn(result, { ...next, tech: "fhLoopNeutral" }, "me", rightHands).points)
  assert.ok(reply.valid)
  assert.ok(Math.abs(reply.points[0].p[0]) > COURT.halfWidth)
  assert.ok(Math.abs(reply.points[0].p[1]) < COURT.halfLength)
})

test("side-exiting backspin leads to a lift while an endline exit keeps its own label", () => {
  const side = simulateReturn(incoming, {
    tech: "fhPushControl", zone: "fh-short", point: { lateral: .94, depth: .40 },
  }, "opponent", rightHands)
  const end = simulateReturn(incoming, { tech: "fhPushControl", zone: "fh-long" }, "opponent", rightHands)
  assert.equal(side.zone, "fh-short")
  assert.equal(secondBounceDescription(side), "二跳出台 · 侧边")
  assert.equal(verticalSpin(side), "under")
  assert.deepEqual(new Set(choices(side)), new Set(["fhHighUnder", "fhRushUnder"]))
  assert.equal(secondBounceDescription(end), "二跳出台 · 底线")
  assert.equal(verticalSpin(end), "under")
  assert.ok(choices(end).includes("fhPushControl"))
})

test("a forehand touch whose second bounce stays on the table offers in-table forehand choices", () => {
  const serve = simulateServe(serveShot("hook", "sideUnder", "fh-short"), "me", rightHands)
  const result = simulateReturn(serve, { tech: "fhTouch", zone: "fh-short" }, "opponent", rightHands)
  assert.equal(secondBounceDescription(result), "二跳留台")
  assert.deepEqual(choices(result), ["fhTouch", "fhPush", "fhFlip"])
})

test("the shape and pressure of forehand topspin change the first recommendation", () => {
  for (const [tech, wanted] of [["fhHighUnder", "fhCounter"], ["fhRushUnder", "fhDrive"], ["fhBlock", "fhLoopTop"]]) {
    const result = simulateReturn(incoming, { tech, zone: "fh-long" }, "opponent", rightHands)
    assert.equal(verticalSpin(result), "top")
    assert.equal(result.zone, "fh-long")
    assert.equal(choices(result)[0], wanted)
  }
  const neutral = { valid: true, lane: "fh", short: false, top: 105, side: 0, pace: 5.2 }
  assert.equal(choices(neutral)[0], "fhLoopTop")
  assert.equal(choices({ ...neutral, tech: "fhRushUnder" })[0], "fhDrive")
  assert.equal(choices({ ...neutral, tech: "fhHighUnder" })[0], "fhCounter")
  assert.equal(choices({ ...neutral, tech: "fhRushUnder", pace: 9 })[0], "fhBlock")
})

const matchups = ["right", "left"].flatMap(myHand => ["right", "left"].map(hand => ({ myHand, hand })))

test("serve and receive routines stay valid through the third and fourth boards for all matchups", () => {
  const serve = serveShot("hook", "sideUnder", "fh-short")
  for (const mode of ["serve", "receive"]) {
    for (const hands of matchups) {
      const { steps } = findIdeas(mode, hands, serve, []).branches[0]
      assert.equal(steps.length, mode === "receive" ? 4 : 3)
      assert.ok(validateSteps(mode, steps))
      for (const [index, result] of analyze(mode, hands, steps).entries()) {
        assert.ok(result.valid)
        const receiver = shotActor(mode, index + 1)
        assert.equal(result.zone, pointZone({
          lateral: result.landing[0] * forehand(receiver, hands) / COURT.halfWidth,
          depth: Math.abs(result.landing[1]) / COURT.halfLength,
        }))
      }
    }
  }
})

test("the side stance includes the first quarter of the table width", () => {
  assert.equal(servePositionName(-1), "侧身位")
  assert.equal(servePositionName(-.50), "侧身位")
  assert.equal(servePositionName(-.49), "中间位")
})

test("stance, forehand targets, and sidespin follow the individual hitter or receiver", () => {
  const reference = serveShot("pendulum", "sideUnder", "fh-short")
  for (const hands of matchups) {
    for (const actor of ["me", "opponent"]) {
      const left = (actor === "me" ? hands.myHand : hands.hand) === "left"
      const near = actor === "me"
      const forehandRightOnScreen = near !== left
      assert.equal(serveSpinName(reference, actor, hands), left ? "右侧下旋" : "左侧下旋")
      assert.equal(serveSpinName({ ...reference, family: "hook" }, actor, hands), left ? "左侧下旋" : "右侧下旋")
      assert.equal(serveOrigin(reference, actor, hands)[0] < 0, forehandRightOnScreen)
      const target = targetPoint("fh-short", actor, hands, { lateral: .64, depth: .22 })
      assert.equal(target[0] > 0, forehandRightOnScreen)
      assert.equal(target[1] < 0, near)
    }
    const forehandBall = { valid: true, lane: "fh", short: false, top: 105, side: 0, pace: 5.2 }
    assert.equal(optionsFor(forehandBall, hands)[1].zone, hands.myHand === hands.hand ? "fh-long" : "bh-long")
    assert.equal(optionsFor({ ...forehandBall, lane: "bh" }, hands)[1].zone, hands.myHand === hands.hand ? "bh-long" : "fh-long")
  }
  assert.equal(openingKey("serve", { hand: "left" }, reference),
    openingKey("serve", { myHand: "right", hand: "left" }, reference))
  assert.notEqual(openingKey("serve", rightHands, reference),
    openingKey("serve", { myHand: "left", hand: "right" }, reference))
})

test("flipping both hands mirrors the serve and sidespin returns including fixed-paddle comparisons", () => {
  const steps = [
    serveShot("hook", "sideUnder", "mid-short", "medium", -.72, { lateral: -.15, depth: .32 }),
    { tech: "banana", zone: "mid-long" },
    { tech: "bhSideCut", zone: "mid-long" },
    { tech: "bhHighUnder", zone: "bh-long" },
  ]
  for (const mode of ["serve", "receive"]) {
    for (const hand of ["right", "left"]) {
      const right = { myHand: "right", hand }
      const left = { myHand: "left", hand: hand === "right" ? "left" : "right" }
      const route = steps.slice(0, mode === "serve" ? 3 : 4)
      for (const adjustment of ["read", "fixed"]) {
        const first = analyze(mode, right, route, adjustment, route.length - 1)
        const mirrored = analyze(mode, left, route, adjustment, route.length - 1)
        for (const [index, ball] of first.entries()) {
          assert.ok(ball?.valid || (adjustment === "fixed" && index === route.length - 1))
          const otherBall = mirrored[index]
          assert.equal(ball?.status, otherBall?.status)
          if (!ball?.landing) continue
          assert.equal(ball.zone, otherBall.zone)
          assert.equal(ball.exit?.edge, otherBall.exit?.edge)
          assert.ok(Math.abs(ball.landing[0] + otherBall.landing[0]) < 1e-3)
          assert.ok(Math.abs(ball.landing[1] - otherBall.landing[1]) < 1e-3)
          assert.ok(Math.abs(ball.side + otherBall.side) < .01)
          assert.ok(Math.abs(ball.top - otherBall.top) < .01)
        }
      }
    }
  }
})
