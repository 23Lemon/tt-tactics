import assert from "node:assert/strict"
import test from "node:test"
import { SERVES, SERVE_POSITION_LIMITS, pointZone, serveShot, openingKey, shotName, validateSteps } from "./catalog.mjs"
import { bounce, contactFor, COURT, freeFlight, simulateServe, spinAt } from "./physics.mjs"

const hands = { myHand: "right", hand: "right" }
const energy = b => b.v.reduce((sum, x) => sum + x * x, 0) + (2 / 3) * .02 ** 2 * b.w.reduce((sum, x) => sum + x * x, 0)

test("table bounce dissipates total energy and vertical sidespin cannot itself kick the ball sideways", () => {
  for (const top of [-500, 0, 500]) for (const side of [-500, 0, 500]) {
    const ball = { p: [0, .4, .02], v: [0, 6, -2], w: [top, 0, side] }
    const after = bounce(ball)
    assert.ok(after.v[2] > 0)
    assert.ok(energy(after) <= energy(ball) + 1e-8)
    assert.equal(after.v[0], 0)
    assert.equal(after.w[2], side)
  }
})

test("sidespin bends flight in mirrored directions rather than an invented table kick", () => {
  const initial = { p: [0, .3, .4], v: [0, 4, 1], w: [0, 0, 240] }
  const a = freeFlight(initial).hit, b = freeFlight({ ...initial, w: [0, 0, -240] }).hit
  assert.ok(Math.abs(a.p[0]) > .005)
  assert.ok(Math.abs(a.p[0] + b.p[0]) < 1e-9)
  assert.ok(Math.abs(a.p[1] - b.p[1]) < 1e-9)
})

test("incoming spin is sampled after the bounce and contact stays before the next bounce", () => {
  const serve = simulateServe(serveShot("plain", "under", "fh-long"), "me", hands)
  assert.deepEqual({ top: serve.top, side: serve.side }, spinAt(serve.contact))
  assert.notEqual(serve.top, serve.beforeBounce.top)
  const contact = contactFor(serve, "fhHighUnder")
  assert.ok(contact.available)
  assert.ok(contact.t < serve.follow.hit.t)
  assert.ok(contact.height > .015)
})

test("standard short and deep serves favor opposite halves of the server's side for their first bounce", () => {
  const cases = [
    ["topspin", "top", "mid"], ["hook", "side", "bh"],
    ["plain", "dead", "fh"], ["reverse", "sideUnder", "fh"],
  ]
  for (const [actor, match] of [["me", hands], ["opponent", { myHand: "left", hand: "right" }]]) {
    for (const [family, spin, lane] of cases) {
      const short = simulateServe(serveShot(family, spin, lane + "-short"), actor, match)
      const long = simulateServe(serveShot(family, spin, lane + "-long"), actor, match)
      const label = [actor, family, spin, lane].join("/")
      assert.ok(short.valid && short.short && long.valid && !long.short, label)
      assert.ok(Math.abs(short.serviceBounce[1]) < COURT.halfLength / 2, label)
      assert.ok(COURT.halfLength - Math.abs(long.serviceBounce[1]) < .15, label)
    }
  }
})

test("fast deep placements use both end lines, gain speed and clear the net lower", () => {
  const point = { lateral: .886, depth: .912 }
  const families = [["hook", "sideTop"], ["pendulum", "sideUnder"], ["topspin", "dead"], ["topspin", "top"]]
  for (const [actor, match] of [["me", hands], ["opponent", { myHand: "right", hand: "left" }]]) {
    for (const [family, spin] of families) for (const distance of [25, 30, 45]) {
      let previous
      for (const pace of ["slow", "normal", "fast"]) {
        const shot = serveShot(family, spin, "fh-long", "heavy", -.48, point, pace, distance)
        const ball = simulateServe(shot, actor, match)
        const label = [actor, family, spin, distance, pace].join("/")
        assert.ok(ball.valid && !ball.short && ball.targetError < .001, label)
        const inset = COURT.halfLength - Math.abs(ball.serviceBounce[1])
        const speed = Math.hypot(...ball.points[0].v)
        const duration = ball.points.find(state => state.p === ball.serviceBounce).t + ball.flightTime
        assert.ok(inset > .02 && inset < (pace === "slow" ? .20 : .13), label)
        assert.ok(ball.net.clearance > 0 && ball.net.clearance < .08, label)
        if (previous) {
          assert.ok(inset < previous.inset && ball.net.clearance < previous.clearance, label)
          assert.ok(speed > previous.speed && duration < previous.duration, label)
        }
        previous = { inset, speed, duration, clearance: ball.net.clearance }
      }
    }
  }
})

