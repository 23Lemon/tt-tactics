import { DEFAULT_POSITION, SERVE_POSITION_LIMITS, contactSetbackCm, SPINS, STROKES, direction, forehand, handSign, other, pointZone, shotActor, spinSide, strokeFace, zoneInfo } from "./catalog.mjs"
import { RUBBER_CONTACT, rubberFor, serveFace } from "./rubbers.mjs"

// Coordinates in metres: x right on the screen, y toward the far baseline, z above the table.
export const COURT = { halfWidth: .7625, halfLength: 1.37, net: .1525 }
const radius = .02
const inertia = 2 / 3
const dt = .005
const tableNormal = [0, 0, 1]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (v, n) => [v[0] * n, v[1] * n, v[2] * n]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = v => Math.hypot(...v)
const clamp = (n, low, high) => Math.max(low, Math.min(n, high))
const unit = v => mul(v, 1 / (norm(v) || 1))
const mix = (a, b, t) => add(a, mul(sub(b, a), t))
const tangent = (v, n) => sub(v, mul(n, dot(v, n)))

export function targetPoint(zone, receiver, hands, point) {
  if (point) return [point.lateral * forehand(receiver, hands) * COURT.halfWidth,
    -direction(receiver) * point.depth * COURT.halfLength, radius]
  const { lane, length } = zoneInfo(zone)
  const width = length === "short" ? .36 : .48
  const x = (lane === "mid" ? 0 : lane === "fh" ? width : -width) * forehand(receiver, hands)
  return [x, -direction(receiver) * (length === "short" ? .345 : 1.13), radius]
}

function onTable(p) {
  return Math.abs(p[0]) <= COURT.halfWidth && Math.abs(p[1]) <= COURT.halfLength
}

function insideHalf(p, shotDirection) {
  return onTable(p) && p[1] * shotDirection > 0
}

export function freeFlight(from, { track = false, stopAtNet = false, surfaceHeight = 0 } = {}) {
  let { p, v, w } = from
  const states = track ? [{ ...from, t: 0 }] : []
  let net = null
  for (let step = 0; step < 360; step++) {
    const drag = mul(v, -.145 * norm(v))
    const lift = mul(cross(w, v), .00065)
    const newV = add(v, mul(add(add(drag, lift), [0, 0, -9.81]), dt))
    const newP = add(p, mul(add(v, newV), .5 * dt))
    const newW = mul(w, 1 - .08 * dt)
    if (!net && p[1] * newP[1] <= 0 && Math.abs(newP[1] - p[1]) > 1e-8) {
      const k = -p[1] / (newP[1] - p[1])
      const position = mix(p, newP, k)
      const withinNet = Math.abs(position[0]) <= COURT.halfWidth + COURT.net + radius
      net = { p: position, clearance: position[2] - COURT.net - radius, blocked: withinNet && position[2] < COURT.net + radius }
      if (net.blocked && stopAtNet) {
        if (track) states.push({ p: position, v: mix(v, newV, k), w: mix(w, newW, k), t: (step + k) * dt })
        return { hit: null, net, states }
      }
    }
    if (newP[2] <= surfaceHeight + radius && newV[2] < 0) {
      const fraction = clamp((p[2] - surfaceHeight - radius) / (p[2] - newP[2] || 1), 0, 1)
      const hit = { p: mix(p, newP, fraction), v: mix(v, newV, fraction), w: mix(w, newW, fraction), t: (step + fraction) * dt }
      if (track) states.push(hit)
      return { hit, net, states }
    }
    p = newP
    v = newV
    w = newW
    if (track) states.push({ p, v, w, t: (step + 1) * dt })
  }
  return { hit: null, net, states }
}

function rebound(ball, normal, surfaceVelocity, elasticity, friction, tangentFactor = 1) {
  const arm = mul(normal, -radius)
  const relative = sub(add(ball.v, cross(ball.w, arm)), surfaceVelocity)
  const normalImpulse = Math.max(0, -(1 + elasticity) * dot(relative, normal))
  const slip = tangent(relative, normal)
  const tangentImpulse = mul(unit(slip), -Math.min(norm(slip) * tangentFactor / (1 + 1 / inertia), friction * normalImpulse))
  return {
    p: ball.p,
    v: add(ball.v, add(mul(normal, normalImpulse), tangentImpulse)),
    w: add(ball.w, mul(cross(arm, tangentImpulse), 1 / (inertia * radius ** 2))),
  }
}

