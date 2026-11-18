export const ZONES = [
  { id: "fh-short", name: "正手短", lane: "fh", length: "short" },
  { id: "mid-short", name: "中间短", lane: "mid", length: "short" },
  { id: "bh-short", name: "反手短", lane: "bh", length: "short" },
  { id: "fh-long", name: "正手长", lane: "fh", length: "long" },
  { id: "mid-long", name: "中间长", lane: "mid", length: "long" },
  { id: "bh-long", name: "反手长", lane: "bh", length: "long" },
]

export const SPINS = {
  sideUnder: { name: "侧下旋", top: -1, side: true },
  sideTop: { name: "侧上旋", top: 1, side: true },
  side: { name: "纯侧旋", top: 0, side: true },
  under: { name: "下旋", top: -1, side: false },
  top: { name: "上旋", top: 1, side: false },
  dead: { name: "不转", top: 0, side: false },
}

export const SERVES = {
  pendulum: { name: "顺旋", side: -1, spins: ["sideUnder", "side", "sideTop", "dead"] },
  reverse: { name: "逆旋", side: 1, spins: ["sideUnder", "sideTop", "side", "dead"] },
  hook: { name: "勾手", side: 1, spins: ["sideUnder", "sideTop", "side", "dead"] },
  backhand: { name: "反手", side: 1, spins: ["sideUnder", "sideTop", "side", "under", "dead"] },
  plain: { name: "转不转", side: 0, spins: ["under", "dead"] },
  topspin: { name: "奔球", side: 0, spins: ["top"] },
}

// Lateral coordinates are normalized from the center to a sideline, as seen by the server.
export const SERVE_POSITION_LIMITS = { min: -1.08, max: .50 }
export const STARTING_POSITIONS = [
  { value: -1, name: "侧身位" },
  { value: .20, name: "中间位" },
]
export const DEFAULT_POSITION = STARTING_POSITIONS[0].value
// Front toe to endline, in centimetres. The default keeps the original contact origin.
export const SERVE_DISTANCE = { min: 25, default: 30, max: 45 }
export const servePositionName = position => position <= -.5 ? "侧身位" : "中间位"

export const PACES = { slow: "慢", normal: "适中", fast: "快" }

export const STRENGTHS = { light: "轻", medium: "中", heavy: "强" }

