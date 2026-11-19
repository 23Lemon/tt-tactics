import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronDown, ChevronUp, Compass, Crosshair, Info, Library, RotateCcw, Settings2, UserRound, X } from 'lucide-react'
import { contactSetbackCm, storedServeDistance, SERVE_DISTANCE, SERVE_POSITION_LIMITS, STROKE_GROUPS, handName, playerHand, servePositionName, serveSpinName, shotName, strokeFitsRubber, zoneName } from '../lib/table-tennis/catalog.mjs'
import { RUBBERS, rubberFor } from '../lib/table-tennis/rubbers.mjs'
import { COURT, serveOrigin, secondBounceDescription, spinDescription } from '../lib/table-tennis/physics.mjs'
import { assessStroke, techniqueDescription } from '../lib/table-tennis/tactics.mjs'
import { receiveGroups } from '../lib/table-tennis/repertoire.mjs'
import { Modal, RouteSummary } from '../app/routine-controls.jsx'
import Court from '../app/court.jsx'
import { usePreferences } from '../app/use-preferences.js'
import { TRACKS, PACES, SERVES, STRENGTHS, STROKES, actorAt, applySteps, buildSteps, canVisit, chooseStroke, createDraft, fromRoutine, getAnalysis, getIdeas, getLandingView, getStatus, getSuggestions, goTo, moveLanding, setHands, setRubber, titleAt, updateServe } from './rally-domain.mjs'
import RoutineManager from './routine-manager.jsx'
import { listRoutines, subscribeRoutines } from './storage.mjs'
import './rally.css'

const clamp = value => Math.max(0, Math.min(1, value))
const laneLabels = { fh: '正手', mid: '中间', bh: '反手' }
const depthLabels = { short: '短', long: '长' }
const roleName = actor => actor === 'me' ? '我方' : '对手'
const EMPTY_GROUPS = []

function Segments({ values, value, onChange, label }) {
  return <div className="rally-segments" role="group" aria-label={label}>{Object.entries(values).map(([key, name]) => <button type="button" key={key} aria-pressed={key === value} onClick={() => onChange(key)}>{name}</button>)}</div>
}

function positionOnTable(p) {
  return [104 * p[1] / COURT.halfLength, 50 + 46 * p[0] / COURT.halfWidth]
}