export function bounce(hit) {
  return rebound(hit, tableNormal, [0, 0, 0], .895, .24)
}

function solveLinear(matrix, target) {
  const rows = matrix.map((row, i) => [...row, target[i]])
  for (let i = 0; i < rows.length; i++) {
    let pivot = i
    for (let k = i + 1; k < rows.length; k++) {
      if (Math.abs(rows[k][i]) > Math.abs(rows[pivot][i])) pivot = k
    }
    if (Math.abs(rows[pivot][i]) < 1e-9) return null
    ;[rows[i], rows[pivot]] = [rows[pivot], rows[i]]
    const factor = rows[i][i]
    rows[i] = rows[i].map(value => value / factor)
    for (let k = 0; k < rows.length; k++) {
      if (k !== i) {
        const weight = rows[k][i]
        rows[k] = rows[k].map((value, j) => value - weight * rows[i][j])
      }
    }
  }
  return rows.map(row => row.at(-1))
}

function aim(initial, error, limits, iterations = 8, tolerance = .003) {
  let params = initial
  let best = params
  let smallest = Infinity
  for (let i = 0; i < iterations; i++) {
    const residual = error(params)
    const size = norm(residual)
    if (size < smallest) {
      smallest = size
      best = params
    }
    if (size < tolerance) break
    const columns = params.map((_, j) => error(params.map((value, k) => value + (k === j ? .012 : 0))))
    const jacobian = residual.map((value, i) => columns.map(column => (column[i] - value) / .012))
    const adjustment = solveLinear(jacobian, residual)
    if (!adjustment) break
    params = params.map((value, j) => clamp(value - clamp(adjustment[j], -4, 4), ...limits[j]))
  }
  return best
}

function landingsForServe(ball, track = false, stopAtNet = false) {
  const first = freeFlight(ball, { track, stopAtNet })
  const second = first.hit ? freeFlight(bounce(first.hit), { track, stopAtNet }) : { hit: null, states: [], net: null }
  return { first, second }
}

function firstTableExit(states) {
  const index = states.findIndex(({ p }) => !onTable(p))
  if (index < 1) return null
  const from = states[index - 1].p
  const to = states[index].p
  const crossAt = (axis, limit) => Math.abs(to[axis]) > limit
    ? (Math.sign(to[axis]) * limit - from[axis]) / (to[axis] - from[axis])
    : Infinity
  const side = crossAt(0, COURT.halfWidth)
  const end = crossAt(1, COURT.halfLength)
  return { edge: side <= end ? "side" : "end", p: mix(from, to, Math.min(side, end)), index }
}

function resultFor(flight, actor, hands, points = flight.states, serviceBounce = null) {
  const travel = direction(actor)
  const hit = flight.hit
  const targetSide = other(actor)
  const good = !!(hit && !flight.net?.blocked && insideHalf(hit.p, travel))
  const follow = good ? freeFlight(bounce(hit), { track: true }) : null
  const short = !!(follow?.hit && insideHalf(follow.hit.p, travel))
  const exit = follow && !short ? firstTableExit(follow.states) : null
  const lateral = p => p[0] * forehand(targetSide, hands) / COURT.halfWidth
  const zone = good ? pointZone({ lateral: lateral(hit.p), depth: Math.abs(hit.p[1]) / COURT.halfLength }) : null
  const lane = zone ? zoneInfo(zone).lane : null
  // Racket decisions use the post-bounce contact window, not the pre-bounce state.
  const sampleIndex = Math.max(Math.round((short ? .085 : .18) / dt), exit?.index ?? 0)
  const sample = follow?.states[Math.min(sampleIndex, follow.states.length - 2)] ?? hit
  const arrival = spinAt(sample)
  const apex = follow?.states.reduce((best, state) => state.p[2] > best.p[2] ? state : best, follow.states[0])
  const beforeBounce = spinAt(hit)
  return {
    points,
    net: flight.net,
    landing: hit?.p,
    serviceBounce,
    isServe: !!serviceBounce,
    follow,
    exit,
    valid: good,
    short,
    lane,
    contactLane: exit?.edge === "side" ? (lateral(exit.p) > 0 ? "fh" : "bh") : lane,
    zone,
    status: good ? "in" : flight.net?.blocked ? "net" : "out",
    actor, receiver: targetSide,
    top: arrival.top, side: arrival.side,
    pace: sample ? Math.hypot(sample.v[0], sample.v[1]) : 0,
    beforeBounce, contact: sample,
    apex: apex ? { height: apex.p[2], time: apex.t } : null,
    flightTime: flight.hit?.t ?? 0, bounceTime: follow?.hit?.t ?? 0,
    targetError: 0,
  }
}