// Spin presets are in radians per second. Pace is the nominal launch speed in m/s.
export const STROKES = {
  fhTouch: { name: "正手摆短", kind: "short", pace: 3.25, spin: -110, delay: .075 },
  bhTouch: { name: "反手摆短", kind: "short", pace: 3.25, spin: -105, delay: .075 },
  fhPushControl: { name: "正手搓", kind: "push", pace: 5.0, spin: -220, delay: .135, depth: 1.04 },
  bhPushControl: { name: "反手搓", kind: "push", pace: 4.9, spin: -205, delay: .125, depth: 1.04 },
  fhPush: { name: "正手劈长", kind: "push", pace: 6.8, spin: -92, delay: .105, depth: 1.25, clearance: .046 },
  bhPush: { name: "反手劈长", kind: "push", pace: 6.6, spin: -90, delay: .105, depth: 1.25, clearance: .046 },
  banana: { name: "反手拧拉", kind: "flick", pace: 7.0, spin: 245, side: -125, delay: .155 },
  fhFlip: { name: "正手挑打", kind: "flick", pace: 7.1, spin: 150, delay: .165 },
  bhFlip: { name: "反手挑打", kind: "flick", pace: 6.8, spin: 170, delay: .150 },
  bhTurnFlip: { name: "反手翻挑", kind: "flick", pace: 6.8, spin: 125, delay: .153 },
  fhHighUnder: { name: "正手拉下旋（高吊）", kind: "loop", arc: "high", pace: 6.8, spin: 392, delay: .255, clearance: .22 },
  bhHighUnder: { name: "反手拉下旋（高吊）", kind: "loop", arc: "high", pace: 6.3, spin: 358, delay: .225, clearance: .21 },
  pivotHigh: { name: "侧身拉下旋（高吊）", kind: "loop", arc: "high", pace: 6.9, spin: 406, delay: .265, clearance: .22 },
  fhRushUnder: { name: "正手拉下旋（前冲）", kind: "loop", arc: "forward", pace: 9.7, spin: 300, delay: .208, clearance: .092 },
  bhRushUnder: { name: "反手拉下旋（前冲）", kind: "loop", arc: "forward", pace: 9.0, spin: 274, delay: .192, clearance: .090 },
  pivotRush: { name: "侧身拉下旋（前冲）", kind: "loop", arc: "forward", pace: 10.1, spin: 325, delay: .240, clearance: .092 },
  fhLoopNeutral: { name: "正手拉", kind: "loop", pace: 8.8, spin: 268, delay: .205, clearance: .10, menuTech: "fhLoopTop" },
  bhLoopNeutral: { name: "反手拉", kind: "loop", pace: 8.1, spin: 242, delay: .186, clearance: .094, menuTech: "bhLoopTop" },
  fhLoopTop: { name: "正手拉", kind: "loop", pace: 9.5, spin: 285, delay: .205, clearance: .09, neutralProfile: "fhLoopNeutral" },
  bhLoopTop: { name: "反手拉", kind: "loop", pace: 8.8, spin: 260, delay: .186, clearance: .084, neutralProfile: "bhLoopNeutral" },
  fhDrive: { name: "正手快带", kind: "drive", pace: 9.4, spin: 220, delay: .185 },
  bhDrive: { name: "反手快拨", kind: "drive", pace: 8.6, spin: 170, delay: .165 },
  fhCounter: { name: "正手反拉", kind: "counter", pace: 10.3, spin: 345, delay: .205 },
  bhCounter: { name: "反手反撕", kind: "counter", pace: 9.8, spin: 285, delay: .170 },
  bhPunch: { name: "反手弹击", kind: "drive", pace: 10.5, spin: 110, delay: .157, clearance: .05 },
  fhBlock: { name: "正手防", kind: "block", pace: 7.3, spin: 90, delay: .135 },
  bhBlock: { name: "反手防", kind: "block", pace: 7.0, spin: 100, delay: .125 },
  bhSideCut: { name: "反手侧切", kind: "cut", pace: 5.4, spin: -114, side: 157, delay: .112, depth: 1.01 },
  // Saved routines made before the high-arc and forward-drive choices were added.
  fhLoopUnder: { name: "正手拉下旋", kind: "loop", pace: 8.4, spin: 315, delay: .245, legacy: true },
  bhLoopUnder: { name: "反手拉下旋", kind: "loop", pace: 7.7, spin: 300, delay: .215, legacy: true },
  pivot: { name: "侧身拉下旋", kind: "loop", pace: 9.2, spin: 345, delay: .255, legacy: true },
}

export const STROKE_GROUPS = [
  { name: "控制", strokes: ["fhTouch", "bhTouch", "fhPushControl", "bhPushControl", "fhPush", "bhPush"] },
  { name: "台内上手", strokes: ["banana", "fhFlip", "bhFlip", "bhTurnFlip"] },
  { name: "拉下旋", strokes: ["fhHighUnder", "fhRushUnder", "bhHighUnder", "bhRushUnder", "pivotHigh", "pivotRush"] },
  { name: "处理上旋、侧旋和不转（借力）", strokes: ["fhDrive", "bhDrive", "fhBlock", "bhBlock", "bhSideCut"] },
  { name: "处理上旋、侧旋和不转（发力）", strokes: ["fhLoopTop", "bhLoopTop", "fhCounter", "bhCounter", "bhPunch"] },
]

export const other = actor => actor === "me" ? "opponent" : "me"
export const direction = actor => actor === "me" ? 1 : -1
export const playerHand = (actor, hands) => actor === "me" ? hands.myHand ?? "right" : hands.hand
export const handName = hand => hand === "left" ? "左手" : "右手"
export const handSign = (actor, hands) => playerHand(actor, hands) === "left" ? -1 : 1
export const forehand = (actor, hands) => direction(actor) * handSign(actor, hands)
export const zoneName = id => ZONES.find(zone => zone.id === id)?.name ?? ""
export const zoneInfo = id => ZONES.find(zone => zone.id === id)

export function shotActor(mode, index) {
  return (index % 2 === 0) === (mode === "serve") ? "me" : "opponent"
}

export function spinSide(shot, actor, hands) {
  return SPINS[shot.spin].side ? SERVES[shot.family].side * handSign(actor, hands) : 0
}

export function serveSpinName(shot, actor, hands) {
  const side = spinSide(shot, actor, hands)
  return (side < 0 ? "左" : side > 0 ? "右" : "") + (shot.spin === "side" ? "侧旋" : SPINS[shot.spin].name)
}

