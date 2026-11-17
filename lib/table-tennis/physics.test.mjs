import assert from "node:assert/strict"
import test from "node:test"
import { SERVES, serveShot, openingKey, shotName, validateSteps } from "./catalog.mjs"
import { bounce, contactFor, freeFlight, simulateServe, spinAt } from "./physics.mjs"

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
  assert.deepEqual(SERVES.topspin.spins, ["top"])

  const legacy = serveShot("plain", "top", "fh-long")
  const current = { ...legacy, family: "topspin" }
  const tail = [{ tech: "fhDrive", zone: "fh-long" }, { tech: "fhCounter", zone: "bh-long" }]
  assert.deepEqual(validateSteps("serve", [legacy, ...tail])[0], current)
  assert.equal(openingKey("serve", hands, legacy), openingKey("serve", hands, current))
  assert.equal(shotName(legacy, "me", hands), "奔球 上旋")
  assert.equal(validateSteps("serve", [{ ...current, spin: "under" }, ...tail]), null)
})
