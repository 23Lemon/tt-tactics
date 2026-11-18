import { receiveSelection } from "./repertoire.mjs"
import { STROKES, openingKey, patternKey, playerHand, serveShot, shotActor, zoneName } from "./catalog.mjs"
import { COURT, contactFor, simulateReturn, simulateServe, verticalSpin } from "./physics.mjs"

const intentLabels = { attack: "进攻", control: "控制", neutral: "中性", defense: "防守" }
const isUnderStroke = tech => /Under|^pivot/.test(tech)
const isPivot = tech => tech.startsWith("pivot")
const isForehand = tech => tech.startsWith("fh") || isPivot(tech)
export function strokeEffort(tech) {
  const kind = STROKES[tech]?.kind
  return kind === "block" || kind === "drive" && tech !== "bhPunch" ? "借力" :
    kind === "counter" ? "借力＋发力" : ["loop", "flick", "rip"].includes(kind) || tech === "bhPunch" ? "发力" : "控制"
}
export function techniqueDescription(tech) {
  if (tech === "fhFlatPush" || tech === "bhFlatPush") return "迎前推送，以撞击为主。适合不转或上旋分量不强的球，带侧旋时要校正拍形。"
  if (tech === "bhRip") return "近台迎上升期，小幅向前摩擦发力，抢一般上旋或不转球的节奏。"
  if (tech === "bhSideBrush") return "也叫侧兜。台内反手侧向摩擦改变线路；此处示范稍向前上的一种，实际出球随触球方向变化。"
  if (tech === "banana") return "台内反手摩擦起板，常带侧上旋；接重下旋需要更多向上摩擦。"
  if (tech === "bhTurnFlip") return "台内翻转拍面，改变触球与出球方向；低频变化手段。"
  if (tech === "bhPunch") return "在较高的弱旋转球上短促撞击，突然加速。"
  const stroke = STROKES[tech]
  if (!stroke) return ""
  if (stroke.arc === "high") return "加转拉起，重视弧线和旋转，不等于一味拉高。"
  if (stroke.arc === "forward") return "到位后向前加速摩擦，按下旋强弱调整拍形，给弧线留出过网余量。"
  if (stroke.kind === "short") return "上升期抢早轻触，把第二跳留在对方台内。"
  if (stroke.kind === "push") return tech.includes("Control") ? "以向前下方的摩擦控制落点和下旋，速度通常比劈长慢。" : "抢上升期快速搓长，落点逼近底线，通常比普通搓更顶。"
  if (stroke.kind === "flick") return "在台内主动迎前上手，下旋越重越需要摩擦。"
  if (stroke.kind === "counter") return "对上旋主动摩擦反击，结合借力与发力；需要击球空间。"
  if (stroke.kind === "block") return "稳住拍面，借来球速度防回，优先保证稳定。"
  if (stroke.kind === "cut") return "侧向摩擦控制上旋，改变旋转和节奏。"
  if (stroke.kind === "drive") return "近台小动作迎前，借来球速度快速衔接。"
  return "面对较慢的上旋、侧旋或不转球，主动发力拉。"
}
// Pressure and arc use simulated trajectory features; names only label intent.
export function readIncoming(incoming) {
  if (!incoming) return null
  const stroke = STROKES[incoming.tech]
  const pace = incoming.pace ?? 0
  const height = incoming.apex?.height ?? incoming.follow?.states.reduce((h, s) => Math.max(h, s.p[2]), 0) ?? .20
  const sideExit = incoming.exit?.edge === "side"
  const nearSideExit = sideExit && Math.abs(incoming.exit.p[1]) < .65 * COURT.halfLength
  const low = height > 0 && height < .17
  const availableTime = incoming.flightTime != null ? incoming.flightTime + (incoming.contact?.t ?? .1) : null
  const rushed = pace >= 6.4 || pace >= 5.4 && (low || nearSideExit || availableTime != null && availableTime < .36)
  const spin = verticalSpin(incoming)
  const strong = Math.abs(incoming.top) >= 190
  const combinedSpin = Math.hypot(incoming.top ?? 0, incoming.side ?? 0)
  const highArc = spin === "top" && !rushed &&
    (incoming.net?.clearance >= .14 && height >= .18)
  const kind = stroke?.kind
  const intent = ["short", "push", "cut", "flatPush", "sideBrush"].includes(kind) ? "control" : kind === "block" ? "defense" :
    !incoming.tech || (pace < 4.8 && !strong && !highArc) ? "neutral" : "attack"
  const pressure = rushed ? "来球较快" : strong ? "旋转较强" : nearSideExit ? "需要让位" : Math.abs(incoming.side) >= 190 ? "侧旋较强" : low ? "弧线较低" : "有发力时间"
  return { spin, pace, low, rushed, strong, combinedSpin, highArc, sideExit, nearSideExit, intent, pressure,
    lane: incoming.contactLane ?? incoming.lane ?? "mid", height, availableTime }
}
export const incomingIntentLabel = incoming => incoming?.tech ? intentLabels[readIncoming(incoming).intent] + "回球" : ""