export function shotName(shot, actor, hands) {
  if (shot.family) {
    const { family } = normalizeServe(shot)
    return SERVES[family].name + " " + serveSpinName(shot, actor, hands)
  }
  return shot.label || STROKES[shot.tech].name
}

// Coordinates stored relative to a player. Positive lateral is toward their forehand.
export function pointZone({ lateral, depth }) {
  const lane = lateral > 1 / 3 ? "fh" : lateral < -1 / 3 ? "bh" : "mid"
  return lane + (depth < .5 ? "-short" : "-long")
}

export function snapPoint(lateral, depth) {
  const round = value => Math.round(value * 1000) / 1000
  return { lateral: round(Math.max(-.995, Math.min(.995, lateral))), depth: round(Math.max(.008, Math.min(.995, depth))) }
}

function validPoint(value) {
  return value && Number.isFinite(value.lateral) && Math.abs(value.lateral) <= 1 &&
    Number.isFinite(value.depth) && value.depth >= 0 && value.depth <= 1
}

export const serveShot = (family, spin, zone, strength = "medium", position = DEFAULT_POSITION, point, pace = "normal", distance = SERVE_DISTANCE.default) => ({
  family, spin, zone, strength, position, pace, distance, ...(point ? { point } : {}),
})

function normalizeServe(shot) {
  // Older saves used overlapping categories and inferred their origin from the serving motion.
  let family = shot.family
  if (family === "variation" || (family === "pendulum" && shot.spin === "under")) family = "plain"
  if (family === "plain" && shot.spin === "top") family = "topspin"
  const oldPosition = shot.family === "backhand" ? -.328 :
    ["plain", "topspin"].includes(shot.family) ? -.157 : -.56
  return { ...shot, family, position: shot.position ?? oldPosition, pace: shot.pace ?? "normal",
    distance: shot.distance === undefined ? SERVE_DISTANCE.default : shot.distance }
}

const pointKey = point => point ? [point.lateral, point.depth] : null

export function openingKey(mode, hands, shot) {
  const { family, spin, zone, strength, position, point, pace, distance } = normalizeServe(shot)
  const key = [mode, playerHand("me", hands), playerHand("opponent", hands), family, spin, zone, spin === "dead" ? "" : strength, position, pointKey(point), pace]
  if (distance !== SERVE_DISTANCE.default) key.push(distance)
  return JSON.stringify(key)
}

export function patternKey(mode, hands, steps) {
  return openingKey(mode, hands, steps[0]) + "|" + steps.slice(1).map(
    step => JSON.stringify([step.tech, step.zone, step.label || "", pointKey(step.point)])
  ).join("|")
}

export function validateSteps(mode, steps) {
  if (!Array.isArray(steps) || steps.length !== (mode === "serve" ? 3 : 4) || !steps[0]) return null
  const [raw, ...shots] = steps
  const serve = normalizeServe(raw)
  if (!Object.hasOwn(SERVES, serve.family) || !SERVES[serve.family].spins.includes(serve.spin) ||
      !zoneInfo(serve.zone) || !Object.hasOwn(STRENGTHS, serve.strength) || !Object.hasOwn(PACES, serve.pace) ||
      !Number.isFinite(serve.position) || serve.position < SERVE_POSITION_LIMITS.min || serve.position > .94 ||
      !Number.isInteger(serve.distance) || serve.distance < SERVE_DISTANCE.min || serve.distance > SERVE_DISTANCE.max ||
      (serve.point !== undefined && !validPoint(serve.point))) return null
  const firstPoint = serve.point && snapPoint(serve.point.lateral, serve.point.depth)
  const checked = [serveShot(serve.family, serve.spin, firstPoint ? pointZone(firstPoint) : serve.zone,
    serve.strength, serve.position, firstPoint, serve.pace, serve.distance)]
  for (const shot of shots) {
    if (!shot || !Object.hasOwn(STROKES, shot.tech) || !zoneInfo(shot.zone) ||
        (shot.point !== undefined && !validPoint(shot.point)) ||
        (shot.label !== undefined && (typeof shot.label !== "string" || shot.label.length > 28))) return null
    const label = shot.label?.trim()
    const point = shot.point && snapPoint(shot.point.lateral, shot.point.depth)
    checked.push({ tech: shot.tech, zone: point ? pointZone(point) : shot.zone,
      ...(label ? { label } : {}), ...(point ? { point } : {}) })
  }
  return checked
}