function RallyFlight({ ball, receiver }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  if (!ball?.points?.length) return null
  const offset = receiver === 'me' ? 104 : 0
  const xy = state => {
    const [x, y] = positionOnTable(state.p)
    return [x + offset, y]
  }
  const track = ball.points.map(xy)
  const approach = track.filter(([x]) => x >= 0 && x <= 104)
  const tip = Math.floor(approach.length * .7)
  const arrow = tip > 0 ? approach.slice(tip - 1, tip + 1) : []
  const rebound = ball.follow?.states.map(xy) ?? []
  return <g pointerEvents="none">
    <defs><clipPath id={'bounds' + id}><rect x="0" y="4" width="104" height="92"/></clipPath>
      <marker id={'arrow' + id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#ffd686"/></marker></defs>
    <g clipPath={'url(#bounds' + id + ')'} fill="none" stroke="#ffd686" strokeWidth="1.35">
      <polyline points={track.join(' ')}/>
      {arrow.length > 0 && <polyline points={arrow.join(' ')} markerEnd={'url(#arrow' + id + ')'}/>}
      <polyline points={rebound.join(' ')} strokeDasharray="2 2" opacity=".8"/>
    </g>
  </g>
}

function StancePreview({ draft, ball }) {
  const actor = actorAt(draft, 0)
  const [x, y] = positionOnTable(serveOrigin(draft.setup, actor, draft))
  const edge = actor === 'me' ? -104 : 104
  const distance = contactSetbackCm(draft.setup.distance)
  const track = ball?.points?.map(state => positionOnTable(state.p)) ?? []
  const bounce = ball?.serviceBounce && positionOnTable(ball.serviceBounce)
  const landing = ball?.valid && ball.landing && positionOnTable(ball.landing)
  const marker = 'stance' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return <div className="stance-overlay" role="img" aria-label={roleName(actor) + '触球点在端线后' + distance + '厘米，' + servePositionName(draft.setup.position)}>
    <svg viewBox="-131 -8 262 115" aria-hidden="true">
      <defs><marker id={marker} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#ffda93"/></marker></defs>
      <rect x="-104" y="4" width="208" height="92" rx="1" fill="#264b3a"/>
      <path d="M-104 50H104 M-52 4V96 M52 4V96" fill="none" stroke="#789a85" strokeWidth=".6" strokeDasharray="2 2"/>
      <path d="M0 2V98" stroke="#d4e4d9" strokeWidth="1.4"/>
      {track.length > 1 && <polyline points={track.join(' ')} fill="none" stroke="#ffda93" strokeWidth="1.4" markerEnd={'url(#' + marker + ')'}/>}
      {bounce && <circle cx={bounce[0]} cy={bounce[1]} r="1.9" fill="#ffda93"/>}
      {landing && <circle cx={landing[0]} cy={landing[1]} r="2.6" stroke="#ffda93" fill="#264b3a"/>}
      <path d={`M${edge} ${y}H${x}`} stroke="#8f733a" strokeWidth="1.4" strokeDasharray="1.5 1"/>
      <circle cx={x} cy={y} r="3.7" fill="#f9b957" stroke="#324338" strokeWidth="1.1"/>
    </svg>
    <small>触球点 · {servePositionName(draft.setup.position)} · 端线后 {distance} 厘米</small>
  </div>
}

function HalfTable({ draft, index, onPoint, ball, choosingLanding }) {
  const view = getLandingView(draft, index)
  const me = view.receiver === 'me'
  const current = index === draft.active
  const ready = current && (index === 0 ? Boolean(draft.setup.family && draft.setup.spin) : Boolean(draft.steps[index]))
  const row = view.zone ? view.lanes.indexOf(view.zone.split('-')[0]) : -1
  const column = view.zone ? view.depths.indexOf(view.zone.split('-')[1]) : -1
  function pick(event) {
    if (!ready) return
    if (event.detail === 0) { onPoint(index, view.u ?? .5, view.v ?? .5); return }
    const box = event.currentTarget.querySelector('svg').getBoundingClientRect()
    onPoint(index, clamp((event.clientX - box.left) / box.width), clamp(((event.clientY - box.top) / box.height * 100 - 4) / 92))
  }
  function keydown(event) {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!ready || !direction) return
    event.preventDefault()
    const step = event.shiftKey ? .01 : .04
    onPoint(index, clamp((view.u ?? .5) + direction[0] * step), clamp((view.v ?? .5) + direction[1] * step))
  }
  const graphic = <svg className="half-table-svg" viewBox="0 0 104 100" aria-hidden="true">
    <rect x="0" y="4" width="104" height="92" className="half-surface" />
    {row >= 0 && column >= 0 && <rect x={column * 52} y={4 + row * 92 / 3} width="52" height={92 / 3} className="half-selected" />}
    <path d={`M52 4V96 M0 ${4 + 92 / 3}H104 M0 ${4 + 184 / 3}H104`} className="half-grid" vectorEffect="non-scaling-stroke" />
    <rect x="0" y="4" width="104" height="92" className="half-outline" vectorEffect="non-scaling-stroke" />
    <line x1={me ? 104 : 0} y1="1" x2={me ? 104 : 0} y2="99" className="half-net" vectorEffect="non-scaling-stroke" />
    <RallyFlight ball={ball} receiver={view.receiver}/>
    {view.u !== null && <circle cx={view.u * 104} cy={4 + view.v * 92} r="2.8" className="half-dot" />}
  </svg>
  return <div className="rally-destination">
    <figure className={`half-view ${choosingLanding ? 'choosing-landing' : ''} ${me ? 'half-me' : 'half-opponent'}`} aria-label={`${roleName(view.receiver)}${handName(view.hand)}半台，${zoneName(view.zone) || '待选落点'}`} data-recipient={view.receiver} data-zone={view.zone || ''} data-u={view.u ?? ''} data-v={view.v ?? ''}>
      <div className="half-depths">{view.depths.map(depth => <span key={depth}>{depthLabels[depth]}</span>)}</div>
      <div className="half-lanes">{view.lanes.map(lane => <span key={lane}>{laneLabels[lane]}</span>)}</div>
      {current ? <button className="half-target" type="button" aria-label={`在${roleName(view.receiver)}半台点选落点，当前${zoneName(view.zone) || '未选择'}，方向键微调`} disabled={!ready} onClick={pick} onKeyDown={keydown}>
        {graphic}{ready && view.u === null && <Crosshair size={18} className="half-empty-marker" aria-hidden="true" />}
      </button> : <div className="half-target">{graphic}</div>}
      <strong className="half-zone-name" aria-live={current ? 'polite' : 'off'}>{zoneName(view.zone) || (choosingLanding ? '请点选落点' : '待选落点')}</strong>
    </figure>
  </div>
}

