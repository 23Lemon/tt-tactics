import assert from "node:assert/strict"
import test from "node:test"
import { SERVES, STROKES, other, serveShot } from "./catalog.mjs"
import { analyze, simulateReturn, simulateServe, spinAt, spinDescription, verticalSpin } from "./physics.mjs"
import { assessStroke, optionsFor } from "./tactics.mjs"

const rightHands = { myHand: "right", hand: "right" }
const matchups = ["right", "left"].flatMap(myHand => ["right", "left"].map(hand => ({ myHand, hand })))
const assertUnder = (result, label) => {
  assert.equal(verticalSpin(result), "under", label)
  assert.match(spinDescription(result), /下旋$/, label)
  // Verify the physical state, not just a technique-derived display label.
  assert.ok(spinAt(result.points[0]).top < 0, label)
  assert.ok(spinAt(result.contact).top < -10, label)
  assert.deepEqual({ top: result.top, side: result.side }, spinAt(result.contact))
}

test("hook backspin to forehand short, pushed to backhand long, remains backspin for every hand and mode", () => {
  for (const hands of matchups) for (const actor of ["me", "opponent"])
    for (const strength of ["light", "medium", "heavy"]) for (const pace of ["slow", "normal", "fast"]) {
      const label = JSON.stringify({ hands, actor, strength, pace })
      const serve = simulateServe({ ...serveShot("hook", "sideUnder", "fh-short", strength), pace }, actor, hands)
      const result = simulateReturn(serve, { tech: "fhPushControl", zone: "bh-long" }, other(actor), hands)
      assert.ok(result.valid, label)
      assert.equal(result.zone, "bh-long", label)
      assertUnder(result, label)
      const next = optionsFor(result, hands).map(x => x.tech)
      assert.ok(next.some(tech => /Under/.test(tech)), label)
      for (const tech of ["bhLoopTop", "bhDrive", "bhCounter", "bhBlock", "bhPunch"])
        assert.equal(assessStroke(result, tech).allowed, false, label + tech)
    }
})

test("controls and attacking returns preserve their spin roles across serve families, lengths and speeds", t => {
  let controls = 0, attacks = 0, unresolved = 0, missed = 0
  const techniques = ["fhTouch", "bhTouch", "fhPushControl", "bhPushControl", "fhPush", "bhPush",
    "fhHighUnder", "bhHighUnder", "fhRushUnder", "bhRushUnder", "fhFlip", "bhFlip", "banana"]
  for (const [family, { spins }] of Object.entries(SERVES)) for (const spin of spins.filter(x => /under/i.test(x)))
    for (const strength of ["light", "medium", "heavy"]) for (const pace of ["slow", "normal", "fast"])
      for (const zone of ["fh-short", "bh-short", "fh-long", "bh-long"]) {
        const serve = simulateServe({ ...serveShot(family, spin, zone, strength), pace }, "me", rightHands)
        assert.ok(serve?.valid, JSON.stringify({ family, spin, strength, pace, zone }))
        for (const tech of techniques.filter(tech => assessStroke(serve, tech).allowed)) {
          const stroke = STROKES[tech]
          const targets = stroke.kind === "short" ? ["fh-short", "mid-short", "bh-short"] : ["fh-long", "mid-long", "bh-long"]
          for (const target of targets) {
            const result = simulateReturn(serve, { tech, zone: target }, "opponent", rightHands)
            const label = JSON.stringify({ family, spin, strength, pace, zone, tech, target })
            if (!result.valid) {
              if (result.status === "unresolved") { unresolved++; assert.deepEqual(optionsFor(result, rightHands), [], label) }
              else missed++
              continue
            }
            if (stroke.spin < 0) { controls++; assertUnder(result, label) }
            else { attacks++; assert.equal(verticalSpin(result), "top", label) }
          }
        }
      }
  // Ensure the matrix actually exercises successful controls and attacks, rather
  // than passing vacuously by marking all difficult strokes unavailable.
  assert.ok(controls > 1500)
  assert.ok(attacks > 800)
  t.diagnostic(JSON.stringify({ controls, attacks, unresolved, missed }))
})

test("successive pushes keep the third/fourth board in the backspin branch", () => {
  const steps = [serveShot("hook", "sideUnder", "fh-short", "heavy"),
    { tech: "fhPushControl", zone: "bh-long" }, { tech: "bhPushControl", zone: "fh-long" },
    { tech: "fhHighUnder", zone: "bh-long" }]
  for (const mode of ["serve", "receive"]) for (const hands of matchups) {
    const results = analyze(mode, hands, steps)
    assert.ok(results.every(result => result.valid), JSON.stringify({ mode, hands }))
    assertUnder(results[1], mode)
    assertUnder(results[2], mode)
    assert.equal(verticalSpin(results[3]), "top")
  }
})

test("weak backspin is not hidden by strong sidespin or mistaken for neutral", () => {
  for (const side of [-240, 0, 240]) {
    const ball = { valid: true, short: false, lane: "fh", pace: 4, top: -18, side }
    assert.equal(verticalSpin(ball), "under")
    assert.match(spinDescription(ball), /下旋$/)
    assert.equal(assessStroke(ball, "fhLoopTop").allowed, false)
    assert.ok(assessStroke(ball, "fhHighUnder").allowed)
    assert.equal(verticalSpin({ ...ball, top: 0 }), "neutral")
    assert.ok(assessStroke({ ...ball, top: 0 }, "fhLoopTop").allowed)
  }
})

test("a solver miss cannot masquerade as a successful under-spin touch", () => {
  const serve = simulateServe(serveShot("plain", "under", "bh-short", "heavy"), "me", rightHands)
  const result = simulateReturn(serve, { tech: "bhTouch", zone: "bh-short" }, "opponent", rightHands)
  assert.equal(result.valid, false)
  assert.equal(result.status, "unresolved")
  assert.ok(result.issue)
  assert.deepEqual(optionsFor(result, rightHands), [])
})
