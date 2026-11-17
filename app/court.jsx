"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronDown, Maximize2, Minimize2, Play, Target } from "lucide-react"
import { forehand, handName, other, playerHand, pointZone, shotActor, shotName, snapPoint, zoneName } from "../lib/table-tennis/catalog.mjs"
import { COURT, clearanceDescription, secondBounceDescription, serveOrigin, spinDescription, targetPoint } from "../lib/table-tennis/physics.mjs"
import { comparePlacement } from "../lib/table-tennis/tactics.mjs"

export const colors = ["#f7cf75", "#bedfff", "#d3f1d3", "#ffd0be"]
const inks = ["#774b00", "#245a91", "#336447", "#934f35"]
const lightColors = ["#fff1cf", "#e8f2fd", "#e6f1e7", "#fff0e7"]

export function NumberBadge({ index }) {
  return <span className="ball-number" style={{ background: lightColors[index], color: inks[index] }}>{index + 1}</span>
}

function positioner(stage, surface) {
  const board = surface.getBoundingClientRect()
  const frame = stage.getBoundingClientRect()
  return p => [
    board.left - frame.left + board.width * (p[0] + COURT.halfWidth) / (2 * COURT.halfWidth),
    board.top - frame.top + board.height * (COURT.halfLength - p[1]) / (2 * COURT.halfLength),
  ]
}

function dot(context, x, y, radius, fill, stroke, width = 1) {
  context.beginPath()
  context.arc(x, y, radius, 0, 2 * Math.PI)
  context.fillStyle = fill
  context.fill()
  if (stroke) {
    context.strokeStyle = stroke
    context.lineWidth = width
    context.stroke()
  }
}