export function serveOrigin(shot, actor, hands) {
  return [forehand(actor, hands) * (shot.position ?? DEFAULT_POSITION) * COURT.halfWidth,
    -direction(actor) * (COURT.halfLength + contactSetbackCm(shot.distance) / 100), .25]
}

function servePace(shot, short) {
  const shortTop = short && SPINS[shot.spin].top > 0
  const levels = shortTop ? { light: 3.38, medium: 3.23, heavy: 3.10 } :
    short ? { light: 3.20, medium: 2.82, heavy: 2.44, float: 3.55 } :
      { light: 5.30, medium: 4.68, heavy: 4.05, float: 5.65 }
  // Contact-style preference, not a universal inverse relation between speed and spin.
  return levels[shot.spin === "dead" ? "float" : shot.strength] *
    ({ slow: .83, normal: 1, fast: 1.18 }[shot.pace ?? "normal"] ?? 1)
}

const serveCache = new Map()
const serveShapeCache = new Map()
const serveLimits = [[-9, 9], [1.40, 15], [-9, 3.5]]

export function simulateServe(shot, actor, hands) {
  const rubber = rubberFor(hands.rubbers ? hands : { rubbers: shot.rubbers }, actor, serveFace(shot))
  const { position = DEFAULT_POSITION, ...setup } = shot
  const shapeKey = JSON.stringify([setup, actor, hands.myHand ?? "right", hands.hand, rubber])
  const key = JSON.stringify([shapeKey, position])
  if (serveCache.has(key)) return serveCache.get(key)
  if (!serveShapeCache.has(shapeKey)) {
    if (serveShapeCache.size >= 96) serveShapeCache.delete(serveShapeCache.keys().next().value)
    serveShapeCache.set(shapeKey, fitServeShape(setup, actor, hands, rubber))
  }
  const shape = serveShapeCache.get(shapeKey)
  if (!shape) return null
  const origin = serveOrigin(shot, actor, hands)
  const params = aimServeFrom(shape, origin)
  const { first, second } = shape.flightAt(origin, shape.height, params, true, true)
  const result = resultFor(second, actor, hands, [...first.states, ...second.states.slice(1)], first.hit?.p)
  if (!first.hit || !insideHalf(first.hit.p, -direction(actor))) {
    result.valid = false
    result.status = first.net?.blocked ? "net" : "out"
    result.follow = null
    result.exit = null
  }
  const targetError = result.landing ? norm(sub(result.landing, shape.target)) : Infinity
  const ball = { ...result, rubber, target: shape.target, targetError }
  if (serveCache.size >= 96) serveCache.delete(serveCache.keys().next().value)
  serveCache.set(key, ball)
  return ball
}

function aimServeFrom(shape, origin) {
  const { flightAt, reference, height, params, landing, airtime } = shape
  if (origin[0] === reference[0] && origin[1] === reference[1]) return params
  // The same contact height and vertical launch speed preserve the serve's arc.
  // Re-aim the two horizontal components at its receiving-side bounce.
  const [vx, vy, vz] = params
  const initial = [vx + (reference[0] - origin[0]) / airtime,
    vy * (landing[1] - origin[1]) / (landing[1] - reference[1])]
  const aimed = aim(initial, horizontal => {
    const { second } = flightAt(origin, height, [...horizontal, vz])
    return [(second.hit?.p[0] ?? 10) - landing[0], (second.hit?.p[1] ?? 10) - landing[1]]
  }, serveLimits.slice(0, 2), 7, .00015)
  return [...aimed, vz]
}

