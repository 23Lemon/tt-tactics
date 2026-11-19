import { receiveSelection } from "./repertoire.mjs"
import { STROKES, openingKey, patternKey, playerHand, serveShot, shotActor, strokeFace, strokeFitsRubber, strokeLane, zoneName } from "./catalog.mjs"
import { COURT, contactFor, simulateReturn, simulateServe, verticalSpin } from "./physics.mjs"
import { ANTI_RUBBERS, LONG_RUBBERS, RUBBERS, rubberFor } from "./rubbers.mjs"

const intentLabels = { attack: "进攻", control: "控制", neutral: "中性", defense: "防守" }
const isUnderStroke = tech => /Under|^pivot/.test(tech)
const isPivot = tech => tech.startsWith("pivot")
const blocks = ["block", "softBlock", "punchBlock", "knock"]
const specialtyText = {
  softBlock: "触球时减力，控制回球的速度和落点。",
  knock: "在身前向下磕球，适合有旋转、来速可控的上旋。",
  scrape: "从球侧面刮出，适合处理下旋和改变回球线路。",
  pipPush: "用小动作迎前送球，适合将下旋球拱深。",
  pipHit: "来球有高度时迎前击打。",
  squeeze: "借来球力量侧向推送，改变落点和节奏。",
  swipe: "从球侧面撇出，改变回球线路。",
  chop: "退台让出挥拍空间，向下削回对方的上旋。",
  antiLift: "调整拍形，向前上方托推下旋球。",
  antiBump: "小幅托送来球，先控制回球的弧线和落点。",
  antiTap: "在身前小幅向前推拨，改变回球速度。",
  antiBrush: "向前上方轻提，适度增加回球旋转。",
  punchBlock: "挡上旋时小幅迎前加力，出球比轻挡更快。",
  antiHit: "来球有高度时主动迎前推打。",
  wipe: "接台内短球时，用反手往侧前方轻轻一带，改变落点和节奏。",
}

export function strokeEffort(tech) {
  const kind = STROKES[tech]?.kind
  if (["block", "softBlock", "knock", "drive", "cut"].includes(kind)) return "借力"
  if (["counter", "loop", "flick", "rip", "hit", "pipPush", "pipHit", "antiTap", "antiBrush", "antiHit", "punchBlock"].includes(kind)) return "发力"
  return "控制"
}
export function techniqueDescription(tech) {
  if (tech === "bhPenhold") return "传统直拍反手推挡使用球拍正面，可借力挡，也可加力推。"
  if (tech === "bhFlatPush") return "反手迎前推送，适合不转或较弱上旋。传统直拍推挡用球拍正面，可在自选技术中选择。"
  if (tech === "fhFlatPush") return "迎前推送，以撞击为主。适合不转或上旋分量不强的台内球。"
  if (tech === "bhRip") return "近台迎上升期，小幅向前摩擦发力，抢一般上旋或不转球的节奏。"
  if (tech === "bhSideBrush") return "也叫侧兜。台内反手侧向摩擦改变线路；此处示范稍向前上的一种，实际出球随触球方向变化。"
  if (tech === "banana") return "台内反手摩擦起板，常带侧上旋；接重下旋需要更多向上摩擦。"
  if (tech === "bhTurnFlip") return "台内翻转拍面，改变触球与出球方向；低频变化手段。"
  if (tech === "bhPunch") return "在较高的弱旋转球上短促撞击，突然加速。"
  if (tech === "bhPunchUnder") return "反手生胶在身前抢较高的击球点，短促向前上方弹击下旋。"
  if (tech === "fhLiftUnder") return "正胶用较小的引拍向前上方提拉，先保证出台下旋的过网弧线。"
  if (tech === "bhLiftUnder") return "有引拍空间时，反手向前上方带起出台下旋。"
  if (tech === "fhHitUnder") return "正胶在较高击球点主动迎前突击下旋。"
  if (tech === "fhHit") return "来球有高度时，用紧凑的正手动作向前击打。"
  const stroke = STROKES[tech]
  if (!stroke) return ""
  if (specialtyText[stroke.kind]) return specialtyText[stroke.kind]
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
  const intent = ["short", "push", "cut", "flatPush", "sideBrush", "wipe", "antiBump"].includes(kind) ? "control" : blocks.includes(kind) || kind === "chop" ? "defense" :
    !incoming.tech || (pace < 4.8 && !strong && !highArc) ? "neutral" : "attack"
  const pressure = rushed ? "来球较快" : strong ? "旋转较强" : nearSideExit ? "需要让位" : Math.abs(incoming.side) >= 190 ? "侧旋较强" : low ? "弧线较低" : "有发力时间"
  return { spin, pace, low, rushed, strong, combinedSpin, highArc, sideExit, nearSideExit, intent, pressure,
    lane: incoming.contactLane ?? incoming.lane ?? "mid", height, availableTime }
}
export const incomingIntentLabel = incoming => incoming?.tech ? intentLabels[readIncoming(incoming).intent] + "回球" : ""