function indicator(context, map, focus, result, hasNext, exact) {
  if (result.spread?.length > 1 && result.landing) {
    const points = [result.landing, ...result.spread].map(map)
    const [xs, ys] = [points.map(p => p[0]), points.map(p => p[1])]
    const [left, right] = [Math.min(...xs), Math.max(...xs)]
    const [top, bottom] = [Math.min(...ys), Math.max(...ys)]
    context.beginPath()
    context.ellipse((right + left) / 2, (bottom + top) / 2,
      Math.max((right - left) / 2 + 7, 12), Math.max((bottom - top) / 2 + 6, 11), 0, 0, Math.PI * 2)
    context.fillStyle = colors[focus] + "39"
    context.strokeStyle = colors[focus] + "9e"
    context.lineWidth = 1.1
    context.fill()
    context.stroke()
  }

  if (!exact && result.target && result.landing && Math.hypot(
    result.landing[0] - result.target[0], result.landing[1] - result.target[1]) > .08) {
    const [x, y] = map(result.target)
    context.beginPath()
    context.arc(x, y, 7, 0, Math.PI * 2)
    context.setLineDash([2, 2])
    context.strokeStyle = colors[focus]
    context.lineWidth = 1.2
    context.stroke()
    context.setLineDash([])
  }

  const second = result.exit?.p ?? (result.short ? result.follow?.hit?.p : null)
  if (second && !hasNext) {
    context.beginPath()
    const continuation = result.exit
      ? [...result.follow.states.slice(0, result.exit.index).map(({ p }) => p), second]
      : result.follow.states.map(({ p }) => p)
    continuation.forEach((p, index) => {
      const [x, y] = map(p)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.setLineDash([2, 4])
    context.strokeStyle = colors[focus] + "b5"
    context.lineWidth = 1.5
    context.stroke()
    context.setLineDash([])
    const [dx, dy] = map(second)
    dot(context, dx, dy, 3.1, result.exit ? "#16473d" : colors[focus] + "bb", colors[focus] + "bb")
  }
}

function drawRoute(context, map, results, focus, playhead, exact) {
  const focused = results[focus]
  if (focused) indicator(context, map, focus, focused, !!results[focus + 1], exact)
  for (let index = 0; index < results.length; index++) {
    const result = results[index]
    if (!result?.points?.length) continue
    const active = index === focus
    const color = colors[index]
    const positions = result.points.map(ball => map(ball.p))
    if (result.serviceBounce) {
      const [x, y] = map(result.serviceBounce)
      dot(context, x, y, 3.6, color, "#295448", 1)
    }
    context.beginPath()
    positions.forEach(([x, y], j) => j === 0 ? context.moveTo(x, y) : context.lineTo(x, y))
    context.lineWidth = active ? 3.05 : 2.15
    context.lineCap = "round"
    context.lineJoin = "round"
    context.strokeStyle = color + (active ? "ff" : "b0")
    context.stroke()

    const [x, y] = positions.at(-1)
    const next = results[index + 1]?.points[0]
    if (result.valid && next) {
      const [nextX, nextY] = map(next.p)
      context.beginPath()
      context.moveTo(x, y)
      context.lineTo(nextX, nextY)
      context.setLineDash([2, 3])
      context.strokeStyle = color + "8a"
      context.lineWidth = 1.4
      context.stroke()
      context.setLineDash([])
    }
    dot(context, x, y, active ? 10.6 : 8.4, color, "#16473d", 1.5)
    context.fillStyle = "#133e33"
    context.font = (active ? "700 11px" : "700 9px") + " system-ui, sans-serif"
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(String(index + 1), x, y + .4)
  }
  if (playhead) {
    const [x, y] = map(playhead.p)
    context.shadowColor = "#1429226b"
    context.shadowBlur = 8
    dot(context, x, y, 5, "#fffef5", "#f7cf75", 1)
    context.shadowBlur = 0
  }
}

const getLabel = (side, hands, length, column) => {
  if (column === 1) return "mid-" + length
  const isForehand = (column === 0 ? -1 : 1) === forehand(side, hands)
  return (isForehand ? "fh-" : "bh-") + length
}

export default function Court({
  mode, hands, active, setup, steps, focus, readResults, visibleResults, adjustment, setAdjustment, setZone, editable = true, expanded = false, setExpanded,
}) {
  const field = useRef(null)
  const stage = useRef(null)
  const canvas = useRef(null)
  const animation = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)")
    const change = () => setCompact(media.matches)
    change(); media.addEventListener("change", change)
    return () => media.removeEventListener("change", change)
  }, [])
  const selectActor = other(shotActor(mode, focus))
  const selected = visibleResults[focus]
  const original = readResults[focus]
  const shot = steps[focus] ?? setup
  const zones = [
    ["opponent", "long"], ["opponent", "short"], ["me", "short"], ["me", "long"],
  ]

  function paint(playhead) {
    if (!stage.current || !field.current || !canvas.current) return
    const screen = stage.current.getBoundingClientRect()
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const element = canvas.current
    const width = Math.round(screen.width * pixelRatio)
    const height = Math.round(screen.height * pixelRatio)
    if (element.width !== width || element.height !== height) {
      element.width = width
      element.height = height
    }
    const context = element.getContext("2d")
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, screen.width, screen.height)
    const map = positioner(stage.current, field.current)
    const [x, y] = map(serveOrigin(setup, shotActor(mode, 0), hands))
    dot(context, x, y, 5.1, "#0e654e", "#eaf5ef", 1.7)
    drawRoute(context, map, visibleResults, focus, playhead, !!shot.point)

    if (shot.point) {
      const target = targetPoint(shot.zone, selectActor, hands, shot.point)
      const [tx, ty] = map(target)
      const coincide = selected?.landing && Math.hypot(
        selected.landing[0] - target[0], selected.landing[1] - target[1],
      ) < .04
      context.beginPath()
      context.arc(tx, ty, coincide ? 13.5 : 6.5, 0, 2 * Math.PI)
      context.lineWidth = 1.4
      context.setLineDash([2, 2])
      context.strokeStyle = "#fff8de"
      context.stroke()
      context.setLineDash([])
      if (!coincide) dot(context, tx, ty, 1.9, "#fff8de")
    }
  }

  useLayoutEffect(() => {
    paint()
    const observer = new ResizeObserver(() => paint())
    observer.observe(stage.current)
    return () => observer.disconnect()
  })

  useEffect(() => {
    if (animation.current) window.cancelAnimationFrame(animation.current)
    animation.current = null
    setPlaying(false)
    return () => {
      if (animation.current) window.cancelAnimationFrame(animation.current)
    }
  }, [visibleResults])

  function replay() {
    if (animation.current) window.cancelAnimationFrame(animation.current)
    const points = visibleResults.flatMap(ball => ball?.points ?? [])
    if (!points.length) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { paint(); return }
    const duration = Math.max(1100, points.length * 9)
    const started = window.performance.now()
    setPlaying(true)
    const tick = now => {
      const fraction = Math.min(1, (now - started) / duration)
      paint(points[Math.min(points.length - 1, Math.floor(points.length * fraction))])
      if (fraction < 1) {
        animation.current = window.requestAnimationFrame(tick)
      } else {
        animation.current = null
        setPlaying(false)
        paint()
      }
    }
    animation.current = window.requestAnimationFrame(tick)
  }

  function aimAt(event, zone) {
    if (!editable) return
    if (event.detail === 0) {
      setZone(focus, zone)
      return
    }
    const rect = field.current.getBoundingClientRect()
    const across = (event.clientX - rect.left) / rect.width * 2 - 1
    const depth = Math.abs(1 - (event.clientY - rect.top) / rect.height * 2)
    const point = snapPoint(across * forehand(selectActor, hands), depth)
    setZone(focus, pointZone(point), point)
  }

  const deviation = comparePlacement(selected, shot.zone)
  const outcome = selected?.status === "unresolved" ? "请微调线路" : selected?.status === "unavailable" ? "当前接法不适用" : selected?.status === "out" ? "预计出界" :
    selected?.status === "net" ? "预计下网" :
    selected?.valid ? zoneName(selected.zone) : "这一板前已失误"
  const focusActor = shotActor(mode, focus)
  const compensateSide = focus > 0 && Math.abs(readResults[focus - 1]?.side ?? 0) >= 50
  const clearance = selected ? clearanceDescription(selected) : ""
  const netLabel = clearance === "贴网" ? "贴网" : "过网" + clearance
  const bounceLabel = selected?.valid ? secondBounceDescription(selected) : ""

  return <section className={"court-panel" + (expanded ? " is-expanded" : "")} aria-label="球台和球路">
    <header className="court-toolbar"><span>{steps[focus] ? "第 " + (focus + 1) + " 板球路" : "球台"}</span><div>
      <button className="button icon subtle" type="button" onClick={replay} aria-label="重播球路" title="重播球路" disabled={playing || !visibleResults.some(r => r?.points?.length)}><Play size={17} /></button>
      <button className="button icon subtle expand-court" type="button" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "收起球台" : "展开球台调整落点"}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div></header>
    <div className="stage" ref={stage}><div className="end-label far">对手<span className="end-hand">{handName(playerHand("opponent", hands))}</span></div>
      <div className="court" ref={field}>{zones.map(([side, length]) => <div className="court-row" key={side + length}>{[0, 1, 2].map(column => {
        const zone = getLabel(side, hands, length, column), aimed = selectActor === side && shot.zone === zone, name = zoneName(zone)
        const className = "court-zone" + (aimed ? " aimed" : "")
        return editable && selectActor === side && (!compact || expanded) ? <button type="button" key={zone} className={className} aria-label={(side === "me" ? "我方" : "对手") + name}
          aria-pressed={aimed} onClick={event => aimAt(event, zone)}><span>{name}</span></button> : <div key={zone} className={className}><span>{name}</span></div>
      })}</div>)}<div className="net" aria-hidden="true" /></div>
      <div className="end-label near">我方<span className="end-hand">{handName(playerHand("me", hands))}</span></div><canvas ref={canvas} className="court-canvas" aria-hidden="true" />
      {!expanded && <button className="mini-court-overlay" type="button" aria-label="展开球台调整落点" onClick={() => setExpanded(true)} />}</div>
    <div className="court-pick"><p className="court-help"><Target size={14} />{editable ? "点球台，微调落点" : active === 0 ? "选择发球后查看球路" : "先选接法，再调整落点"}</p>
      {shot.point && editable && <button className="text-button" type="button" onClick={() => setZone(focus, shot.zone)}>复位</button>}</div>
    {steps.length > 0 && <div className="ball-readout" aria-live="polite"><div className="readout-heading"><NumberBadge index={focus} /><strong>{shotName(shot, focusActor, hands)}</strong></div>
      <div className="readout-values"><span className={selected?.valid ? "" : "bad-outcome"}>{selected?.valid ? "第一落点 · " + outcome : outcome}</span>{selected?.valid && <span>{bounceLabel}</span>}</div>
      {focus > 0 && original?.valid && <details className="disclosure court-details"><summary>查看触球对比<ChevronDown size={14} /></summary><div className="read-toggle" role="group" aria-label="拍形对比">
        <button type="button" aria-pressed={adjustment === "read"} onClick={() => setAdjustment("read")}>正确处理</button><button type="button" aria-pressed={adjustment === "fixed"} onClick={() => setAdjustment("fixed")}>{compensateSide ? "未补侧旋" : "当不转接"}</button></div>
        <p>{selected?.valid ? spinDescription(selected) + " · " + netLabel : "预计失误"}{deviation ? " · " + deviation : ""}</p><p className="muted">下一板建议始终按正确处理计算。色晕仅表示触球扰动的示意。</p></details>}
      {["unavailable", "unresolved"].includes(selected?.status) && <p className="notice error">{selected.issue}</p>}</div>}
  </section>
}