function fitServeShape(shot, actor, hands, rubber) {
  const travel = direction(actor)
  const receiver = other(actor)
  const target = targetPoint(shot.zone, receiver, hands, shot.point)
  const { length, lane } = zoneInfo(shot.zone)
  const short = length === "short"
  const strength = { light: .58, medium: 1, heavy: 1.42 }[shot.strength] * RUBBER_CONTACT[rubber].serveSpin
  const isSide = SPINS[shot.spin].side
  const isTop = SPINS[shot.spin].top > 0
  const spin = SPINS[shot.spin].top * strength * (short && isTop ? 107 : isSide ? 190 : 250)
  const side = 245 * strength * spinSide(shot, actor, hands)
  const reference = serveOrigin(shot, actor, hands)
  const desiredPace = servePace(shot, short)

  const flightAt = (origin, height, params, track = false, stopAtNet = false) => {
    const velocity = [params[0], travel * params[1], params[2]]
    const heading = unit([velocity[0], velocity[1], 0])
    // Compensate for forward grip at the first bounce, including on a float serve.
    const verticalSpeed = Math.sqrt(params[2] ** 2 + 2 * 9.81 * (height - radius))
    const forwardGrip = clamp((Math.hypot(velocity[0], velocity[1]) - radius * spin) * 22,
      -31 * verticalSpeed, 31 * verticalSpeed)
    const launchSpin = spin - forwardGrip
    return landingsForServe({
      p: [origin[0], origin[1], height], v: velocity,
      w: [-heading[1] * launchSpin, heading[0] * launchSpin, side],
    }, track, stopAtNet)
  }

  // Choose a reference arc once per setup, independent of the lateral slider.
  const candidates = []
  const heights = short ? [.25, .18, .33, .13, .40, .46] : [.25, .20, .30, .15, .37]
  const depths = short ? [.57, .45, .68, .33, .78, .22] : [1.04, .90, 1.16, .78, 1.26, .68, 1.32]
  if (short && shot.point) depths.push(.94, 1.12)
  const destinations = short && !shot.point ?
    [target, [target[0] * .92, target[1] * .85, radius], [target[0] * .83, target[1] * .76, radius]] : [target]

  const search = (height, destination, initial, constraint) => {
    const params = aim(initial, values => {
      const { first, second } = flightAt(reference, height, values)
      return [constraint(first, second), (second.hit?.p[1] ?? 10) * travel - Math.abs(destination[1]),
        (second.hit?.p[0] ?? 10) - destination[0]]
    }, serveLimits, 9, shot.point ? .0003 : .003)
    const { first, second } = flightAt(reference, height, params)
    if (!first.hit || !second.hit) return
    const gap = second.net?.clearance ?? -.5
    const onBothHalves = insideHalf(first.hit.p, -travel) && insideHalf(second.hit.p, travel)
    const legal = onBothHalves && gap >= .003
    const followingBounce = insideHalf(second.hit.p, travel) ? freeFlight(bounce(second.hit)).hit : null
    const staysShort = !!(followingBounce && insideHalf(followingBounce.p, travel))
    const miss = norm(sub(second.hit.p, target))
    const lateral = second.hit.p[0] * forehand(receiver, hands) / COURT.halfWidth
    const reachedLane = lateral > 1 / 3 ? "fh" : lateral < -1 / 3 ? "bh" : "mid"
    const missedLane = !shot.point && reachedLane !== lane
    const score = miss * (shot.point ? 16 : 9) + Math.abs(gap - .042) * .70 +
      Math.abs(norm(second.hit.v) - desiredPace) * .82 +
      (gap < .007 ? 8 : 0) + (staysShort !== short ? 3.5 : 0) + (missedLane ? 2.5 : 0) + (onBothHalves ? 0 : 14)
    candidates.push({ flightAt, target, reference, height, params, landing: second.hit.p,
      airtime: first.hit.t + second.hit.t, miss, score, legal })
  }

  const searchDestination = destination => {
    const initial = [(destination[0] - reference[0]) * (short ? 1.5 : 2.6), short ? 4.3 : 8.1, short ? 0 : -2.2]
    for (const height of heights) {
      search(height, destination, initial, (_, second) => second.hit ? (norm(second.hit.v) - desiredPace) * .36 : 2)
      for (const depth of depths) {
        search(height, destination, initial, first => (first.hit?.p[1] ?? 10) * travel + depth)
      }
    }
  }

  for (const destination of destinations) {
    if (destination !== target && candidates.some(({ score }) => score < 2.5)) break
    searchDestination(destination)
  }

  // Select an arc that stays playable as the horizontal contact point moves.
  // Check the reference and both ends of the slider before reusing the arc.
  const extremes = [SERVE_POSITION_LIMITS.min, SERVE_POSITION_LIMITS.max].map(position =>
    serveOrigin({ position, distance: shot.distance }, actor, hands))
  const compareScore = (a, b) => a.score - b.score
  const stable = candidate => candidate.legal && extremes.every(origin => {
    const { first, second } = flightAt(origin, candidate.height, aimServeFrom(candidate, origin))
    return first.hit && second.hit && insideHalf(first.hit.p, -travel) && insideHalf(second.hit.p, travel) &&
      (second.net?.clearance ?? -.5) >= .003 && norm(sub(second.hit.p, candidate.landing)) < .002
  })
  candidates.sort(compareScore)
  const preferred = candidates.find(candidate => (!shot.point || candidate.miss < .004) && stable(candidate))
  if (preferred) return preferred

  // A requested pace or first-bounce depth can leave too little room above the net.
  // If needed, use the available net clearance as a constraint and search the same target again.
  const seeds = candidates.filter(candidate => candidate.miss < .025).slice(0, 12)
  for (const { height, params } of seeds) {
    search(height, target, params, (_, second) => (second.net?.clearance ?? -.5) - .032)
  }
  const comparePlacement = shot.point ? (a, b) =>
    (a.miss < .004 && b.miss < .004 ? 0 : a.miss - b.miss) || compareScore(a, b) : compareScore
  candidates.sort(comparePlacement)
  const closest = candidates.find(stable)
  if (closest && (!shot.point || closest.miss < .004)) return closest

  if (shot.point) {
    // Points very near the net or sideline may need a small adjustment into the selected zone.
    const zoneCenter = targetPoint(shot.zone, receiver, hands)
    let best = closest
    for (const fraction of [.06, .15, .30]) {
      const destination = mix(target, zoneCenter, fraction)
      if (best && norm(sub(destination, target)) > best.miss) break
      const start = candidates.length
      searchDestination(destination)
      best = [...candidates.slice(start), ...(best ? [best] : [])].sort(comparePlacement).find(stable)
    }
    if (best) return best
  }
  return closest ?? candidates.sort((a, b) => Number(b.legal) - Number(a.legal) || compareScore(a, b))[0]
}