// One eligibility policy for both the automatic suggestions and manual menu.
export function assessStroke(incoming, tech) {
  const stroke = STROKES[tech]
  const fail = reason => ({ allowed: false, reason, effort: strokeEffort(tech), conditional: false })
  if (!stroke || !incoming?.valid) return fail("先选好有效的上一板")
  const c = readIncoming(incoming), kind = stroke.kind, fh = isForehand(tech), short = incoming.short
  let reason = ""
  if (short && ["loop", "counter"].includes(kind)) return fail("二跳仍在台内，没有完整引拍空间")
  if (short && ["drive", "block"].includes(kind)) return fail("台内球优先用挑、拧或短球控制")
  if (!short && kind === "short") return fail("来球已出台，摆短不是稳定的常规处理")
  if (!short && kind === "flick") return fail("来球已出台，改用拉球更合适")
  const contact = contactFor(incoming, stroke)
  if (contact && !contact.available) return fail("当前击球窗口过低或过晚，换更早触球的技术")
  const contactHeight = contact?.p[2] ?? c.height
  if (kind === "flatPush") {
    if (fh && !short) return fail("正手推用于台内球，出台后可用正手拉")
    if (c.spin === "under" || c.strong || c.rushed || c.highArc) return fail("推接适合不转或较弱上旋，遇下旋需搓或摩擦起球，强上旋需调拍借力")
    if (Math.abs(incoming.side ?? 0) >= 290 || contactHeight < COURT.net - .035)
      reason = "侧旋较强或击球点偏低，需调好拍形并留出过网弧线"
  }
  if (kind === "rip") {
    if (short || c.spin === "under" || c.rushed || c.strong || c.highArc)
      return fail("反手撕适合近台、来速适中的出台上旋或不转球")
    if (contact && Math.abs(contact.p[1]) > COURT.halfLength + .45)
      return fail("击球位置已远离端线，宜用反手拉")
    if (c.nearSideExit || Math.abs(incoming.side ?? 0) >= 190) reason = "需先跟住侧向偏移，找到身前的击球点"
  }
  if (kind === "sideBrush") {
    if (!short || c.rushed) return fail("此处的侧剌是台内接发变化，需要上步侧向摩擦")
    reason = "变化接法，需上步从球侧部摩擦，按来球调节摩擦方向"
  }
  if (c.spin === "under") {
    if (["drive", "block", "counter", "cut"].includes(kind) || kind === "loop" && !isUnderStroke(tech))
      return fail(kind === "loop" ? "来球有下旋，请选拉下旋（高吊或前冲）" : "来球仍有下旋，需要摩擦提拉，不能按上旋借力")
    if (kind === "flick" && (c.strong || c.low)) reason = "需充分摩擦提起；强下旋或低球难度较高"
    if (stroke.arc === "forward" && (c.low || c.nearSideExit || c.rushed)) reason = "需先到位并留出向前挥拍空间"
  } else {
    if (isUnderStroke(tech)) return fail("当前不是下旋，选“正手拉”或“反手拉”")
    if (c.spin === "top" && kind === "push") reason = "进阶控制：需收拍形并主动摩擦；容易冒高，不作常规首选"
    if (c.spin === "neutral" && kind === "counter") return fail("缺少可反拉的上旋，宜主动拉球")
    if (c.spin === "top" && !c.strong && !c.highArc && c.pace < 4.5 && ["drive", "block"].includes(kind) && tech !== "bhPunch")
      reason = "来球较慢且上旋较弱，借力回球容易过短，需自己补力。"
    if (c.spin === "neutral" && tech !== "bhPunch" && ["drive", "block"].includes(kind) && c.pace < 4.5) return fail("来球较慢，主动拉比单纯借力更合适")
    if (short && kind === "short" && c.spin === "top") reason = "需早触球、卸力和控制拍形，容易冒高"
  }
  if (kind === "flick" && contactHeight < COURT.net)
    reason = c.spin === "under" ? "触球点低于网高，又带下旋。需调好拍形、摩擦起球。" : "触球点低于网高，需上步摩擦过网，直接向前挑容错较小。"
  if (kind === "cut" && c.spin !== "top") return fail("侧切用来卸掉上旋来球的冲力，并改变回球节奏")
  if (tech === "bhCounter" && c.spin === "top" && !c.strong && !c.highArc && Math.abs(incoming.top) < 135)
    return fail("上旋分量不足，近台可撕；来球较快可快拨或防")
  if (kind === "counter" && !c.rushed && !c.strong && !c.highArc && c.pace < 5.8)
    return fail("来球偏软，主动拉更合适")
  if (kind === "counter" && c.rushed) reason = "需提前到位、紧凑引拍；通常先快带或防更稳"
  if (tech === "bhPunch" && (c.combinedSpin >= 190 || c.low || contactHeight < COURT.net)) return fail("弹击需要较高、旋转较弱的机会球")
  if (tech === "bhPunch") reason = "在高点短促发力，先确保击球高度"
  if (c.lane === "fh" && !fh) {
    if (tech === "banana" && short) reason = (reason ? reason + " " : "") + "需提前上步到正手位，给反手拧拉留出空间。"
    else return fail("来球在正手侧，这项需要额外跨区站位")
  }
  if (c.lane === "bh" && fh && !isPivot(tech)) return fail("来球在反手侧；用正手请选侧身技术")
  if (isPivot(tech) && c.lane === "fh") return fail("正手位不需要侧身")
  if (isPivot(tech)) reason = c.rushed ? "来球较快，侧身时间不足，不作为首选" : "先侧身让出空间，再准备扑正手"
  if (tech === "bhTurnFlip") reason = (reason ? reason + " " : "") + "低频变化手段，按自己的熟练程度选择。"
  if (kind === "cut") reason = "控制变化手段，需要熟练的侧向摩擦"
  return { allowed: true, conditional: !!reason, reason, effort: strokeEffort(tech) }
}
const optionCache = new WeakMap()
export function optionsFor(incoming, hands, preferences = []) {
  if (!incoming?.valid) return []
  const selected = incoming.isServe && incoming.receiver === "opponent" ? receiveSelection(preferences) : null
  const key = JSON.stringify([hands.myHand ?? "right", hands.hand, selected && [...selected]])
  if (optionCache.get(incoming)?.has(key)) return optionCache.get(incoming).get(key)
  const c = readIncoming(incoming), mixed = playerHand("me", hands) !== playerHand("opponent", hands)
  const lanes = c.lane === "mid" ? ["bh", "fh"] : [c.lane]
  const candidates = [], add = (tech, zone, reason) => candidates.push({ tech, zone, reason })
  for (const lane of lanes) {
    const fh = lane === "fh", diagonal = (mixed ? fh ? "bh" : "fh" : lane) + "-long"
    const side = c.sideExit ? "先跟住出边方向，让出空间。" : ""
    if (incoming.short) {
      if (c.spin === "under") {
        const flip = lane + "Flip"
        const height = contactFor(incoming, flip)?.p[2] ?? incoming.apex?.height
        // A high contact alone does not make a heavily sidespinning serve easy to flick.
        const manageableSpin = Math.abs(incoming.top) < 100 && c.combinedSpin < 190
        if (manageableSpin && height >= COURT.net + .04)
          add(flip, diagonal, "下旋较轻、触球点较高，可迎前挑打。")
        const deepForehandReceive = incoming.isServe && fh && c.lane === "fh" && Math.abs(incoming.side) >= 50
        const touch = [lane + "Touch", "mid-short", "抢上升期轻触，控低、控短，限制对方直接上手。"]
        const fastPush = [lane + "Push", "bh-long", "抢上升期迎前，劈到底线，压缩对方起板时间。"]
        const push = [lane + "PushControl", deepForehandReceive ? "bh-long" : "mid-long", "来球带下旋，摩擦送深，比劈长更容易控制节奏。"]
        // Against a short sidespin-backspin serve to the forehand, prepare the two
        // deep backhand replies first. Each must still pass the trajectory checks.
        const controlOptions = deepForehandReceive ? [push, fastPush, touch] : [touch, fastPush, push]
        for (const option of controlOptions) add(...option)
        add(fh ? "fhFlip" : "banana", diagonal, "到位后主动摩擦，台内抢先上手。")
        if (!fh) add("bhFlip", diagonal, "在高点附近挑打；低而转的下旋需要更多向上摩擦。")
        else add("banana", diagonal, "提前移动到正手位，留出反手拧拉空间。")
      } else {
        const flatPush = [lane + "FlatPush", "bh-long", "在上升期迎前推向反手底线；有侧旋时先校正拍形。"]
        const firstPush = incoming.isServe && c.spin === "top" && !c.strong && !c.rushed
        if (firstPush) add(...flatPush)
        add(fh ? "fhFlip" : "banana", diagonal, "上步迎高点，主动发力。")
        if (!fh) add("bhFlip", "mid-long", "小动作向前，抢节奏。")
        else add("banana", diagonal, "提前移动到正手位，反手摩擦上手。")
        add(lane + "Touch", "mid-short", "抢早卸力，控制回球高度。")
        if (!firstPush) add(...flatPush)
        if (c.spin === "neutral") {
          add(lane + "PushControl", "mid-long", "拍形少后仰，主动摩擦控低。")
          add(lane + "Push", "bh-long", "收住拍形，快速送深。")
        }
        if (!fh && c.spin === "top") add("bhSideCut", "mid-long", "侧向摩擦，改变旋转与节奏。")
      }
    } else if (c.spin === "under") {
      const high = [lane + "HighUnder", diagonal, side + "以摩擦提拉为主，先稳住弧线。"]
      const rush = [lane + "RushUnder", "mid-long", side + "到位后向前加速，冲击衔接点。"]
      const favorHigh = c.strong || c.low || c.nearSideExit || c.rushed
      add(...(favorHigh ? high : rush)); add(...(favorHigh ? rush : high))
      if (!c.sideExit) add(lane + "PushControl", "mid-long", "不便上手时搓低，先稳住这一板。")
      if (!fh && !c.rushed && !c.sideExit) add(favorHigh ? "pivotHigh" : "pivotRush", "fh-long", "提前侧身，用正手起板。")
    } else if (!c.rushed && (c.spin === "neutral" || (!c.highArc && c.pace < 5.8 && !c.strong))) {
      add(lane + "LoopTop", diagonal, side + "来球冲力不强，主动发力拉。")
      if (!fh) {
        add("bhRip", diagonal, "近台迎前摩擦，抢在来球上升阶段发力。")
        add("bhFlatPush", "bh-long", "来球冲力不大，可小动作迎前推深。")
      }
      if (!fh) add("bhPunch", "bh-long", "较高的弱旋转球可短促弹击。")
      if (c.pace >= 4.5) add(lane + "Drive", diagonal, "有一定来速时，小动作迎前。")
    } else {
      const drive = [lane + "Drive", diagonal, "紧凑引拍，借来球速度衔接。"]
      const block = [lane + "Block", "mid-long", "稳住拍面，小动作防回去。"]
      const counter = [fh ? "fhCounter" : "bhCounter", diagonal, c.rushed ? "若已判断好线路，可在身前紧凑反击。" : "来球留有时间，主动摩擦反击。"]
      if (c.rushed) { add(...block); add(...drive); add(...counter) }
      else if (c.highArc) { add(...counter); add(...block); add(...drive) }
      else { add(...drive); add(...block); add(...counter) }
      if (!fh) add("bhSideCut", "mid-long", "熟练时用侧切改变节奏。")
    }
  }
  if (c.lane === "mid") {
    const firstFh = candidates.findIndex(x => x.tech.startsWith("fh"))
    if (firstFh > 1) candidates.splice(1, 0, ...candidates.splice(firstFh, 1))
  }
  // A player's observed repertoire can include uncommon but feasible receives.
  // Keep conditional techniques behind routine responses and check every trajectory.
  if (selected) for (const tech of selected) {
    if (!candidates.some(option => option.tech === tech))
      add(tech, STROKES[tech].kind === "short" ? "mid-short" : "mid-long", techniqueDescription(tech))
  }
  const seen = new Set()
  const options = candidates.flatMap(candidate => {
    if ((selected && !selected.has(candidate.tech)) || seen.has(candidate.tech)) return []
    const assessment = assessStroke(incoming, candidate.tech)
    if (!assessment.allowed) return []
    let choice = candidate
    if (incoming.follow) {
      if (!incoming.receiver) return []
      const zones = [candidate.zone, ...(STROKES[candidate.tech].kind === "short" ? ["mid-short", "bh-short", "fh-short"] : ["mid-long", "bh-long", "fh-long"])]
      choice = null
      for (const zone of new Set(zones)) {
        const result = simulateReturn(incoming, { tech: candidate.tech, zone }, incoming.receiver, hands)
        if (result?.valid && result.zone === zone && result.targetError < .14 &&
          (zone.endsWith("-short") ? result.short : !result.short)) {
          choice = { ...candidate, zone }; break
        }
      }
      if (!choice) return []
    }
    seen.add(candidate.tech)
    return [{ ...choice, ...assessment, reason: candidate.reason, condition: assessment.reason, pressure: c.pressure }]
  })
  // Compare ordinary responses first. A cross-table backhand also needs an extra step.
  options.sort((a, b) => Number(a.conditional) - Number(b.conditional) ||
    (c.lane === "fh" ? Number(a.tech === "banana") - Number(b.tech === "banana") : 0))
  if (options.length) options[0].priority = !options[0].conditional
  if (!optionCache.has(incoming)) optionCache.set(incoming, new Map())
  optionCache.get(incoming).set(key, options)
  return options
}
function buildBranches(mode, hands, serve, saved, preferences, limit) {
  const serveActor = shotActor(mode, 0)
  const incoming = simulateServe(serve, serveActor, hands)
  const routes = []
  for (const second of optionsFor(incoming, hands, preferences).slice(0, 4)) {
    const secondBall = simulateReturn(incoming, second, shotActor(mode, 1), hands)
    const thirdOptions = optionsFor(secondBall, hands)
    for (const third of thirdOptions.slice(0, mode === "serve" ? 2 : 1)) {
      const thirdBall = simulateReturn(secondBall, third, shotActor(mode, 2), hands)
      if (!thirdBall?.valid) continue
      const fourth = mode === "receive" ? optionsFor(thirdBall, hands).find(option =>
        simulateReturn(thirdBall, option, "me", hands)?.valid) : null
      if (mode === "receive" && !fourth) continue
      const steps = fourth ? [serve, second, third, fourth] : [serve, second, third]
      if (!saved.has(patternKey(mode, hands, steps))) {
        const last = fourth || third
        const reason = `接发用${STROKES[second.tech].name}到${zoneName(second.zone)}。${last.condition || last.reason}`
        routes.push({ steps, reason })
        if (routes.length === limit) return routes
        break
      }
    }
  }
  return routes
}

