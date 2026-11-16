import { DEFAULT_POSITION, SPINS, STROKES, direction, forehand, handSign, other, pointZone, shotActor, spinSide, zoneInfo } from "./catalog.mjs"

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

function freeFlight(from, { track = false, stopAtNet = false } = {}) {
  let { p, v, w } = from
  const states = track ? [from] : []
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
        if (track) states.push({ p: position, v: mix(v, newV, k), w: mix(w, newW, k) })
        return { hit: null, net, states }
      }
    }
    if (newP[2] <= radius && newV[2] < 0) {
      const fraction = clamp((p[2] - radius) / (p[2] - newP[2] || 1), 0, 1)
      const hit = { p: mix(p, newP, fraction), v: mix(v, newV, fraction), w: mix(w, newW, fraction) }
      if (track) states.push(hit)
      return { hit, net, states }
    }
    p = newP
    v = newV
    w = newW
    if (track) states.push({ p, v, w })
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

function bounce(hit) {
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

function aim(initial, error, limits, iterations = 8) {
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
    if (size < .003) break
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
  const spin = hit?.w ?? points.at(-1)?.w ?? [0, 0, 0]
  const heading = unit([(hit?.v[0] ?? 0), (hit?.v[1] ?? travel), 0])
  const top = dot(spin, [-heading[1], heading[0], 0])
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
    top,
    side: spin[2],
    pace: hit ? norm(hit.v) : 0,
  }
}

export function serveOrigin(shot, actor, hands) {
  return [forehand(actor, hands) * (shot.position ?? DEFAULT_POSITION) * COURT.halfWidth,
    -direction(actor) * 1.47, .25]
}

function servePace(shot, short) {
  const shortTop = short && SPINS[shot.spin].top > 0
  const levels = shortTop ? { light: 3.38, medium: 3.23, heavy: 3.10 } :
    short ? { light: 3.20, medium: 2.82, heavy: 2.44, float: 3.55 } :
      { light: 5.30, medium: 4.68, heavy: 4.05, float: 5.65 }
  return levels[shot.spin === "dead" ? "float" : shot.strength]
}

export function simulateServe(shot, actor, hands) {
  const travel = direction(actor)
  const target = targetPoint(shot.zone, other(actor), hands, shot.point)
  const short = zoneInfo(shot.zone).length === "short"
  const strength = { light: .58, medium: 1, heavy: 1.42 }[shot.strength]
  const receiver = other(actor)
  const lane = zoneInfo(shot.zone).lane
  const isSide = SPINS[shot.spin].side
  const isTop = SPINS[shot.spin].top > 0
  const spin = SPINS[shot.spin].top * strength * (short && isTop ? 107 : isSide ? 190 : 250)
  const side = 245 * strength * spinSide(shot, actor, hands)
  const [startX, startY] = serveOrigin(shot, actor, hands)
  const desiredPace = servePace(shot, short)
  const limits = [[-9, 9], [1.40, 15], [-9, 3.5]]

  // Find legal two-bounce trajectories around the aiming point and the requested pace.
  // The speed preference represents a more direct touch for the lighter-spin serve.
  let best = null
  let bestScore = Infinity
  const heights = short ? [.25, .18, .33, .13, .40, .46] : [.25, .20, .30, .15, .37]
  const depths = short ? [.57, .45, .68, .33, .78, .22] : [1.04, .90, 1.16, .78, 1.26, .68, 1.32]
  const destinations = short && !shot.point ?
    [target, [target[0] * .92, target[1] * .85, radius], [target[0] * .83, target[1] * .76, radius]] : [target]

  for (const destination of destinations) {
    if (destination !== target && bestScore < 2.5) break
    for (const height of heights) {
      const f = (params, track = false, stopAtNet = false) => {
        const velocity = [params[0], travel * params[1], params[2]]
        const heading = unit([velocity[0], velocity[1], 0])
        // Compensate for forward grip at the first bounce, including on a float serve.
        const verticalSpeed = Math.sqrt(params[2] ** 2 + 2 * 9.81 * (height - radius))
        const forwardGrip = clamp((Math.hypot(velocity[0], velocity[1]) - radius * spin) * 22,
          -31 * verticalSpeed, 31 * verticalSpeed)
        const launchSpin = spin - forwardGrip
        return landingsForServe({
          p: [startX, startY, height], v: velocity,
          w: [-heading[1] * launchSpin, heading[0] * launchSpin, side],
        }, track, stopAtNet)
      }
      for (const depth of [null, ...depths]) {
        const residual = params => {
          const { first, second } = f(params)
          const paceError = second.hit ? (norm(second.hit.v) - desiredPace) * .36 : 2
          return [
            depth === null ? paceError : (first.hit?.p[1] ?? 10) * travel + depth,
            (second.hit?.p[1] ?? 10) * travel - Math.abs(destination[1]),
            (second.hit?.p[0] ?? 10) - destination[0],
          ]
        }
        const params = aim([(destination[0] - startX) * (short ? 1.5 : 2.6),
          short ? 4.3 : 8.1, short ? 0 : -2.2], residual, limits, 9)
        const { first, second } = f(params)
        if (!first.hit || !second.hit) continue
        const gap = second.net?.clearance ?? -.5
        const ownBounce = insideHalf(first.hit.p, -travel)
        const receivingBounce = insideHalf(second.hit.p, travel)
        const followingBounce = receivingBounce ? freeFlight(bounce(second.hit)).hit : null
        const staysShort = !!(followingBounce && insideHalf(followingBounce.p, travel))
        const miss = Math.hypot(second.hit.p[0] - target[0], second.hit.p[1] - target[1])
        const lateral = second.hit.p[0] * forehand(receiver, hands) / COURT.halfWidth
        const reachedLane = lateral > 1 / 3 ? "fh" : lateral < -1 / 3 ? "bh" : "mid"
        const missedLane = !shot.point && reachedLane !== lane
        const score = miss * (shot.point ? 16 : 9) + Math.abs(gap - .042) * .70 +
          Math.abs(norm(second.hit.v) - desiredPace) * .82 +
          (gap < .007 ? 8 : 0) + (staysShort !== short ? 3.5 : 0) + (missedLane ? 2.5 : 0) +
          (ownBounce && receivingBounce ? 0 : 14)
        if (score < bestScore) {
          bestScore = score
          best = { f, params, ownBounce }
        }
        if (score < .021) break
      }
      if (bestScore < .021) break
    }
    if (bestScore < .021) break
  }

  if (!best) return null
  const { first, second } = best.f(best.params, true, true)
  const result = resultFor(second, actor, hands, [...first.states, ...second.states.slice(1)], first.hit?.p)
  if (!best.ownBounce) {
    result.valid = false
    result.status = "out"
    result.follow = null
    result.exit = null
  }
  return { ...result, target }
}