// Only the display uses the unreturned ball's extra flight down to the floor.
export function secondLanding(result) {
  if (!result?.valid || !result.follow?.hit) return null
  if (!result.exit) return { point: result.follow.hit.p, states: result.follow.states, floor: false }
  const extension = freeFlight(result.follow.hit, { track: true, surfaceHeight: -.76 })
  return extension.hit && { point: extension.hit.p, states: [...result.follow.states, ...extension.states.slice(1)], floor: true }
}

export function spinAt(ball) {
  if (!ball) return { top: 0, side: 0 }
  const heading = unit([ball.v[0], ball.v[1], 0])
  return { top: dot(ball.w, [-heading[1], heading[0], 0]), side: ball.w[2] }
}
export function contactFor(previous, tech) {
  if (!previous?.follow?.states?.length) return null
  const stroke = typeof tech === "string" ? STROKES[tech] : tech
  if (!stroke) return null
  const ball = strikeTime(previous, stroke)
  if (!ball) return null
  const fullSwing = stroke.kind === "loop" || stroke.kind === "counter" || stroke.kind === "chop"
  const available = (!fullSwing || (!previous.short && !onTable(ball.p))) &&
    ball.p[2] >= radius + .015 && ball.t < previous.follow.hit.t - .012
  return { ...ball, ...spinAt(ball), available, height: ball.p[2] - radius }
}
function strikeTime(previous, stroke) {
  const states = previous.follow.states
  let index = Math.round(stroke.delay / dt)
  if (previous.exit && (stroke.kind === "loop" || stroke.kind === "counter" || stroke.kind === "chop")) {
    const side = previous.exit.edge === "side"
    const axis = side ? 0 : 1
    const limit = side ? COURT.halfWidth : COURT.halfLength
    const clear = states.findIndex(({ p }) => Math.abs(p[axis]) >= limit + .06)
    if (side) {
      const apex = states.findIndex(({ v }) => v[2] <= 0)
      if (apex >= 0) index = Math.min(apex, index)
    }
    index = Math.max(index, clear < 0 ? previous.exit.index : clear)
  }
  return states[Math.min(index, states.length - 2)]
}