// One eligibility policy for both the automatic suggestions and manual menu.
export function assessStroke(incoming, tech, hands) {
  const stroke = STROKES[tech]
  const fail = reason => ({ allowed: false, reason, effort: strokeEffort(tech), conditional: false })
  if (!stroke || !incoming?.valid) return fail("先选好有效的上一板")
  const rubber = rubberFor(hands, incoming.receiver, strokeFace(tech))
  if (!strokeFitsRubber(tech, incoming.receiver, hands)) return fail("当前击球面为" + RUBBERS[rubber].name + "，请选择该胶面的技术")
  const c = readIncoming(incoming), kind = stroke.kind, fh = strokeLane(tech) === "fh", short = incoming.short
  let reason = ""
  if (short && ["loop", "counter", "chop"].includes(kind)) return fail("二跳仍在台内，没有完整引拍空间")
  if (!short && kind === "flick") return fail("来球已出台，改用拉球更合适")
  const contact = contactFor(incoming, stroke)
  if (contact && !contact.available) return fail("当前击球窗口过低或过晚，换更早触球的技术")
  const contactHeight = contact?.p[2] ?? c.height
  const highEnough = contactHeight >= COURT.net
  if (short && rubber === "inverted" && [...blocks, "drive"].includes(kind)) {
    if (c.spin !== "top" || !highEnough) return fail("台内借力需要够得着的较高上旋球")
    reason = "需及时上步，在身前控制拍形和回球长度"
  }
  if (!short && kind === "short") return fail("来球已出台，摆短不是稳定的常规处理")
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
  if (kind === "wipe") {
    if (!short || c.spin === "under" || c.rushed || c.strong) return fail("反手抹适合不转或带轻微上旋的台内短球")
    reason = "变化手法，需在身前留出侧向动作空间"
  }
  if (["hit", "pipHit", "antiHit"].includes(kind)) {
    if (!highEnough || c.combinedSpin >= (tech === "bhPunch" ? 190 : 200))
      return fail("这项击打需要较高、旋转可控的击球点")
    if (short && ["fhHit", "fhHitUnder", "bhPunchUnder"].includes(tech))
      return fail("台内空间有限，可改用挑打或控制")
  }
  if (["scrape", "pipPush", "swipe", "antiLift"].includes(kind) && c.spin !== "under")
    return fail("这项手法主要用于下旋来球")
  if (["knock", "chop", "punchBlock"].includes(kind) && c.spin !== "top")
    return fail("这项手法主要用于上旋来球")
  if (kind === "knock" && c.rushed) reason = "来球较快，需要提前到位，常规挡球更稳"
  if (kind === "chop" || kind === "squeeze" || kind === "swipe") reason = "变化手法，需要合适的击球空间"
  if (c.spin === "under") {
    if (["drive", "block", "softBlock", "counter", "cut"].includes(kind) && !LONG_RUBBERS.includes(rubber) && !ANTI_RUBBERS.includes(rubber) ||
        kind === "loop" && !isUnderStroke(tech) || kind === "hit" && !isUnderStroke(tech))
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
  if (tech === "bhCounter" && c.spin === "top" && !c.strong && !c.highArc && !c.rushed && c.pace < 5.5 && Math.abs(incoming.top) < 135)
    return fail("上旋分量不足，近台可撕；来球较快可快拨或防")
  if (kind === "counter" && !c.rushed && !c.strong && !c.highArc && c.pace < 5.8)
    return fail("来球偏软，主动拉更合适")
  if (kind === "counter" && c.rushed) reason = "需提前到位、紧凑引拍；通常先快带或防更稳"
  if (tech === "bhPunch") reason = "在高点短促发力，先确保击球高度"
  if (c.lane === "fh" && !fh) {
    if (tech === "banana" && short) reason = (reason ? reason + " " : "") + "需提前上步到正手位，给反手拧拉留出空间。"
    else return fail("来球在正手侧，这项需要额外跨区站位")
  }
  if (c.lane === "bh" && fh && !isPivot(tech)) return fail("来球在反手侧；用正手请选侧身技术")
  if (isPivot(tech) && c.lane === "fh") return fail("正手位不需要侧身")
  if (isPivot(tech)) reason = c.rushed ? "来球较快，侧身时间不足，不作为首选" : "先侧身让出空间，再准备扑正手"
  if (tech === "bhTurnFlip") reason = (reason ? reason + " " : "") + "低频变化手段，按自己的熟练程度选择。"
  if (tech === "bhPenhold") reason = "仅适用于用球拍正面击球的传统直拍反手推挡"
  if (kind === "cut") reason = "控制变化手段，需要熟练的侧向摩擦"
  return { allowed: true, conditional: !!reason, reason, effort: strokeEffort(tech) }
}
const optionCache = new WeakMap()

function rubberOptions(add, rubber, lane, diagonal, incoming, c) {
  const short = incoming.short
  const under = c.spin === "under"
  const shortTarget = lane + "-short"
  const offer = (suffix, zone = diagonal) => {
    const tech = lane + suffix
    add(tech, zone, techniqueDescription(tech))
  }
  if (LONG_RUBBERS.includes(rubber)) {
    if (under) {
      for (const suffix of short ? ["Scrape", "PipPush"] : ["PipPush", "Scrape", "PipHit"]) offer(suffix)
      offer("SoftBlock", shortTarget)
    } else {
      if (!c.rushed && c.spin === "top") offer("Knock", "mid-long")
      offer("Block")
      offer("SoftBlock", shortTarget)
      if (!short) offer("PipHit")
    }
  } else if (ANTI_RUBBERS.includes(rubber)) {
    if (under) {
      offer("AntiLift")
      offer("AntiBump", shortTarget)
    } else {
      offer("Block")
      offer("SoftBlock", shortTarget)
      offer("PunchBlock")
      if (!c.rushed) {
        offer("AntiTap")
        offer("AntiBrush", short ? shortTarget : diagonal)
      }
    }
    if (!c.rushed) offer("AntiHit")
  } else if (short) {
    if (!under) offer("Flip")
    offer("Touch", shortTarget)
    offer("Push", "mid-long")
    if (under) offer("Flip")
    offer("Block")
  } else if (under) {
    if (lane === "fh" && rubber === "short") {
      for (const suffix of c.strong || c.low ? ["LiftUnder", "HitUnder"] : ["HitUnder", "LiftUnder"]) offer(suffix)
    }
    if (lane === "bh" && rubber === "raw") {
      offer("PunchUnder")
      offer("LiftUnder")
    }
    offer("PushControl", "mid-long")
  } else {
    if (c.rushed) offer("Block")
    if (lane === "fh") offer("Hit")
    else {
      offer("Drive")
      offer("Punch")
      offer("LoopTop")
    }
    if (!c.rushed) offer("Block")
  }
}

export function optionsFor(incoming, hands, preferences = []) {
  if (!incoming?.valid) return []
  const selected = incoming.isServe && incoming.receiver === "opponent" ? receiveSelection(preferences) : null
  const key = JSON.stringify([hands.myHand ?? "right", hands.hand, hands.rubbers ?? hands.steps?.[0]?.rubbers, selected && [...selected]])
  if (optionCache.get(incoming)?.has(key)) return optionCache.get(incoming).get(key)
  const c = readIncoming(incoming), mixed = playerHand("me", hands) !== playerHand("opponent", hands)
  const lanes = c.lane === "mid" ? ["bh", "fh"] : [c.lane]
  const candidates = [], add = (tech, zone, reason) => candidates.push({ tech, zone, reason })
  for (const lane of lanes) {
    const fh = lane === "fh", diagonal = (mixed ? fh ? "bh" : "fh" : lane) + "-long"
    const side = c.sideExit ? "先跟住出边方向，让出空间。" : ""
    const rubber = rubberFor(hands, incoming.receiver, lane)
    if (rubber !== "inverted") {
      rubberOptions(add, rubber, lane, diagonal, incoming, c)
      continue
    }
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
        if (c.spin === "top") add(lane + "SoftBlock", lane + "-short", "在身前减力，控制回球长度。")
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
      if (fh && !c.low) add("fhHit", diagonal, "来球有高度，可以紧凑地向前快攻。")
      if (c.pace >= 4.5) add(lane + "Drive", diagonal, "有一定来速时，小动作迎前。")
    } else {
      const drive = [lane + "Drive", diagonal, "紧凑引拍，借来球速度衔接。"]
      const block = [lane + "Block", "mid-long", "稳住拍面，小动作防回去。"]
      const counter = [fh ? "fhCounter" : "bhCounter", diagonal, c.rushed ? "若已判断好线路，可在身前紧凑反击。" : "来球留有时间，主动摩擦反击。"]
      if (c.rushed) { add(...block); add(...drive); add(...counter) }
      else if (c.highArc) { add(...counter); add(...block); add(...drive) }
      else { add(...drive); add(...block); add(...counter) }
      if (!fh) add("bhSideCut", "mid-long", "熟练时用侧切改变节奏。")
      add(lane + "SoftBlock", lane + "-short", "减力控短，改变下一板的节奏。")
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
      add(tech, ["short", "softBlock", "wipe", "antiBump"].includes(STROKES[tech].kind) ? "mid-short" : "mid-long", techniqueDescription(tech))
  }
  const seen = new Set()
  const options = candidates.flatMap(candidate => {
    if ((selected && !selected.has(candidate.tech)) || seen.has(candidate.tech)) return []
    const assessment = assessStroke(incoming, candidate.tech, hands)
    if (!assessment.allowed) return []
    let choice = candidate
    if (incoming.follow) {
      if (!incoming.receiver) return []
      const shortTarget = candidate.zone.endsWith("-short")
      const zones = [candidate.zone, ...(shortTarget ? ["mid-short", "bh-short", "fh-short"] : ["mid-long", "bh-long", "fh-long"])]
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
