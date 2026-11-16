import { STROKES, openingKey, patternKey, playerHand, serveShot, shotActor } from "./catalog.mjs"
import { COURT, simulateReturn, simulateServe, verticalSpin } from "./physics.mjs"

const pick = (tech, zone, reason) => ({ tech, zone, reason })

const intents = {
  short: "control", push: "control", cut: "control", block: "defense",
  flick: "attack", loop: "attack", drive: "attack", counter: "attack",
}
const intentLabels = { attack: "进攻", control: "控制", neutral: "中性", defense: "防守" }

function pressureFor(incoming) {
  const stroke = STROKES[incoming.tech]
  const pace = incoming.pace
  const deep = Math.abs(incoming.landing?.[1] ?? 0) >= .82 * COURT.halfLength
  const nearSideExit = incoming.exit?.edge === "side" && Math.abs(incoming.exit.p[1]) < .50 * COURT.halfLength
  const apex = incoming.follow?.states.find(({ v }) => v[2] <= 0)?.p[2]
  const low = apex != null && apex < .13
  const rushed = pace >= 8.6 || (pace >= 7.5 && (low || deep || nearSideExit))
  const originalIntent = intents[stroke?.kind] ?? "neutral"
  const highArc = originalIntent === "attack" && incoming.net?.clearance >= .145 && apex >= .175
  const arc = stroke?.arc ?? (highArc ? "high" : null)
  const mildAttack = originalIntent === "attack" && !arc && pace < 6 && incoming.top < 150
  const intent = mildAttack ? "neutral" : originalIntent
  return { intent, arc, rushed, low, nearSideExit, kind: stroke?.kind }
}

export function incomingIntentLabel(incoming) {
  return incoming.tech ? intentLabels[pressureFor(incoming).intent] + "回球" : ""
}

function forehandShortControl({ diagonal, readNote, spin }) {
  const touch = pick("fhTouch", "fh-short", readNote + "上步在上升期轻触，保持低短。")
  const deep = pick("fhPush", "bh-long", "触球早一些，快送对方反手底线，留出还原时间。")
  const flip = pick("fhFlip", diagonal, "够到高点时用小动作挑打，随后及时还原。")
  return spin === "top" ? [flip, touch, deep] : [touch, deep, flip]
}

function shortBackspin({ fh, diagonal, readNote, top, low }) {
  const touch = pick(fh ? "fhTouch" : "bhTouch", fh ? "fh-short" : "mid-short",
    readNote + "上步抢上升期，控低、控短，限制对方直接起板。")
  const push = pick(fh ? "fhPushControl" : "bhPushControl", "mid-long",
    "按正常节奏搓过网，靠落点和下旋给自己留出还原时间。")
  const deep = pick(fh ? "fhPush" : "bhPush", "bh-long",
    "触球早一些，快速劈向反手底线，随后准备对方起板。")
  const banana = pick("banana", "mid-long",
    fh ? "能上步够到球时，再用反手拧到衔接点，出手后及时还原。" :
      "先让肘部到位，摩擦把下旋拧起，压到对方衔接点。")
  const flip = pick(fh ? "fhFlip" : "bhFlip", diagonal,
    "有合适的击球高度时可以挑；旋转越重，越需要擦住球、先提起来。")
  return top < -145 || low ? [touch, deep, push, banana, flip] :
    fh ? [touch, deep, flip, push, banana] : [banana, touch, deep, push, flip]
}

function shortActive({ fh, diagonal, readNote, spin, top, low, intent }) {
  const flip = pick(fh ? "fhFlip" : "bhFlip", diagonal,
    readNote + "上步抢高点，小动作向前挑，打对方刚还原时的空当。")
  const banana = pick("banana", "mid-long",
    fh ? "脚下能赶到正手短球时，可以拧到对方衔接点。" :
      "台内主动拧到中间，做好对方快带或反撕回来的准备。")
  const touch = pick(fh ? "fhTouch" : "bhTouch", fh ? "fh-short" : "mid-short",
    readNote + (spin === "top" ? "上升前期卸力，收住拍面和触球长度。" : "球低时在上升前期轻触，控制回球高度。"))
  const options = low && intent !== "attack" ? [touch, fh ? flip : banana] :
    fh ? [flip, banana, touch] : [banana, flip, touch]
  if (!fh && spin === "top") {
    options.push(pick("bhSideCut", "mid-long",
      "来球带上旋时用反手向侧下方切，变出侧下旋和节奏，留好下一板。"))
  }
  if (top < 115) {
    options.push(pick(fh ? "fhPush" : "bhPush", "bh-long",
      "上旋较弱或来球近似不转时，可收一点拍面，快送到反手底线。"))
  }
  return options
}