function aimReturn(ball, spin, target, shotDirection, stroke, short, exact, rubber) {
  let best = null
  let bestScore = Infinity
  const needsBackspin = needsUnderReturn(ball, stroke)
  const pace = stroke.pace * rubber.pace
  const speeds = short ? [3.05, 2.7, 3.45, 2.4, 3.8, 2.15, 4.25, 4.8, 5.4, 6.1] :
    [pace, pace * 1.15, pace * 1.30, pace * .9, pace * .80, pace * .70, pace * .6]
  const targets = short && !exact ? [target, [target[0] * .80, target[1] * .89, radius],
    [target[0] * .80, target[1] * 1.26, radius]] : [target]
  for (const destination of targets) {
    if (destination !== target && bestScore < .075) break
    const delta = sub(destination, ball.p)
    const distance = Math.abs(delta[1])
    for (const speed of speeds) {
      const time = Math.max(.125, distance / speed * (1 + .08 * distance))
      const launch = params => {
        const v = [params[0], shotDirection * speed, params[1]]
        return strike(ball, racketMotion(ball, v, spin, ball.w, rubber), rubber)
      }
      const landingError = flight => {
        const hit = flight.hit?.p ?? [10, 10]
        return [hit[0] - destination[0], hit[1] - destination[1]]
      }
      const [vx, vz] = aim([delta[0] / time, delta[2] / time + 4.9 * time],
        params => landingError(freeFlight(launch(params))), [[-8, 8], [-5, 7]], 7)
      const launchState = launch([vx, vz])
      const outcome = freeFlight(launchState)
      const producedSpin = spinAt(launchState).top
      const heading = unit([vx, shotDirection * speed, 0])
      const intendedTop = dot(spin, [-heading[1], heading[0], 0])
      const gap = outcome.net?.clearance ?? -.5
      const bounced = outcome.hit ? bounce(outcome.hit) : null
      const nextBounce = bounced ? freeFlight(bounced).hit : null
      const staysShort = !!(nextBounce && insideHalf(nextBounce.p, shotDirection))
      const error = norm(landingError(outcome))
      const margin = short && staysShort ?
        Math.min(COURT.halfLength - Math.abs(nextBounce.p[1]), COURT.halfWidth - Math.abs(nextBounce.p[0])) : 1
      const preferredClearance = short ? .047 : stroke.clearance ?? .069
      // A legal landing alone does not make this a successful push/touch. Check
      // its post-bounce spin as well, leaving a small margin above air decay.
      const losesBackspin = needsBackspin && (!bounced || spinAt(bounced).top >= -12)
      const score = error * 3 + Math.abs(gap - preferredClearance) +
        (gap < .020 ? 4 : 0) + (staysShort !== short ? 3 : 0) +
        Math.max(0, .10 - margin) + Math.abs(speed - speeds[0]) * .025 +
        Math.abs(producedSpin - intendedTop) / Math.max(100, Math.abs(intendedTop)) * .6 +
        (losesBackspin ? 6 : 0)
      if (score < bestScore) {
        bestScore = score
        best = [vx, shotDirection * speed, vz]
      }
      if (score < .014) break
    }
  }
  return best
}