test("moving a selected landing across the short/long line changes the physical arc continuously", () => {
  for (const [family, spin, actor, match] of [
    ["pendulum", "side", "me", hands],
    ["hook", "sideTop", "opponent", { myHand: "right", hand: "left" }],
    ["pendulum", "sideUnder", "me", hands], ["topspin", "dead", "me", hands],
  ]) {
    let previous
    // Actual millimetres on the receiving half. Include the netward and deep
    // ends of the transition, the 685 mm zone boundary and the reported line.
    for (let mm = 300; mm <= 1160; mm++) {
      const point = { lateral: .04, depth: mm / (1000 * COURT.halfLength) }
      const shot = serveShot(family, spin, pointZone(point), "medium", -.96, point)
      const ball = simulateServe(shot, actor, match)
      const label = [family, spin, actor, mm].join("/")
      assert.ok(ball.valid && ball.targetError < .001 && ball.net.clearance > 0, label)
      if (previous) {
        assert.ok(Math.hypot(...ball.serviceBounce.map((v, i) => v - previous.serviceBounce[i])) < .004, label)
        assert.ok(Math.abs(ball.flightTime - previous.flightTime) < .003, label)
        assert.ok(Math.abs(ball.net.clearance - previous.net.clearance) < .001, label)
        assert.ok(Math.abs(ball.points[0].w[2] - previous.points[0].w[2]) < .01, label)
      }
      previous = ball
    }
  }
})

test("an outside sideline contact cannot shift a deep corner serve for an in-table stance", () => {
  const shot = serveShot("hook", "sideTop", "fh-long", "medium", -.48, { lateral: .886, depth: .912 })
  const outside = simulateServe({ ...shot, position: SERVE_POSITION_LIMITS.min }, "me", hands)
  assert.equal(outside.valid, false)
  assert.match(outside.issue, /边线/)
  assert.equal(outside.follow, null)
  assert.equal(outside.landing, undefined)
  for (const position of [-.98, -.48, 0, .50]) {
    const ball = simulateServe({ ...shot, position }, "me", hands)
    assert.ok(ball.valid && ball.targetError < .001)
    assert.ok(COURT.halfLength - Math.abs(ball.serviceBounce[1]) < .13)
  }
})

test("changing lateral serve position keeps the aimed bounce and the physical trajectory continuous", () => {
  const scenarios = [
    [serveShot("hook", "sideTop", "fh-short", "medium", -1, { lateral: .69, depth: .16 }), "me", hands],
    [serveShot("hook", "sideUnder", "fh-short", "heavy", -1, { lateral: .797, depth: .125 }), "me", hands],
    [serveShot("pendulum", "sideUnder", "bh-short", "medium", -1, { lateral: -.74, depth: .29 }),
      "opponent", { myHand: "right", hand: "left" }],
    [serveShot("topspin", "top", "bh-long", "medium", -1, { lateral: -.7, depth: .81 }), "me", hands],
    [serveShot("plain", "dead", "mid-short"), "me", hands],
  ]
  const horizontalShift = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const { min, max } = SERVE_POSITION_LIMITS
  for (const [shot, actor, match] of scenarios) {
    let previous
    for (let step = Math.round(min * 100); step <= Math.round(max * 100); step++) {
      const position = step / 100
      const label = `${shot.family}/${shot.spin}/${position}`
      const ball = simulateServe({ ...shot, position }, actor, match)
      assert.ok(ball?.valid && ball.targetError < .004, label)
      if (previous) {
        if (!shot.point && shot.zone.endsWith("-short")) assert.equal(ball.points[0].p[2], previous.points[0].p[2], label)
        else assert.ok(Math.abs(ball.points[0].p[2] - previous.points[0].p[2]) < .003, label)
        assert.ok(horizontalShift(ball.landing, previous.landing) < .001, label)
        assert.ok(horizontalShift(ball.serviceBounce, previous.serviceBounce) < .012, label)
        assert.ok(horizontalShift(ball.follow.hit.p, previous.follow.hit.p) < .015, label)
      }
      previous = ball
    }
  }
})

test("old routines gain normal pace without changing identity; invalid new pace is rejected", () => {
  const original = serveShot("plain", "under", "fh-long")
  const legacy = { ...original }; delete legacy.pace
  const tail = [{ tech: "fhHighUnder", zone: "fh-long" }, { tech: "fhCounter", zone: "bh-long" }]
  assert.equal(validateSteps("serve", [legacy, ...tail])[0].pace, "normal")
  assert.equal(openingKey("serve", hands, legacy), openingKey("serve", hands, original))
  assert.equal(validateSteps("serve", [{ ...original, pace: "unbounded" }, ...tail]), null)
  assert.notEqual(openingKey("serve", hands, original), openingKey("serve", hands, { ...original, pace: "fast" }))
})

test("legacy topspin serves open and regroup under 奔球", () => {
  assert.deepEqual(SERVES.plain.spins, ["under", "dead"])
  assert.deepEqual(SERVES.topspin.spins, ["top", "dead"])

  const legacy = serveShot("plain", "top", "fh-long")
  const current = { ...legacy, family: "topspin" }
  const tail = [{ tech: "fhDrive", zone: "fh-long" }, { tech: "fhCounter", zone: "bh-long" }]
  assert.deepEqual(validateSteps("serve", [legacy, ...tail])[0], current)
  assert.equal(openingKey("serve", hands, legacy), openingKey("serve", hands, current))
  assert.equal(shotName(legacy, "me", hands), "奔球 上旋")
  assert.equal(validateSteps("serve", [{ ...current, spin: "under" }, ...tail]), null)

  const float = { ...current, spin: "dead" }
  assert.deepEqual(validateSteps("serve", [float, ...tail])[0], float)
  assert.equal(shotName(float, "me", hands), "奔球 不转")
  assert.notEqual(openingKey("serve", hands, float), openingKey("serve", hands, { ...float, family: "plain" }))
})