function longBackspin({ fh, diagonal, readNote, top, pace, low, rushed, exitsSide, nearSideExit, intent }) {
  const high = pick(fh ? "fhHighUnder" : "bhHighUnder", diagonal,
    readNote + "下旋较重或球已经下沉时，向上摩擦，先把弧线和旋转拉出来。")
  const rush = pick(fh ? "fhRushUnder" : "bhRushUnder", "mid-long",
    readNote + "球够高、脚下到位时，在摩擦提球的同时向前加速，冲对方衔接点。")
  const favorHigh = top < -165 || low || nearSideExit || rushed || (intent === "control" && pace >= 6.5)
  const change = fh ?
    pick(favorHigh ? "fhHighUnder" : "fhRushUnder", diagonal === "fh-long" ? "bh-long" : "fh-long",
      "到位后变直线，观察对方是否提前站在斜线。") :
    pick(favorHigh ? "pivotHigh" : "pivotRush", "fh-long",
      "来球给足时间时可侧身起板，击球后留出扑正手的还原空间。")
  const push = pick(fh ? "fhPushControl" : "bhPushControl", "mid-long",
    "起板时机已经错过时，先搓低到中间，准备对方先上手。")
  const deep = pick(fh ? "fhPush" : "bhPush", "bh-long",
    "对手站得靠前时，快劈底线，缩短对方引拍的时间。")
  const loops = favorHigh ? [high, rush] : [rush, high]
  return exitsSide ? [...loops, change] : [...loops, change, push, deep]
}

function longNeutral({ fh, diagonal, readNote, hasSide, exitsSide, low }) {
  const tech = fh ? "fhLoopTop" : "bhLoopTop"
  const loop = pick(tech, diagonal,
    readNote + (hasSide ? "主动摩擦起板，给回球留一点弧线。" : "主动加速摩擦，先拉出速度和弧线。"))
  const change = pick(tech, "mid-long", "能迎到球时主动拉向中间，压对方正反手的衔接点。")
  if (exitsSide || !low) return [loop, change]
  return [loop, change, pick(fh ? "fhPushControl" : "bhPushControl", "mid-long",
    readNote + "击球点低且来不及拉时，可以轻搓一板先控住。")]
}

function longTopspin({ fh, diagonal, readNote, arc, intent, pace, top, low, rushed }) {
  const drive = pick(fh ? "fhDrive" : "bhDrive", diagonal,
    readNote + (fh ? "短引拍，顺着来球的冲力快带回斜线。" : "稳定肘部，借来球的速度小动作快拨。"))
  const counter = pick(fh ? "fhCounter" : "bhCounter", "mid-long",
    readNote + "高吊弧线给了迎前时间，找准击球点后加力反击。")
  const defend = pick(fh ? "fhBlock" : "bhBlock", diagonal,
    readNote + "球顶身或来不及充分引拍时，小动作借力防回深区。")
  const cut = pick("bhSideCut", "mid-long",
    readNote + "用反手向侧下方切回去，改变上旋相持的旋转与节奏。")
  const active = pick(fh ? "fhLoopTop" : "bhLoopTop", "mid-long",
    readNote + "有引拍和迎前的时间，主动向前加速，拉向对方衔接点。")
  if (rushed) return fh ? [defend, drive] : [defend, drive, cut]
  if (arc === "high") return fh ? [counter, defend] : [counter, defend, cut]
  if (arc === "forward" || (intent === "attack" && (pace >= 6 || top >= 150)) || pace >= 6.9) {
    return fh ? [drive, defend] : [drive, defend, cut]
  }

  const change = pick(active.tech, diagonal, readNote + "站稳后主动拉斜线，把对方调出中间。")
  const options = [active, change]
  if (!fh && !low) options.push(pick("bhPunch", "bh-long",
    "有高点且来球不顶时，反手短促向前弹，抢节奏。"))
  if (!fh) options.push(cut)
  return options
}