function racketMotion(ball, launch, intendedSpin, expectedSpin, rubber) {
  const kick = sub(launch, ball.v)
  const along = unit(kick)
  // One contact impulse cannot independently prescribe all three spin components.
  // Preserve the stroke's topspin/backspin first; use the remaining grip to adjust
  // sidespin. Scaling the whole desired spin change erases backspin on side-under
  // serves when cancellation of their large sidespin consumes the available grip.
  const heading = unit([launch[0], launch[1], 0])
  const topAxis = [-heading[1], heading[0], 0]
  const topResponse = mul(cross(kick, topAxis), -1 / (inertia * radius))
  const topDirection = unit(topResponse)
  const sideDirection = unit(cross(along, topDirection))
  const maxOffset = rubber.friction / Math.hypot(1, rubber.friction) - 1e-6
  const topOffset = clamp(dot(sub(intendedSpin, expectedSpin), topAxis) / (norm(topResponse) || 1), -maxOffset, maxOffset)
  const sideResponse = mul(cross(kick, [0, 0, 1]), -1 / (inertia * radius))
  const remaining = Math.sqrt(Math.max(0, maxOffset ** 2 - topOffset ** 2))
  const sideGain = dot(sideDirection, sideResponse)
  const sideOffset = Math.abs(sideGain) < 1e-8 ? 0 : clamp(
    (intendedSpin[2] - expectedSpin[2] - topOffset * dot(topDirection, sideResponse)) / sideGain,
    -remaining, remaining,
  )
  const offset = add(mul(topDirection, topOffset), mul(sideDirection, sideOffset))
  const normal = add(mul(along, Math.sqrt(1 - dot(offset, offset))), offset)
  const normalKick = dot(kick, normal)
  const contactVelocity = add(ball.v, cross(expectedSpin, mul(normal, -radius)))
  const velocity = add(
    add(tangent(contactVelocity, normal), mul(tangent(kick, normal), (1 + 1 / inertia) / rubber.tangentFactor)),
    mul(normal, dot(ball.v, normal) + normalKick / (1 + rubber.elasticity)),
  )
  return { normal, velocity }
}

function strike(ball, motion, rubber) {
  return rebound(ball, motion.normal, motion.velocity, rubber.elasticity, rubber.friction, rubber.tangentFactor)
}

function needsUnderReturn(ball, stroke) {
  return ["short", "push"].includes(stroke.kind) && verticalSpin(spinAt(ball)) === "under"
}