function strikeTime(previous, stroke) {
  const states = previous.follow.states
  let index = Math.round(stroke.delay / dt)
  if (previous.exit && (stroke.kind === "loop" || stroke.kind === "counter")) {
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
  return states[Math.min(index, states.length - 1)]
}

function aimReturn(ball, spin, target, shotDirection, stroke, short, exact) {
  let best = null
  let bestScore = Infinity
  const speeds = short ? [3.05, 2.7, 3.45, 2.4, 3.8, 2.15, 4.25] :
    [stroke.pace, stroke.pace * .9, stroke.pace * .80, stroke.pace * .70, stroke.pace * .6]
  const targets = short && !exact ? [target, [target[0] * .80, target[1] * .89, radius],
    [target[0] * .80, target[1] * 1.26, radius]] : [target]
  for (const destination of targets) {
    if (destination !== target && bestScore < .075) break
    const delta = sub(destination, ball.p)
    const distance = Math.abs(delta[1])
    for (const speed of speeds) {
      const time = Math.max(.125, distance / speed * (1 + .08 * distance))
      const f = params => {
        const v = [params[0], shotDirection * speed, params[1]]
        const motion = racketMotion(ball, v, spin, ball.w)
        return freeFlight(strike(ball, motion))
      }
      const residual = params => {
        const hit = f(params).hit?.p ?? [10, 10]
        return [hit[0] - destination[0], hit[1] - destination[1]]
      }
      const [vx, vz] = aim([delta[0] / time, delta[2] / time + 4.9 * time],
        residual, [[-8, 8], [-5, 7]], 7)
      const outcome = f([vx, vz])
      const gap = outcome.net?.clearance ?? -.5
      const nextBounce = outcome.hit ? freeFlight(bounce(outcome.hit)).hit : null
      const staysShort = !!(nextBounce && insideHalf(nextBounce.p, shotDirection))
      const error = norm(residual([vx, vz]))
      const margin = short && staysShort ?
        Math.min(COURT.halfLength - Math.abs(nextBounce.p[1]), COURT.halfWidth - Math.abs(nextBounce.p[0])) : 1
      const preferredClearance = short ? .047 : stroke.clearance ?? .069
      const score = error * 3 + Math.abs(gap - preferredClearance) +
        (gap < .020 ? 4 : 0) + (staysShort !== short ? 3 : 0) +
        Math.max(0, .10 - margin) + Math.abs(speed - speeds[0]) * .025
      if (score < bestScore) {
        bestScore = score
        best = [vx, shotDirection * speed, vz]
      }
      if (score < .014) break
    }
  }
  return best
}

const rubber = { elasticity: .72, friction: 1.0, tangentFactor: 1.18 }

function racketMotion(ball, launch, intendedSpin, expectedSpin) {
  const kick = sub(launch, ball.v)
  const along = unit(kick)
  const rotationKick = sub(intendedSpin, expectedSpin)
  const tilt = mul(cross(along, rotationKick), -inertia * radius / (norm(kick) || 1))
  const offset = mul(unit(tilt), clamp(norm(tilt), 0, .52))
  const normal = add(mul(along, Math.sqrt(1 - dot(offset, offset))), offset)
  const normalKick = dot(kick, normal)
  const contactVelocity = add(ball.v, cross(expectedSpin, mul(normal, -radius)))
  const velocity = add(
    add(tangent(contactVelocity, normal), mul(tangent(kick, normal), (1 + 1 / inertia) / rubber.tangentFactor)),
    mul(normal, dot(ball.v, normal) + normalKick / (1 + rubber.elasticity)),
  )
  return { normal, velocity }
}

function strike(ball, motion) {
  return rebound(ball, motion.normal, motion.velocity, rubber.elasticity, rubber.friction, rubber.tangentFactor)
}

export function simulateReturn(previous, shot, actor, hands, adjustment = "read", spread = false) {
  if (!previous?.valid || !previous.follow) return null
  const profile = STROKES[shot.tech]
  const stroke = profile.neutralProfile && verticalSpin(previous) === "neutral" ? STROKES[profile.neutralProfile] : profile
  const travel = direction(actor)
  const ball = strikeTime(previous, stroke)
  const target = targetPoint(shot.zone, other(actor), hands, shot.point)
  const short = zoneInfo(shot.zone).length === "short"
  if (!shot.point && !short && stroke.depth) target[1] = travel * stroke.depth
  const heading = unit([target[0] - ball.p[0], target[1] - ball.p[1], 0])
  const brush = [-heading[1] * stroke.spin, heading[0] * stroke.spin, (stroke.side ?? 0) * handSign(actor, hands)]
  const launch = aimReturn(ball, brush, target, travel, stroke, short, !!shot.point)
  let expectedSpin = mul(ball.w, .97)
  if (adjustment === "fixed") {
    expectedSpin = Math.abs(previous.side) >= 50 ? [expectedSpin[0], expectedSpin[1], 0] : [0, 0, 0]
  }
  const motion = racketMotion(ball, launch, brush, expectedSpin)
  const flight = freeFlight(strike(ball, motion), { track: true, stopAtNet: true })
  const result = resultFor(flight, actor, hands)
  result.target = target
  result.tech = shot.tech
  if (spread) {
    result.spread = [[-.030, 0], [.030, 0], [0, -.018], [0, .018], [-.020, .012], [.020, -.012]].flatMap(([side, rise]) => {
      const normal = unit(add(motion.normal, [side, 0, rise]))
      const sample = freeFlight(strike(ball, { normal, velocity: motion.velocity }), { stopAtNet: true })
      return sample.hit && insideHalf(sample.hit.p, travel) ? [sample.hit.p] : []
    })
  }
  return result
}

export function analyze(mode, hands, shots, adjustment = "read", focus = -1) {
  const results = []
  for (let i = 0; i < shots.length; i++) {
    const actor = shotActor(mode, i)
    const result = i === 0 ? simulateServe(shots[i], actor, hands) :
      simulateReturn(results[i - 1], shots[i], actor, hands, i === focus ? adjustment : "read", i === focus)
    results.push(result)
  }
  return results
}

export function verticalSpin(result) {
  return result.top > 54 ? "top" : result.top < -54 ? "under" : "neutral"
}

export function spinDescription(result) {
  const vertical = { top: "上旋", under: "下旋", neutral: "" }[verticalSpin(result)]
  if (Math.abs(result.side) < 50) return vertical || "近似不转"
  const side = result.side < 0 ? "左侧" : "右侧"
  return side + (vertical === "" ? "旋" : vertical)
}

export function secondBounceDescription(result) {
  if (result.exit) return "二跳出台 · " + (result.exit.edge === "side" ? "侧边" : "底线")
  return result.short ? "二跳留台" : ""
}

export function clearanceDescription(result) {
  const clearance = result.net?.clearance
  return clearance == null ? "—" : clearance < .025 ? "贴网" : clearance < .085 ? "低" : clearance < .165 ? "中等" : "偏高"
}