export function optionsFor(incoming, hands) {
  if (!incoming?.valid) return []
  const fh = (incoming.contactLane ?? incoming.lane) === "fh"
  const mixedHands = playerHand("me", hands) !== playerHand("opponent", hands)
  const diagonal = (mixedHands ? (fh ? "bh" : "fh") : (fh ? "fh" : "bh")) + "-long"
  const spin = verticalSpin(incoming)
  const hasSide = Math.abs(incoming.side) >= 50
  const exitsSide = incoming.exit?.edge === "side"
  const pressure = pressureFor(incoming)
  const move = pressure.nearSideExit ? "上步到侧边，抓刚出台的时机，" : exitsSide ? "先横向跟住出边方向，" : ""
  const turn = hasSide ? (move ? "同时补偿侧旋，" : "先校正侧旋方向，") : ""
  const context = { ...pressure, fh, diagonal, readNote: move + turn, spin, hasSide, exitsSide,
    top: incoming.top, pace: incoming.pace }
  if (incoming.short) {
    if (context.kind === "short" && fh) return forehandShortControl(context)
    return spin === "under" ? shortBackspin(context) : shortActive(context)
  }
  if (spin === "under") return longBackspin(context)
  return spin === "neutral" ? longNeutral(context) : longTopspin(context)
}

function buildBranches(mode, hands, serve, saved) {
  const serveActor = shotActor(mode, 0)
  const incoming = simulateServe(serve, serveActor, hands)
  const routes = []
  for (const second of optionsFor(incoming, hands).slice(0, 4)) {
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
        routes.push({ steps, reason: (fourth || third).reason })
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
    { shot: serveShot("plain", "dead", pairedZone, "medium", base.position), reason: "把同一落点改为不转，准备对方按下旋接时回高或回长。" },
    { shot: serveShot("plain", "under", pairedZone, "medium", base.position), reason: "和不转配成一组，用相似动作变旋转，观察摆短和劈长的变化。" },
    { shot: serveShot(base.family === "pendulum" ? "reverse" : "pendulum", "sideUnder", "mid-short"), reason: "改变侧旋方向并压短中间，观察对方上步位置和出手线路。" },
    { shot: serveShot("backhand", "sideTop", "mid-long"), reason: "用长侧上抢时间，提前准备对方上手后防回或反撕。" },
    { shot: serveShot("hook", "sideUnder", "bh-short"), reason: "把短侧下换到反手区，练对方拧起来后第三板怎么衔接。" },
  ] : [
    { shot: serveShot("pendulum", "sideTop", "fh-short"), reason: "练正手短侧上的挑打和还原，观察对方第三板回快带还是防回。" },
    { shot: serveShot("plain", "dead", "mid-short"), reason: "读准短不转，试摆短和先上手两种处理，比较第四板机会。" },
    { shot: serveShot("backhand", "sideTop", "mid-long"), reason: "练接长侧上到衔接点，抢先上手后准备对方借力防回来。" },
    { shot: serveShot("hook", "sideUnder", "fh-short"), reason: "练正手劈长扰乱发抢，或摆短后等对方先变长。" },
  ]
}

export function findIdeas(mode, hands, current, patterns) {
  const saved = new Set(patterns.map(pattern => patternKey(pattern.mode, pattern, pattern.steps)))
  const savedOpeners = new Set(patterns.map(pattern => openingKey(pattern.mode, pattern, pattern.steps[0])))
  const activeOpening = current ? openingKey(mode, hands, current) : null
  const branches = current ? buildBranches(mode, hands, current, saved).slice(0, 3) : []
  const reference = current ?? serveShot("pendulum", "sideUnder", "mid-short")
  const openers = differentOpeners(reference, mode)
    .filter(({ shot }) => {
      const key = openingKey(mode, hands, shot)
      return key !== activeOpening && !savedOpeners.has(key)
    }).slice(0, 3).flatMap(({ shot, reason }) => {
      const firstRoute = buildBranches(mode, hands, shot, saved)[0]
      return firstRoute ? [{ ...firstRoute, reason }] : []
    })
  return { branches, openers }
}

export function comparePlacement(result, goal) {
  if (!result || result.status !== "in" || !result.target) return ""
  const dx = result.landing[0] - result.target[0]
  if (Math.abs(dx) > .09) return "向图" + (dx > 0 ? "右" : "左") + "偏"
  if (result.zone !== goal && Math.abs(result.landing[1] - result.target[1]) > .09) return "落点偏离目标区"
  return ""
}
