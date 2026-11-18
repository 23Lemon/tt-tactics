import assert from "node:assert/strict"
import { SERVES, SERVE_DISTANCE, STROKES, ZONES, serveShot } from "./catalog.mjs"
import { simulateServe, simulateReturn, verticalSpin } from "./physics.mjs"
import { optionsFor } from "./tactics.mjs"

function audit(myHand, hand, actor, distance) {
  const hands = { myHand, hand }
  let scenarios = 0, recommendations = 0
  for (const [family, { spins }] of Object.entries(SERVES)) {
    for (const spin of spins) for (const { id: zone } of ZONES) {
      const shot = { ...serveShot(family, spin, zone), distance }
      const label = [myHand, hand, actor, family, spin, zone, distance].join("/")
      const ball = simulateServe(shot, actor, hands)
      assert.ok(ball?.valid, label + " invalid serve")
      const options = optionsFor(ball, hands)
      assert.ok(options.length, label + " no feasible reply")
      for (const option of options) {
        const reply = simulateReturn(ball, option, ball.receiver, hands)
        assert.ok(reply?.valid, label + " " + option.tech)
        if (verticalSpin(ball) === "under" && ["short", "push"].includes(STROKES[option.tech].kind))
          assert.equal(verticalSpin(reply), "under", label + " " + option.tech + " lost backspin")
      }
      scenarios++
      recommendations += options.length
    }
  }
  return { scenarios, recommendations }
}

for (const distance of [SERVE_DISTANCE.min, SERVE_DISTANCE.default, SERVE_DISTANCE.max]) {
  let scenarios = 0, recommendations = 0
  for (const myHand of ["right", "left"]) for (const hand of ["right", "left"]) {
    for (const actor of ["me", "opponent"]) {
      const result = audit(myHand, hand, actor, distance)
      scenarios += result.scenarios
      recommendations += result.recommendations
    }
  }
  console.log(JSON.stringify({ distance, scenarios, recommendations }))
}