function ServeEditor({ draft, onChange, part, setPart, setPreview }) {
  const setup = draft.setup
  const expanded = part || (!setup.family ? 'family' : !setup.spin ? 'spin' : null)
  const previewEvents = {
    onPointerDown: event => { event.currentTarget.setPointerCapture(event.pointerId); setPreview(true) },
    onPointerCancel: () => setPreview(false),
    onPointerUp: () => setPreview(false),
    onLostPointerCapture: () => setPreview(false),
    onKeyDown: event => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) setPreview(true) },
    onKeyUp: () => setPreview(false),
    onBlur: () => setPreview(false),
  }
  const group = (key, title, options) => <div className="rally-field" key={key}>
    <button className="rally-field-toggle" type="button" aria-expanded={expanded === key} onClick={() => setPart(expanded === key ? null : key)}><span>{title}</span><strong>{key === 'family' ? SERVES[setup.family]?.name || '请选择' : setup.spin ? serveSpinName(setup, actorAt(draft, 0), draft) : '请选择'}</strong>{expanded === key ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
    {expanded === key && <div className="rally-pick-list">{options.map(([value, label]) => <button key={value} type="button" aria-pressed={setup[key] === value} onClick={() => { onChange({ [key]: value }); setPart(key === 'family' ? 'spin' : null) }}>{label}{setup[key] === value && <Check size={13} />}</button>)}</div>}
  </div>
  return <>
    {group('family', '发球手法', Object.entries(SERVES).map(([key, value]) => [key, value.name]))}
    {setup.family && group('spin', '旋转', SERVES[setup.family].spins.map(spin => [spin, serveSpinName({ ...setup, spin }, actorAt(draft, 0), draft)]))}
    {setup.family && <details className="rally-disclosure rally-serve-settings"><summary>更多设置</summary><div className="rally-advanced-fields">
      <label>球速<select aria-label="发球球速" value={setup.pace} onChange={event => onChange({ pace: event.target.value })}>{Object.entries(PACES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      {setup.spin !== 'dead' && <label>旋转强度<select aria-label="旋转强度" value={setup.strength} onChange={event => onChange({ strength: event.target.value })}>{Object.entries(STRENGTHS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}
      <label>横向站位 · {servePositionName(setup.position)}<input {...previewEvents} type="range" aria-label="发球横向站位" min={SERVE_POSITION_LIMITS.min} max={SERVE_POSITION_LIMITS.max} step=".01" value={Math.min(setup.position, SERVE_POSITION_LIMITS.max)} onChange={event => onChange({ position: Number(event.target.value) })} /></label>
      <label>触球点 · 端线后 {contactSetbackCm(setup.distance)} 厘米<input {...previewEvents} type="range" aria-label="触球点距端线的水平距离" aria-valuetext={contactSetbackCm(setup.distance) + " 厘米"} min={contactSetbackCm(SERVE_DISTANCE.min)} max={contactSetbackCm(SERVE_DISTANCE.max)} step="1" value={contactSetbackCm(setup.distance)} onChange={event => onChange({ distance: storedServeDistance(Number(event.target.value)) })} /></label>
    </div></details>}
  </>
}

function DecisionEditor({ draft, results, options, onChoose, onCustom }) {
  const incoming = results[draft.active - 1]
  const shot = draft.steps[draft.active]
  const [more, setMore] = useState(false)
  const selected = options.find(option => option.tech === shot?.tech)
  return <>
    <div className="rally-incoming"><span>来球</span><strong>{incoming?.valid ? zoneName(incoming.zone) : '上一板待调整'}</strong><span>{incoming?.valid ? spinDescription(incoming) : ''}</span>{incoming?.valid && <small>{secondBounceDescription(incoming)}</small>}</div>
    <div className="rally-decisions" role="group" aria-label={`${roleName(actorAt(draft, draft.active))}第${draft.active + 1}板接法`}>
      {(more ? options : options.slice(0, 3)).map((option) => <button type="button" key={option.tech} className="rally-option" aria-pressed={shot?.tech === option.tech} onClick={() => onChoose(shot?.tech === option.tech ? shot : option)}>
        <span><strong>{STROKES[option.tech].name}</strong>{option.priority && <small className="rally-priority">{actorAt(draft, draft.active) === 'me' ? '优先考虑' : '优先预判'}</small>}<small>{option.effort} · {zoneName(shot?.tech === option.tech ? shot.zone : option.zone)}{option.conditional ? ' · 有条件' : ''}</small></span><span className="rally-selection" aria-hidden="true">{shot?.tech === option.tech && <Check size={11} />}</span>
      </button>)}
    </div>
    {!options.length && <p className="rally-inline-message">暂无适用建议，可调整上一板或自选技术。</p>}
    {shot && !selected && <div className="rally-custom-selected"><Check size={13}/>{shotName(shot, actorAt(draft, draft.active), draft)}</div>}
    <div className="rally-choice-tools">{options.length > 3 && <button type="button" onClick={() => setMore(!more)} aria-expanded={more}>{more ? '收起建议' : '更多建议'}</button>}<button type="button" onClick={onCustom}>自选技术</button></div>
    {shot && <details className="rally-disclosure"><summary>为什么这样选</summary><p>{selected?.reason || techniqueDescription(shot.tech)}</p>{selected?.condition && <p>{selected.condition}</p>}</details>}
  </>
}

function CustomTechnique({ draft, results, close, choose }) {
  const [query, setQuery] = useState(''), [all, setAll] = useState(false), [tech, setTech] = useState(draft.steps[draft.active]?.tech || ''), [label, setLabel] = useState(draft.steps[draft.active]?.label || '')
  const actor = actorAt(draft, draft.active)
  const assessments = useMemo(() => Object.fromEntries(Object.keys(STROKES).map(key => [key, assessStroke(results[draft.active - 1], key, draft)])), [results, draft])
  return <Modal title="自选技术" close={close} wide>
    <div className="rally-custom-form"><input type="search" placeholder="搜索技术" aria-label="搜索技术" value={query} onChange={event => setQuery(event.target.value)} />
      <label className="rally-check"><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)} />显示不适用的技术及原因</label>
      <div className="rally-technique-list">{STROKE_GROUPS.map(group => {
        const items = group.strokes.filter(id => strokeFitsRubber(id, actor, draft) &&
          (all || assessments[id].allowed) && STROKES[id].name.includes(query.trim()))
        return items.length ? <section key={group.name}><h3>{group.name}</h3>{items.map(id => <button key={id} type="button" disabled={!assessments[id].allowed} aria-pressed={tech === id} onClick={() => setTech(id)}><strong>{STROKES[id].name}</strong><small>{assessments[id].reason || techniqueDescription(id)}</small>{tech === id && <Check size={15}/>}</button>)}</section> : null
      })}</div>
      {tech && <><label>自定义叫法（选填）<input value={label} aria-label="自定义叫法" maxLength={28} onChange={event => setLabel(event.target.value)} /></label><button className="rally-button primary" type="button" disabled={!assessments[tech]?.allowed} onClick={() => choose({ tech, ...(label.trim() ? { label: label.trim() } : {}) })}>选用这板</button></>}
    </div>
  </Modal>
}

const rubberName = id => RUBBERS[id].shortName ?? RUBBERS[id].name

function PlayerSettings({ draft, preferences, onHands, onRubber, close }) {
  const [groups, setGroups] = useState(null)
  const selectedGroups = groups ?? preferences.snapshot?.groups ?? EMPTY_GROUPS
  return <Modal title="双方设置" close={close}>
    <div className="rally-settings-form">
      {['me', 'opponent'].map(actor => <fieldset className="rally-player-settings" key={actor}>
        <legend>{roleName(actor)}</legend>
        <Segments label={roleName(actor) + '持拍手'} values={{ right: '右手', left: '左手' }} value={playerHand(actor, draft)}
          onChange={value => onHands(actor === 'me' ? { myHand: value } : { hand: value })}/>
        <div className="rally-rubber-fields">{[['fh', '正手'], ['bh', '反手']].map(([face, label]) => {
          const rubber = rubberFor(draft, actor, face)
          return <label key={face}>{label}胶皮<span className="rally-rubber-select"><select aria-label={roleName(actor) + label + '胶皮'} value={rubber}
            onChange={event => onRubber(actor, face, event.target.value)}>
            {Object.entries(RUBBERS).map(([id, info]) => <option key={id} value={id}>{info.name}</option>)}
          </select><ChevronDown size={14} aria-hidden="true"/></span>{RUBBERS[rubber].description && <small>{RUBBERS[rubber].description}</small>}</label>
        })}</div>
      </fieldset>)}
      <details><summary>对手常用接法</summary><div className="rally-preferences">{receiveGroups.map(([key, title]) => <label key={key}><input type="checkbox" checked={selectedGroups.includes(key)} disabled={!preferences.snapshot || preferences.busy} onChange={() => setGroups(old => { const current = old ?? preferences.snapshot?.groups ?? EMPTY_GROUPS; return current.includes(key) ? current.filter(x => x !== key) : [...current, key] })}/>{title}</label>)}</div><p className="rally-muted">留空显示全部；用于预判对手如何接你的发球。</p></details>
      {preferences.error && <p className="rally-error" role="alert">{preferences.error}</p>}
      <button className="rally-button primary" type="button" disabled={preferences.busy} onClick={async () => { if (groups === null || await preferences.save(preferences.snapshot, selectedGroups)) close() }}>{preferences.busy ? '保存中…' : '完成'}</button>
    </div>
  </Modal>
}

export default function RallyWorkbench() {
  const [mode, setMode] = useState('serve')
  const [drafts, setDrafts] = useState(() => ({ serve: createDraft('serve'), receive: createDraft('receive') }))
  const [stancePreview, setStancePreview] = useState(false)
  const [servePart, setServePart] = useState('family')
  const [dialog, setDialog] = useState(null), [manager, setManager] = useState(null), [message, setMessage] = useState(''), [records, setRecords] = useState([]), [adjustment, setAdjustment] = useState('read')
  const rally = useRef(null)
  const draft = drafts[mode]
  const results = useMemo(() => getAnalysis(draft), [draft])
  const status = useMemo(() => getStatus(draft, results), [draft, results])
  const preferences = usePreferences(dialog === 'players', true)
  const pickedGroups = preferences.snapshot?.groups || EMPTY_GROUPS
  const options = useMemo(() => getSuggestions(draft, draft.active, pickedGroups, results), [draft, results, pickedGroups])
  const [ideas, setIdeas] = useState(null)
  const refreshRecords = useCallback(() => { listRoutines().then(setRecords).catch(() => {}) }, [])
  useEffect(() => { refreshRecords(); return subscribeRoutines(refreshRecords) }, [refreshRecords])
  useEffect(() => { if (!message) return; const id = setTimeout(() => setMessage(''), 4500); return () => clearTimeout(id) }, [message])
  function update(transform) { setDrafts(old => ({ ...old, [mode]: transform(old[mode]) })); setAdjustment('read'); setMessage('') }
  function point(index, u, v) { update(value => moveLanding(value, index, u, v)) }
  function choose(option) { try { const nextDraft = chooseStroke(draft, draft.active, option); setDrafts(old => ({ ...old, [mode]: nextDraft })); setAdjustment('read'); setMessage(''); setDialog(null) } catch (error) { setMessage(error.message) } }
  function changeMode(value) { setMode(value); setDialog(null); setServePart(null); setAdjustment('read') }
  function changeHands(patch) { setDrafts(old => Object.fromEntries(Object.entries(old).map(([key, value]) => [key, setHands(value, key === mode ? patch : Object.hasOwn(patch, 'myHand') ? { myHand: patch.myHand } : {})]))); setServePart(null) }
  function changeRubber(actor, face, id) {
    setDrafts(old => Object.fromEntries(Object.entries(old).map(([key, value]) =>
      [key, key === mode || actor === 'me' ? setRubber(value, actor, face, id) : value])))
    setServePart(null)
    setAdjustment('read')
  }
  function openRoutine(item) {
    try { let value = fromRoutine(item); const check = getStatus(value); if (check.invalidIndex >= 0) value = { ...value, active: check.invalidIndex }; setDrafts(old => ({ ...old, [item.mode]: value })); setMode(item.mode); setManager(null); setServePart(null) } catch (error) { setMessage(error.message) }
  }
  function newRoutine() { if (draft.steps.length && !window.confirm('开始一条新套路？当前未保存的修改会清空。')) return; update(() => createDraft(mode, draft.myHand, draft.hand, draft.rubbers)); setServePart('family') }
  function next() { if (!status.ready) return; if (draft.active === TRACKS[mode].length - 1) { if (status.complete) setManager('save') } else update(value => goTo(value, value.active + 1)) }
  function showIdeas() { setIdeas(getIdeas(draft, records, pickedGroups)); setDialog('ideas') }
  useLayoutEffect(() => {
    if (!rally.current) return
    function align() {
      rally.current?.querySelectorAll('.rally-turn').forEach(row => {
        const source = row.querySelector('.rally-card'), destination = row.querySelector('.rally-destination'), table = row.querySelector('.half-table-svg'), arrow = row.querySelector('.rally-arrow')
        if (!source || !destination || !table || !arrow) return
        const s = source.getBoundingClientRect(), d = destination.getBoundingClientRect(), t = table.getBoundingClientRect()
        const range = source.querySelector('input[type="range"]')?.closest('label')
        if (range && row.classList.contains('show-stance')) {
          const top = source.querySelector('header').getBoundingClientRect().bottom - row.getBoundingClientRect().top
          row.style.setProperty('--stance-top', top + 'px')
          row.style.setProperty('--stance-height', Math.max(0, range.getBoundingClientRect().top - row.getBoundingClientRect().top - top - 6) + 'px')
        }
        const tableCenter = t.top - d.top + t.height / 2
        const center = Math.max(s.height / 2, tableCenter)
        source.style.marginTop = `${center - s.height / 2}px`
        destination.style.marginTop = `${center - tableCenter}px`
        arrow.style.marginTop = `${center - 12}px`
      })
    }
    align()
    let frame
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(align)
    })
    observer.observe(rally.current)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [draft, options, status.error, stancePreview])

  const saveDraft = { mode, myHand: draft.myHand, hand: draft.hand, steps: buildSteps(draft), ...(draft.saved ? { id: draft.saved.id, revision: draft.saved.revision, title: draft.saved.title, note: draft.saved.note, category: draft.saved.category, status: draft.saved.status } : {}) }
  const focus = Math.max(0, Math.min(draft.active, draft.steps.length - 1))
  const projected = dialog === 'court' && adjustment === 'fixed' ? getAnalysis(draft, 'fixed').slice(0, focus + 1) : results.slice(0, focus + 1)
  function actionCard(index) {
    const current = index === draft.active, shot = draft.steps[index], allowed = canVisit(draft, index, results)
    const heading = <span className="rally-card-title"><b className="rally-number">{index + 1}</b><strong>{titleAt(draft, index)}</strong></span>
    if (!current) return <button type="button" className={`rally-card closed${allowed ? '' : ' future'}`} disabled={!allowed} onClick={() => { update(value => goTo(value, index)); setServePart(null) }} aria-label={`第${index + 1}板，${titleAt(draft, index)}`}>{heading}<span className="rally-summary">{shot ? shotName(shot, actorAt(draft, index), draft) : '待选择'}</span></button>
    return <section className={"rally-card open" + (stancePreview && !index ? " adjusting-stance" : "")} aria-current="step" aria-label={`第${index + 1}板，${titleAt(draft, index)}，在${actorAt(draft, index) === 'me' ? '左' : '右'}侧选择`}>
      <header className="rally-card-heading">{heading}<span>轮到{roleName(actorAt(draft, index))}</span></header>
      <div className="rally-card-fields">{index === 0 ? <ServeEditor draft={draft} onChange={patch => update(value => updateServe(value, patch))} part={servePart} setPart={setServePart} setPreview={setStancePreview} /> : <DecisionEditor key={`${mode}-${index}`} draft={draft} results={results} options={options} onChoose={choose} onCustom={() => setDialog('custom')} />}
        {status.error && <div className="rally-inline-error" role="alert"><p>{status.error}</p>{status.invalidIndex >= 0 && status.invalidIndex !== index && <button type="button" onClick={() => update(value => goTo(value, status.invalidIndex))}>返回第 {status.invalidIndex + 1} 板</button>}</div>}
      </div>
      <button className="rally-next" type="button" disabled={!status.ready || (index === TRACKS[mode].length - 1 && !status.complete)} onClick={next}>{index === TRACKS[mode].length - 1 ? <><Bookmark size={14}/>保存套路</> : <>{actorAt(draft, index + 1) === 'me' && <ArrowLeft size={14}/>}轮到{roleName(actorAt(draft, index + 1))}{actorAt(draft, index + 1) !== 'me' && <ArrowRight size={14}/>}</>}</button>
    </section>
  }
  function destination(index) {
    return draft.steps[index] || index === draft.active ? <HalfTable draft={draft} index={index} ball={results[index]} choosingLanding={!index && draft.active === 0 && !!draft.setup.spin && !servePart && !draft.setup.zone} onPoint={point}/> : <div/> }
  return <div className="rally-app">
    <header className="rally-topbar"><div className="rally-brand"><img src="./favicon.svg" width="26" height="26" alt=""/><strong>套路分析</strong></div><button className="rally-library-button" type="button" onClick={() => setManager('library')}><Library size={17}/>套路库</button></header>
    <main className="rally-main">
      <div className="rally-toolbar"><Segments label="分析模式" values={{ serve: '我发球', receive: '我接发' }} value={mode} onChange={changeMode}/><div className="rally-top-actions"><button type="button" aria-label="开始新套路" onClick={newRoutine}><RotateCcw size={16}/></button><button type="button" aria-label="双方设置" onClick={() => setDialog('players')}><Settings2 size={17}/></button></div></div>
      <div className="rally-context-actions"><button type="button" onClick={showIdeas}><Compass size={14}/>找新套路</button><button type="button" disabled={!draft.steps.length} onClick={() => { setAdjustment('read'); setDialog('court') }}>球路详情<ArrowRight size={13}/></button></div>
      <section className="rally-sides" aria-label="双方持拍手与胶皮">{['me', 'opponent'].map(actor => <button key={actor} type="button" onClick={() => setDialog('players')}><span><UserRound size={18}/><strong>{roleName(actor)}</strong></span><small>{handName(playerHand(actor, draft))} · {rubberName(rubberFor(draft, actor, 'fh'))}／{rubberName(rubberFor(draft, actor, 'bh'))}</small></button>)}<span className="rally-net-label">球网</span></section>
      <div className="rally-exchanges" ref={rally} aria-label="球网两侧的逐板选择">
        {TRACKS[mode].map((_, index) => <div className={`rally-turn${index === draft.active ? ' current' : ''}${stancePreview && !index && !draft.active ? ' show-stance' : ''}`} key={`${mode}-${index}`}>
          {actorAt(draft, index) === 'me' ? actionCard(index) : destination(index)}
          <div className="rally-arrow" aria-hidden="true">{(draft.steps[index] || index === draft.active) && (actorAt(draft, index) === 'me' ? <ArrowRight size={24}/> : <ArrowLeft size={24}/>)}</div>
          {actorAt(draft, index) === 'opponent' ? actionCard(index) : destination(index)}
          {stancePreview && !index && !draft.active && <StancePreview draft={draft} ball={results[0]}/>}
        </div>)}
      </div>
      <footer className="rally-page-footer"><span>{draft.saved ? '正在编辑已存套路' : `${mode === 'serve' ? '三' : '四'}板衔接`}</span><button type="button" onClick={() => setDialog('about')}><Info size={13}/>关于推荐</button></footer>
    </main>
    {message && <div className="rally-toast" role="status"><span>{message}</span><button type="button" onClick={() => setMessage('')} aria-label="关闭提示"><X size={16}/></button></div>}
    <RoutineManager open={manager} onClose={() => setManager(null)} draftToSave={saveDraft} onOpen={openRoutine} onSaved={item => { setManager(null); setDrafts(old => ({ ...old, [item.mode]: createDraft(item.mode, item.myHand, item.hand, item.steps[0].rubbers) })); setServePart('family'); setMessage('已保存到套路库'); refreshRecords() }}/>
    {dialog === 'custom' && <CustomTechnique draft={draft} results={results} close={() => setDialog(null)} choose={choose}/>}
    {dialog === 'players' && <PlayerSettings draft={draft} preferences={preferences} onHands={changeHands} onRubber={changeRubber} close={() => setDialog(null)}/>}
    {dialog === 'ideas' && <Modal title="找新套路" close={() => setDialog(null)} wide><div className="rally-ideas">{[['openers', '试试这些开局'], ['branches', '同一发球换种接法']].map(([key, title]) => <section key={key}><h3>{title}</h3>{ideas?.[key]?.length ? ideas[key].map((idea, i) => <article key={i}><RouteSummary mode={mode} hands={draft} steps={idea.steps}/><p>{idea.reason}</p><button type="button" className="rally-button" onClick={() => { update(value => applySteps(value, idea.steps)); setServePart(null); setDialog(null) }}>查看线路<ArrowRight size={14}/></button></article>) : <p className="rally-muted">当前条件暂无新组合。</p>}</section>)}</div></Modal>}
    {dialog === 'court' && <Modal title="球路详情" close={() => setDialog(null)} wide><div className="rally-full-court"><Court mode={mode} hands={draft} active={draft.active} setup={draft.setup} steps={draft.steps} focus={focus} readResults={results} visibleResults={projected} adjustment={adjustment} setAdjustment={setAdjustment} setZone={() => {}} editable={false} expanded setExpanded={() => {}}/></div></Modal>}
    {dialog === 'about' && <Modal title="关于推荐" close={() => setDialog(null)}><div className="rally-about"><p>按来球旋转、落点、球速和击球条件，比较可行接法与后续衔接。</p><p>推荐与球路由原站的技术规则和物理近似计算。具体排序是教学参考，需结合到位情况、器材和熟练度判断。</p><p>套路保存在当前浏览器，可用 JSON 与原版互相分享、导入。</p><a href="https://github.com/23Lemon/tt-tactics/blob/main/docs/model-and-design.md" target="_blank" rel="noreferrer">查看模型说明<ArrowRight size={14}/></a></div></Modal>}
  </div>
}