export function simulateReturn(previous, shot, actor, hands, adjustment = "read", spread = false) {
  if (!previous?.valid || !previous.follow) return null
  const profile = STROKES[shot.tech]
  const stroke = profile.neutralProfile && verticalSpin(previous) === "neutral" ? STROKES[profile.neutralProfile] : profile
  const rubberId = rubberFor(hands, actor, strokeFace(shot.tech))
  const rubber = RUBBER_CONTACT[rubberId]
  const travel = direction(actor)
  const ball = contactFor(previous, stroke)
  if (!ball?.available) return { valid: false, status: "unavailable", points: [], tech: shot.tech,
    issue: previous.short && (stroke.kind === "loop" || stroke.kind === "counter") ? "球未出台，没有完整引拍空间" : "击球窗口过低或过晚，试试更早触球的技术" }
  const target = targetPoint(shot.zone, other(actor), hands, shot.point)
  const short = zoneInfo(shot.zone).length === "short"
  if (!shot.point && !short && stroke.depth) target[1] = travel * stroke.depth
  const heading = unit([target[0] - ball.p[0], target[1] - ball.p[1], 0])
  // In court coordinates retained spin keeps its axis. Reversing the flight
  // direction then makes incoming topspin read as outgoing backspin.
  const dampingBlock = ["softBlock", "block", "punchBlock"].includes(stroke.kind)
  const pushesBackspin = needsUnderReturn(ball, stroke)
  const retention = rubber.carry * (dampingBlock ? 1 : pushesBackspin ? .25 : .78)
  const grip = pushesBackspin ? Math.max(rubber.brush, stroke.kind === "short" ? 1 : .78) : rubber.brush
  const spinTarget = pushesBackspin && stroke.depth > 1.2 ? Math.min(stroke.spin, Math.max(-315, ball.top - 16)) : stroke.spin
  const topspin = spinTarget * grip
  const brush = add([-heading[1] * topspin, heading[0] * topspin, (stroke.side ?? 0) * rubber.brush * handSign(actor, hands)],
    mul(ball.w, retention))
  const launch = aimReturn(ball, brush, target, travel, stroke, short, !!shot.point, rubber)
  if (!launch) return null
  let expectedSpin = ball.w
  if (adjustment === "fixed") {
    expectedSpin = Math.abs(previous.side) >= 50 ? [expectedSpin[0], expectedSpin[1], 0] : [0, 0, 0]
  }
  const motion = racketMotion(ball, launch, brush, expectedSpin, rubber)
  const flight = freeFlight(strike(ball, motion, rubber), { track: true, stopAtNet: true })
  const result = resultFor(flight, actor, hands)
  result.target = target
  result.tech = shot.tech
  result.rubber = rubberId
  result.targetError = result.landing ? norm(sub(result.landing, target)) : Infinity
  result.racketSpeed = norm(motion.velocity)
  if (result.racketSpeed > 18) { result.valid = false; result.status = "unavailable"; result.issue = "这条线路需要过大的拍速，换一个落点" }
  if (result.valid && adjustment === "read" && needsUnderReturn(ball, stroke) && verticalSpin(result) !== "under") {
    // This is a solver limitation, not proof that a human cannot play the shot.
    // Never relabel a wrong-spin trajectory or use it for the next-board advice.
    result.valid = false
    result.status = "unresolved"
    result.issue = "暂未算出保留下旋的这条线路，请微调落点或换一种接法。"
  }
  if (spread) {
    result.spread = [[-.030, 0], [.030, 0], [0, -.018], [0, .018], [-.020, .012], [.020, -.012]].flatMap(([side, rise]) => {
      const normal = unit(add(motion.normal, [side, 0, rise]))
      const sample = freeFlight(strike(ball, { normal, velocity: motion.velocity }, rubber), { stopAtNet: true })
      return sample.hit && insideHalf(sample.hit.p, travel) ? [sample.hit.p] : []
    })
  }
  return result
}

export function analyze(mode, hands, shots, adjustment = "read", focus = -1) {
  const results = []
  const players = hands.rubbers || !shots[0]?.rubbers ? hands : { ...hands, rubbers: shots[0].rubbers }
  for (let i = 0; i < shots.length; i++) {
    const actor = shotActor(mode, i)
    const result = i === 0 ? simulateServe(shots[i], actor, players) :
      simulateReturn(results[i - 1], shots[i], actor, players, i === focus ? adjustment : "read", i === focus)
    results.push(result)
  }
  return results
}

export function verticalSpin(result) {
  // Do not hide weak backspin in the neutral band: it still needs lift. The
  // small noise floor and wider topspin band are tactical, uncalibrated cutoffs.
  return result.top > 80 ? "top" : result.top < -10 ? "under" : "neutral"
}

export function spinDescription(result) {
  const vertical = { top: "上旋", under: "下旋", neutral: result.top >= 30 ? "弱上旋" : "" }[verticalSpin(result)]
  if (Math.abs(result.side) < 50) return vertical || "近似不转"
  const side = result.side < 0 ? "左侧" : "右侧"
  return vertical === "弱上旋" ? side + "旋（带弱上旋）" : side + (vertical || "旋")
}

export function secondBounceDescription(result) {
  if (result.exit) return "二跳出台 · " + (result.exit.edge === "side" ? "侧边" : "底线")
  return result.short ? "二跳留台" : ""
}

export function clearanceDescription(result) {
  const clearance = result.net?.clearance
  return clearance == null ? "—" : clearance < .025 ? "贴网" : clearance < .085 ? "低" : clearance < .165 ? "中等" : "偏高"
}