const differentOpeners = (base, mode) => {
  const lane = base.zone.split("-")[0]
  const length = base.zone.endsWith("short") ? "short" : "long"
  const pairedZone = length === "short" ? base.zone : lane + "-short"
  return mode === "serve" ? [
    serveShot("plain", "dead", pairedZone, "medium", base.position),
    serveShot("plain", "under", pairedZone, "medium", base.position),
    serveShot(base.family === "pendulum" ? "reverse" : "pendulum", "sideUnder", "mid-short"),
    serveShot("backhand", "sideTop", "mid-long"),
    serveShot("hook", "sideUnder", "bh-short"),
  ] : [
    serveShot("pendulum", "sideTop", "fh-short"),
    serveShot("plain", "dead", "mid-short"),
    serveShot("backhand", "sideTop", "mid-long"),
    serveShot("hook", "sideUnder", "fh-short"),
  ]
}

export function findIdeas(mode, hands, current, patterns, preferences = []) {
  const saved = new Set(patterns.map(pattern => patternKey(pattern.mode, pattern, pattern.steps)))
  const savedOpeners = new Set(patterns.map(pattern => openingKey(pattern.mode, pattern, pattern.steps[0])))
  const activeOpening = current ? openingKey(mode, hands, current) : null
  const branches = current ? buildBranches(mode, hands, current, saved, preferences, 3) : []
  const reference = current ?? serveShot("pendulum", "sideUnder", "mid-short")
  const openers = []
  for (const candidate of differentOpeners(reference, mode)) {
    const shot = { ...candidate, distance: reference.distance ?? candidate.distance }
    const key = openingKey(mode, hands, shot)
    if (key === activeOpening || savedOpeners.has(key)) continue
    const [route] = buildBranches(mode, hands, shot, saved, preferences, 1)
    if (route) openers.push(route)
    if (openers.length === 3) break
  }
  return { branches, openers }
}

export function comparePlacement(result, goal) {
  if (!result || result.status !== "in" || !result.target) return ""
  const dx = result.landing[0] - result.target[0]
  if (Math.abs(dx) > .09) return "向图" + (dx > 0 ? "右" : "左") + "偏"
  if (result.zone !== goal && Math.abs(result.landing[1] - result.target[1]) > .09) return "落点偏离目标区"
  return ""
}
