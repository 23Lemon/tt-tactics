"use client"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Check, ChevronDown, Compass, Info,
  Library, Plus, RefreshCw, RotateCcw, Search, SlidersHorizontal, Trash2, Upload, Share2, Folder, Map as MapIcon } from "lucide-react"
import { contactSetbackCm, storedServeDistance, DEFAULT_POSITION, PACES, SERVES, SERVE_DISTANCE, SERVE_POSITION_LIMITS, STARTING_POSITIONS, STRENGTHS, STROKES, STROKE_GROUPS, ZONES,
  handName, openingKey, patternKey, playerHand, servePositionName, serveSpinName, shotActor, shotName, zoneName,
} from "../lib/table-tennis/catalog.mjs"
import { analyze, secondBounceDescription, spinDescription } from "../lib/table-tennis/physics.mjs"
import { assessStroke, findIdeas, optionsFor, readIncoming, techniqueDescription } from "../lib/table-tennis/tactics.mjs"
import Court from "./court"
import { Modal, RouteSummary } from "./routine-controls"
import { ShareDialog, ImportDialog, CategoryField, CategoryDialog, RepertoireDialog } from "./routine-tools"
import { usePreferences } from "./use-preferences"
const blankDraft = (myHand = "right", hand = "right") => ({
  setup: { family: "", spin: "", zone: "", strength: "medium", pace: "normal", position: DEFAULT_POSITION, distance: SERVE_DISTANCE.default },
  steps: [], active: 0, myHand, hand, saved: null,
})
const defaults = () => ({ serve: blankDraft(), receive: blankDraft() })
const modeNames = { serve: "我发球", receive: "我接发" }
const statuses = { practice: "想练", using: "在用" }
const tracks = { serve: ["我的发球", "对方接发", "我的第三板"], receive: ["对方发球", "我的接发", "对方第三板", "我的第四板"] }
const allReceives = []
const smallScreen = "(max-width: 720px)"
const isCompact = () => window.matchMedia(smallScreen).matches
const desktopAtStartup = () => false
function subscribeToScreen(listener) {
  const media = window.matchMedia(smallScreen)
  media.addEventListener("change", listener)
  return () => media.removeEventListener("change", listener)
}
async function cloud(method = "GET", body) {
  const response = await fetch("/api/routines", { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || method === "GET" && !Array.isArray(payload.items)) throw new Error(payload.error || "暂时无法同步，请稍后重试。")
  return payload
}
function Select({ children, ...props }) { return <div className="select-frame"><select {...props}>{children}</select><ChevronDown size={16} aria-hidden="true" /></div> }
function ZoneOptions() { return ZONES.map(z => <option key={z.id} value={z.id}>{z.name}</option>) }
function Segments({ values, value, set, label }) {
  return <div className="segments" role="group" aria-label={label}>{Object.entries(values).map(([id, name]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => set(id)}>{name}</button>)}</div>
}
function ZonePicker({ value, onChange }) {
  return <div className="zone-picker" role="group" aria-label="回球落点">{ZONES.map(z => <button type="button" key={z.id} aria-pressed={value === z.id} onClick={() => onChange(z.id)}>{z.name}</button>)}</div>
}
function PositionControl({ value, set }) {
  const { min, max } = SERVE_POSITION_LIMITS
  return <div className="position-control"><div className="setting-row"><span>发球站位</span><strong>{value > max ? "原站位" : servePositionName(value)}</strong></div>
    <input className="position-range" type="range" min={min} max={max} step={.01} aria-label="发球站位" aria-valuetext={servePositionName(value)} value={Math.min(value, max)} onChange={e => set(Number(e.target.value))} />
    <div className="range-labels">{STARTING_POSITIONS.map(p => <button type="button" key={p.name} onClick={() => set(p.value)}>{p.name}</button>)}</div></div>
}
function ServeControls({ mode, draft, onChange }) {
  const serve = draft.setup, actor = shotActor(mode, 0)
  return <div className="serve-editor">
    <fieldset><legend>发球手法</legend><div className="family-picker">{Object.entries(SERVES).map(([id, family]) => <button key={id} type="button" aria-pressed={serve.family === id}
      onClick={() => onChange({ family: id, spin: SERVES[id].spins.includes(serve.spin) ? serve.spin : "" })}>{family.name}{serve.family === id && <Check size={15} />}</button>)}</div></fieldset>
    {serve.family && <fieldset className="revealed"><legend>旋转</legend><div className="spin-picker">{SERVES[serve.family].spins.map(spin => <button type="button" key={spin} aria-pressed={serve.spin === spin}
      onClick={() => onChange({ spin })}>{serveSpinName({ ...serve, spin }, actor, draft)}</button>)}</div></fieldset>}
    {serve.spin && <fieldset className="revealed"><legend>落点</legend><ZonePicker value={serve.zone} onChange={zone => onChange({ zone, point: undefined })} /></fieldset>}
    {serve.family && <details className="disclosure"><summary><SlidersHorizontal size={16} />更多发球设置<ChevronDown size={15} /></summary><div className="settings-content">
      {serve.spin !== "dead" && <div className="setting-row"><span>旋转强度</span><Segments values={STRENGTHS} value={serve.strength} set={strength => onChange({ strength })} label="旋转强度" /></div>}
      <div className="setting-row"><span>球速</span><Segments values={PACES} value={serve.pace ?? "normal"} set={pace => onChange({ pace })} label="发球球速" /></div>
      <PositionControl value={serve.position} set={position => onChange({ position })} />
      <div className="distance-control"><div className="setting-row"><label htmlFor="serve-distance">触球点距端线</label><strong>{contactSetbackCm(serve.distance)} 厘米</strong></div>
        <input id="serve-distance" className="position-range" type="range" min={contactSetbackCm(SERVE_DISTANCE.min)} max={contactSetbackCm(SERVE_DISTANCE.max)} step={1}
          value={contactSetbackCm(serve.distance)} aria-valuetext={contactSetbackCm(serve.distance) + " 厘米"} aria-describedby="distance-help" onChange={e => onChange({ distance: storedServeDistance(Number(e.target.value)) })}/>
        <div className="distance-scale"><span>{contactSetbackCm(SERVE_DISTANCE.min)} 厘米</span><span>{contactSetbackCm(SERVE_DISTANCE.max)} 厘米</span></div><p id="distance-help">从球心量到端线，取水平方向。默认 {contactSetbackCm()} 厘米。</p></div>
      </div></details>}
  </div>
}
function Incoming({ ball }) {
  if (!ball?.valid) return <p className="notice error">{ball?.issue || "上一板线路不可行，请返回调整。"}</p>
  return <div className="incoming-strip"><span className="eyebrow">来球</span><strong>{zoneName(ball.zone)} · {spinDescription(ball)}</strong>
    <div><span>{secondBounceDescription(ball)}</span><span>{readIncoming(ball).pressure}</span></div></div>
}
function Decisions({ mode, draft, results, choose, onCustom, onZone, preferences, preferenceStatus, onPreferences }) {
  const { steps, active } = draft, incoming = results[active - 1]
  const options = useMemo(() => optionsFor(incoming, draft, preferences), [incoming, draft.myHand, draft.hand, preferences])
  const [more, setMore] = useState(false), selected = steps[active]
  const selectedOption = options.find(x => x.tech === selected?.tech), assessment = selected && assessStroke(incoming, selected.tech)
  return <><Incoming ball={incoming} />{mode === "serve" && active === 1 && <button type="button" className="text-button receive-filter" onClick={onPreferences}><SlidersHorizontal size={15}/>对手常用接法 · {preferenceStatus || (preferences.length ? preferences.length + " 项" : "全部")}</button>}<div className="choices" role="group" aria-label="建议接法">
    {(more ? options : options.slice(0, 3)).map((option, index) => <button className="choice" aria-pressed={selected?.tech === option.tech} key={option.tech} type="button" onClick={() => choose(selected?.tech === option.tech ? selected : { tech: option.tech, zone: option.zone })}>
      <span className="choice-copy"><strong>{STROKES[option.tech].name}</strong><small>{option.priority && <b className="priority-tag">{shotActor(mode, active) === "opponent" ? "优先预判" : "优先考虑"}</b>}{option.effort} · {zoneName(selected?.tech === option.tech ? selected.zone : option.zone)}{option.conditional ? " · 有条件" : ""}</small></span>
      <span className="selection-circle">{selected?.tech === option.tech && <Check size={14} />}</span></button>)}</div>
    {!options.length && <p className="muted empty-options">{preferences.length && mode === "serve" && active === 1 ? "已选的常用接法没有适合这板的建议。可调整接法范围，或自选技术。" : "暂未找到适合这板的建议，可微调落点或自选技术。"}</p>}
    <div className="secondary-actions">{options.length > 3 && <button className="text-button" type="button" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "收起" : "更多建议"}<ChevronDown size={14} /></button>}
      <button className="button outline custom-trigger" type="button" onClick={onCustom}><Plus size={17} />自选技术</button></div>
    {selected && <div className="selected-editor revealed">{!selectedOption && <div className="custom-selected"><Check size={15} />{shotName(selected, shotActor(mode, active), draft)}</div>}
      <fieldset><legend>回到哪里</legend><ZonePicker value={selected.zone} onChange={zone => onZone(active, zone)} /></fieldset>
      {assessment && !assessment.allowed && <p className="notice error">{assessment.reason}</p>}
      {results[active] && !results[active].valid && <p className="notice error">{results[active].issue || "这条线路预计下网或出界，试试其他落点。"}</p>}
      {results[active]?.valid && STROKES[selected.tech].kind === "short" && !results[active].short && <p className="notice caution">这一落点二跳会出台。要摆住短球，可改到更靠近球网或中间的位置。</p>}
      <details className="disclosure reason"><summary><Info size={16} />为什么这样选<ChevronDown size={15} /></summary><p>{selectedOption?.reason || techniqueDescription(selected.tech)}</p>
        {(selectedOption?.condition || assessment?.conditional) && <p>{selectedOption?.condition || assessment.reason}</p>}
        {selectedOption && selectedOption.reason !== techniqueDescription(selected.tech) && <p>{techniqueDescription(selected.tech)}</p>}{Math.abs(incoming?.side ?? 0) >= 50 && <p>来球带侧旋，需要同时补偿触球方向。</p>}</details></div>}
  </>
}
function CustomShot({ draft, results, onChoose, close }) {
  const incoming = results[draft.active - 1]
  const [tech, setTech] = useState(draft.steps[draft.active]?.tech ?? ""), [zone, setZone] = useState(draft.steps[draft.active]?.zone ?? "mid-long")
  const [label, setLabel] = useState(draft.steps[draft.active]?.label ?? ""), [all, setAll] = useState(false), [query, setQuery] = useState("")
  const assessments = useMemo(() => Object.fromEntries(
    STROKE_GROUPS.flatMap(group => group.strokes.map(id => [id, assessStroke(incoming, id)]))
  ), [incoming])
  const assessment = assessments[tech] ?? assessStroke(incoming, tech)
  return <Modal title="自选技术" close={close} wide>
    <label className="search-box technique-search"><Search size={17} /><input placeholder="搜索技术" aria-label="搜索技术" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <label className="toggle-row"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />显示不适用的技术及原因</label>
    <div className="technique-list">{STROKE_GROUPS.map(group => {
      const items = group.strokes.filter(id => (all || assessments[id].allowed) && STROKES[id].name.includes(query.trim()))
      return items.length ? <section key={group.name}><h3>{group.name}</h3>{items.map(id => { const a = assessments[id]
        return <button type="button" className="technique-option" key={id} aria-pressed={tech === id} disabled={!a.allowed} onClick={() => setTech(id)}>
          <span><strong>{STROKES[id].name}</strong><small>{a.reason || techniqueDescription(id)}</small></span>{tech === id && <Check size={16} />}</button>
      })}</section> : null
    })}</div>
    {tech && <form className="modal-form" onSubmit={e => { e.preventDefault(); if (assessment.allowed) onChoose({ tech, zone, ...(label.trim() ? { label: label.trim() } : {}) }) }}>
      <label><span>落点</span><Select value={zone} onChange={e => setZone(e.target.value)}><ZoneOptions /></Select></label>
      <details className="disclosure"><summary>自定义叫法<ChevronDown size={15} /></summary><input aria-label="自定义叫法" placeholder="选填" value={label} maxLength={28} onChange={e => setLabel(e.target.value)} /></details>
      <div className="modal-actions"><button type="submit" className="button primary" disabled={!assessment.allowed}>选用这板<Check size={16} /></button></div></form>}
  </Modal>
}
function RoutineLibrary({ localOnly, records, pending, error, reload, open, onDelete, onStart, onShare, onImport, onCategory, categories }) {
  const [category, setCategory] = useState("*")
  const [which, setWhich] = useState("all")
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()
  const relevant = records.filter(item => (category === "*" || (item.category ? "c:" + item.category : "") === category) && (which === "all" || which === item.mode) &&
    (!query || [item.title, item.note, item.category, ...item.steps.map((step, index) => shotName(step, shotActor(item.mode, index), item) + " " + zoneName(step.zone))]
      .join(" ").toLowerCase().includes(query)))
  const groups = new Map()
  for (const item of relevant) {
    const key = openingKey(item.mode, item, item.steps[0])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  return <main id="workspace-main" className="main-frame library-view" tabIndex={-1}>
    <div className="page-heading">
      <div><h1>套路库</h1><p>{localOnly ? "套路保存在当前浏览器，可导出分享。" : "查看你保存的发球、接发和后续分支。"}</p></div>
      <div className="library-actions"><button type="button" className="button outline" onClick={onImport}><Upload size={16}/>导入套路</button><button className="button icon subtle" aria-label="刷新套路库" type="button" onClick={reload} disabled={pending}><RefreshCw size={16} /></button></div>
    </div>
    <div className="library-controls">
      <div className="segments" role="group" aria-label="筛选套路">
        {[["all", "全部"], ["serve", "我发球"], ["receive", "我接发"]].map(([id, name]) =>
          <button type="button" key={id} aria-pressed={which === id} onClick={() => setWhich(id)}>{name}</button>)}
      </div>
      <Select aria-label="按分类筛选" value={category} onChange={e => setCategory(e.target.value)}>
        <option value="*">全部分类</option><option value="">未分类</option>
        {category.startsWith("c:") && !categories.includes(category.slice(2)) && <option value={category}>{category.slice(2)}</option>}{categories.map(c => <option key={c} value={"c:" + c}>{c}</option>)}</Select>
      <label className="search-box"><Search size={17} /><input placeholder="搜索套路、技术或落点" aria-label="搜索套路"
        value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>
    {error && <p role="alert" className="notice error">{error}</p>}
    {pending && !records.length && <div className="panel empty-panel">正在读取已保存的套路…</div>}
    {!pending && !relevant.length && !error && <div className="panel empty-panel">
      <Bookmark size={26} />
      <h2>{records.length ? "没有符合条件的套路" : "还没有保存的套路"}</h2>
      {!records.length && <button className="button primary" type="button" onClick={onStart}>回到球台<ArrowRight size={16} /></button>}
    </div>}
    {[...groups.entries()].map(([key, items]) => {
      const hands = items[0]
      const { mode, steps } = hands
      return <section className="panel routine-group" key={key}>
        <header><div><small>{modeNames[mode]} · 我方{handName(playerHand("me", hands))} · 对手{handName(playerHand("opponent", hands))}</small>
          <h2>{shotName(steps[0], shotActor(mode, 0), hands)} <span>· {zoneName(steps[0].zone)}</span></h2></div>
          <span className="branch-count">{items.length} 条</span>
        </header>
        {items.map(item => <article className="routine" key={item.id}>
          <div className="routine-heading">
            <button type="button" className="routine-name" onClick={() => open(item)}>{item.title}<ArrowUpRight size={16} /></button>
            <span className={"status " + item.status}>{statuses[item.status]}</span>
            <button type="button" className="button icon subtle delete" aria-label={"删除" + item.title} onClick={() => onDelete(item)}><Trash2 size={16} /></button>
          </div>
          <div className="routine-tools"><button type="button" className="text-button" onClick={() => onCategory(item)}><Folder size={14}/>{item.category || "未分类"}</button><button type="button" className="text-button" onClick={() => onShare(item)}><Share2 size={14}/>分享</button></div>
          <RouteSummary mode={item.mode} hands={item} steps={item.steps} />
          {item.note && <p className="routine-note">{item.note}</p>}
        </article>)}
      </section>
    })}
  </main>
}

function IdeaList({ title, ideas, mode, hands, apply }) {
  return <section className="idea-group">
    <h3>{title}</h3>
    {ideas.length ? ideas.map(idea => <article className="idea" key={patternKey(mode, hands, idea.steps)}>
      <RouteSummary mode={mode} hands={hands} steps={idea.steps} />
      <div className="idea-bottom"><p>{idea.reason}</p>
        <button className="button outline compact" type="button" onClick={() => apply(idea.steps)}>查看线路<ArrowRight size={15} /></button></div>
    </article>) : <p className="muted">当前条件下暂无新线路，可调整发球、落点或对手接法。</p>}
  </section>
}

function SaveRoutine({ mode, draft, busy, error, close, save, categories }) {
  const { saved, steps } = draft
  const same = saved && patternKey(mode, draft, steps) === patternKey(saved.mode, saved, saved.steps)
  const lastIndex = steps.length - 1
  const titleHint = shotName(steps[1], shotActor(mode, 1), draft) + " · " +
    zoneName(steps[1].zone) + " → " + shotName(steps[lastIndex], shotActor(mode, lastIndex), draft)
  const [form, setForm] = useState({ title: same ? saved.title : titleHint, status: same ? saved.status : "practice", note: same ? saved.note : "", category: saved?.category || "" })
  function set(field, value) { setForm(previous => ({ ...previous, [field]: value })) }
  const canSave = form.title.trim().length > 0 && !busy
  return <Modal title="保存套路" close={close} busy={busy}>
    <RouteSummary mode={mode} hands={draft} steps={steps} />
    <form className="modal-form" onSubmit={event => {
      event.preventDefault()
      if (canSave) save(form, !!same)
    }}>
      <label><span>套路名称</span><input value={form.title} onChange={event => set("title", event.target.value)} maxLength={60} required /></label>
      <CategoryField value={form.category} set={v => set("category", v)} categories={categories} />
      <div className="field">
        <span id="pattern-status">状态</span>
        <div className="segments" role="group" aria-labelledby="pattern-status">
          {Object.entries(statuses).map(([id, label]) => <button key={id} type="button" aria-pressed={form.status === id} onClick={() => set("status", id)}>{label}</button>)}
        </div>
      </div>
      <label><span>实战笔记 <small>选填</small></span>
        <textarea value={form.note} onChange={event => set("note", event.target.value)} maxLength={1000} rows={3} placeholder="例如，对方摆短时我站得太深，下次先上步。" />
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="modal-actions">
        {saved && !same && <button className="button outline" type="button" disabled={!canSave} onClick={() => save(form, true)}>更新原套路</button>}
        {same && error && <button className="button outline" type="button" disabled={!canSave} onClick={() => save(form, false)}>另存一条</button>}
        <button className="button primary" type="submit" disabled={!canSave}>
          <Bookmark size={16} />{busy ? "正在保存…" : same ? "保存修改" : "保存新套路"}
        </button>
      </div>
    </form>
  </Modal>
}

export default function Workbench({ routineStore = cloud, localOnly = false, brandIcon = "/favicon.svg" } = {}) {
  const [page, setPage] = useState("serve")
  const [mode, setMode] = useState("serve")
  const [drafts, setDrafts] = useState(defaults)
  const [adjustment, setAdjustment] = useState("read")
  const [dialog, setDialog] = useState(null)
  const [records, setRecords] = useState([])
  const [pending, setPending] = useState(false)
  const [cloudError, setCloudError] = useState("")
  const [dialogError, setDialogError] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [ideas, setIdeas] = useState({ openers: [], branches: [] })
  const opponent = usePreferences(dialog?.type === "repertoire", localOnly)
  const preferences = opponent.snapshot?.groups ?? allReceives
  const categories = useMemo(() => [...new Set(records.map(r => r.category).filter(Boolean))].sort((a,b) => a.localeCompare(b,"zh")), [records])
  const [largeCourt, setLargeCourt] = useState(false)
  const compact = useSyncExternalStore(subscribeToScreen, isCompact, desktopAtStartup)
  const editorTitle = useRef(null)
  const sequence = useRef(0)
  const id = useRef("")
  const draft = drafts[mode]
  const { myHand, hand, active } = draft
  const hands = useMemo(() => ({ myHand, hand }), [myHand, hand])
  const focus = Math.max(0, Math.min(draft.active, draft.steps.length - 1))
  const base = useMemo(() => analyze(mode, hands, draft.steps, "read", focus), [mode, hands, draft.steps, focus])
  const projected = useMemo(() => adjustment === "fixed" ? analyze(mode, hands, draft.steps.slice(0, focus + 1), adjustment, focus) : base.slice(0, active + 1),
    [adjustment, base, mode, hands, draft.steps, focus, active])

  const refresh = useCallback(async () => {
    const index = ++sequence.current
    setPending(true)
    try {
      const { items } = await routineStore()
      if (index === sequence.current) {
        setRecords(items)
        setCloudError("")
      }
    } catch (error) {
      if (index === sequence.current) setCloudError(error.message)
    } finally {
      if (index === sequence.current) setPending(false)
    }
  }, [routineStore])

  useEffect(() => {
    void refresh()
    const onVisible = () => { if (document.visibilityState === "visible") void refresh() }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [refresh])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(""), 4400)
    return () => window.clearTimeout(timer)
  }, [message])

  function update(transform) {
    setAdjustment("read")
    setDrafts(previous => ({ ...previous, [mode]: transform(previous[mode]) }))
  }

  function changePage(name) {
    setLargeCourt(false)
    setPage(name)
    setAdjustment("read")
    if (name === "library") void refresh()
    else setMode(name)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  function editPreferences() {
    void opponent.refresh()
    setDialog({ type: "repertoire" })
  }

  function changeServe(changes) {
    update(previous => {
      if (Object.entries(changes).every(([field, value]) => value === previous.setup[field])) return previous
      const setup = { ...previous.setup, ...changes }
      const ready = setup.family && setup.spin && setup.zone
      return { ...previous, setup, active: 0, steps: ready ? [setup] : [] }
    })
  }

  function changeHand(field, value) {
    setAdjustment("read")
    setDrafts(previous => Object.fromEntries(Object.entries(previous).map(([key, item]) => {
      if (field === "hand" && key !== mode || item[field] === value) return [key, item]
      return [key, { ...item, [field]: value, steps: item.steps.slice(0, 1), active: 0 }]
    })))
  }
  function goTo(step) {
    update(previous => ({ ...previous, active: step }))
    setLargeCourt(false)
    requestAnimationFrame(() => {
      editorTitle.current?.focus({ preventScroll: true })
      if (window.matchMedia("(max-width: 720px)").matches)
        editorTitle.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
    })
  }
  function setZone(index, zone, point) {
    if (index === 0) {
      changeServe({ zone, point })
      return
    }
    update(previous => {
      const previousShot = previous.steps[index]
      if (!previousShot) return previous
      if (previousShot.zone === zone && previousShot.point?.lateral === point?.lateral &&
        previousShot.point?.depth === point?.depth) return previous
      const active = index
      return { ...previous, active, steps: [...previous.steps.slice(0, index), { ...previousShot, zone, point }] }
    })
  }

  function choose(shot) {
    update(previous => {
      const index = previous.active
      const selected = previous.steps[index]
      const same = selected?.tech === shot.tech && selected.zone === shot.zone && selected.label === shot.label
      const active = index
      return { ...previous, active, steps: same ? previous.steps : [...previous.steps.slice(0, index), shot] }
    })
    setDialog(null)
  }

  function openSave() {
    if (!complete) return
    id.current = window.crypto.randomUUID()
    setDialogError("")
    setDialog({ type: "save" })
  }

  async function save(form, updateExisting) {
    if (busy) return
    setBusy(true)
    setDialogError("")
    try {
      const { saved, steps } = draft
      const payload = { ...form, mode, ...hands, steps, id: updateExisting ? saved.id : id.current,
        ...(updateExisting ? { revision: saved.revision } : {}) }
      const { item } = await routineStore(updateExisting ? "PUT" : "POST", payload)
      sequence.current++
      setPending(false)
      setRecords(previous => [item, ...previous.filter(record => record.id !== item.id)])
      setCloudError("")
      update(() => blankDraft(myHand, hand))
      changePage(mode)
      setDialog(null)
      setMessage("套路已保存，可开始下一条")
    } catch (error) {
      setDialogError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function storeLibraryItem(value, existing = null) {
    if (busy) return
    setBusy(true)
    setDialogError("")
    try {
      const { item } = await routineStore(existing ? "PUT" : "POST", { ...value, id: existing?.id || id.current,
        ...(existing ? { revision: existing.revision } : {}) })
      sequence.current++
      setPending(false)
      setRecords(old => [item, ...old.filter(r => r.id !== item.id)])
      setCloudError("")
      setDialog(null)
      setMessage(existing ? "分类已更新" : "已导入套路库")
    } catch (error) { setDialogError(error.message) }
    finally { setBusy(false) }
  }

  function open(item) {
    setDrafts(previous => ({ ...previous, [item.mode]: {
      steps: item.steps, setup: item.steps[0], active: item.steps.length - 1,
      myHand: playerHand("me", item), hand: item.hand, saved: item,
    } }))
    changePage(item.mode)
  }

  async function remove(item) {
    if (busy) return
    setBusy(true)
    setDialogError("")
    try {
      await routineStore("DELETE", { id: item.id, revision: item.revision })
      sequence.current++
      setPending(false)
      setRecords(previous => previous.filter(record => record.id !== item.id))
      setDrafts(previous => Object.fromEntries(Object.entries(previous).map(([key, draft]) =>
        [key, draft.saved?.id === item.id ? { ...draft, saved: null } : draft])))
      setDialog(null)
      setMessage("已删除套路")
    } catch (error) {
      setDialogError(error.message)
    } finally {
      setBusy(false)
    }
  }

  const close = () => setDialog(null)
  const currentAssessment = active > 0 && draft.steps[active] ? assessStroke(base[active - 1], draft.steps[active].tech) : null
  const ready = !!draft.steps[active] && !!base[active]?.valid && (!currentAssessment || currentAssessment.allowed)
  const complete = draft.steps.length === tracks[mode].length && base.every((b, i) => b?.valid && (i === 0 || assessStroke(base[i - 1], draft.steps[i].tech).allowed))
  function find() { setIdeas(findIdeas(mode, hands, draft.steps[0], records, preferences)); setDialog({ type: "ideas" }) }
  function apply(steps) { update(p => ({ ...p, steps, setup: steps[0], active: 0, saved: null })); close() }
  const court = <Court mode={mode} hands={hands} active={active} setup={draft.setup} steps={draft.steps} focus={focus} readResults={base} visibleResults={projected} adjustment={adjustment} setAdjustment={setAdjustment}
            setZone={setZone} editable={active === 0 ? !!draft.setup.spin : !!draft.steps[active]} expanded={largeCourt} setExpanded={setLargeCourt} />
  return <>
    <a className="skip-link" href="#workspace-main">跳到工作区</a>
    <header className="top-bar"><div className="top-inner"><div className="brand"><img src={brandIcon} width="27" height="27" alt="" /><span>乒乓球发接发<span className="brand-tail">技战术分析平台</span></span></div>
      <nav className="workspace-nav" aria-label="主导航">{page === "library"
        ? <button type="button" onClick={() => changePage(mode)}><ArrowLeft size={16}/>返回分析台</button>
        : <button type="button" onClick={() => changePage("library")}><Library size={16}/>套路库</button>}</nav></div></header>
    {page === "library" ? <RoutineLibrary localOnly={localOnly} records={records} pending={pending} error={cloudError} reload={refresh} open={open} onDelete={item => { setDialogError(""); setDialog({ type: "delete", item }) }} onStart={() => changePage(mode)} categories={categories}
      onShare={item => setDialog({type:"share", item})}
      onImport={() => { id.current = crypto.randomUUID(); setDialogError(""); setDialog({type:"import"}) }}
      onCategory={item => { setDialogError(""); setDialog({type:"category", item}) }} /> :
      <main id="workspace-main" className="main-frame" tabIndex={-1}><div className="analysis-heading">
        <h1>套路分析</h1>
        <div className="mode-picker" role="group" aria-label="分析模式">{Object.entries(modeNames).map(([key, name]) => <button key={key} type="button" aria-pressed={mode === key} onClick={() => changePage(key)}>
          {key === "serve" ? <ArrowUpRight size={21}/> : <ArrowDownLeft size={21}/>}<strong>{name}</strong><span>{key === "serve" ? "一、三板" : "二、四板"}</span></button>)}</div>
        <div className="page-actions"><button className="match-button" type="button" onClick={() => setDialog({ type: "players" })}><SlidersHorizontal size={15}/>我方{handName(myHand)}<span>·</span>对手{handName(hand)}</button>
          <button className="ideas-button" type="button" onClick={find}><Compass size={17}/>找新套路</button></div></div>
        <div className={"workspace" + (largeCourt ? " expanded-court" : "")}>

          <section className="panel editor-panel" id="decisions" aria-label={tracks[mode][active]}>
            <ol className="progress-steps" aria-label="套路步骤">{tracks[mode].map((title, index) => <li key={title}><button type="button" aria-current={active === index ? "step" : undefined} aria-label={(index + 1) + " " + title}
              disabled={index > draft.steps.length || index > 0 && !base[index - 1]?.valid} onClick={() => goTo(index)}><span className="step-number">{index < active && draft.steps[index] ? <Check size={13} /> : index + 1}</span><span>{title}</span></button>
              {index < tracks[mode].length - 1 && <span className="step-line" />}</li>)}</ol>
            <div className="editor-body"><div className="editor-heading"><h2 ref={editorTitle} tabIndex={-1}>{tracks[mode][active]}</h2></div>
            {active === 0 ? <>
              <ServeControls mode={mode} draft={draft} onChange={changeServe} />{base[0] && !base[0].valid && <p role="status" className="notice error">这组球速与落点暂时无法形成有效发球，请微调落点或球速。</p>}</> :
              <Decisions key={mode + active} mode={mode} draft={draft} results={base} preferences={preferences} preferenceStatus={opponent.error ? "读取失败" : !opponent.snapshot ? "读取中" : ""} onPreferences={editPreferences} choose={choose} onCustom={() => setDialog({ type: "custom" })} onZone={setZone} />}</div>
            <div className="step-actions"><button className="button subtle" type="button" onClick={() => active > 0 ? goTo(active - 1) : setDialog({ type: "reset" })} disabled={!active && !draft.setup.family}>
              {active > 0 ? <ArrowLeft size={17} /> : <RotateCcw size={16} />}{active > 0 ? "上一步" : "重选"}</button>
              <button className="court-toggle button" type="button" onClick={() => setLargeCourt(true)} aria-haspopup="dialog"><MapIcon size={17}/>球台</button>
              <button className="button primary continue" type="button" disabled={!ready || active === tracks[mode].length - 1 && !complete} onClick={() => active < tracks[mode].length - 1 ? goTo(active + 1) : openSave()}>
                {active === tracks[mode].length - 1 ? <><Bookmark size={17} />保存套路</> : <>继续<ArrowRight size={17} /></>}</button></div></section>
          {largeCourt ? <Modal title="球台" close={() => setLargeCourt(false)}>{court}</Modal> : !compact && court}</div>
      </main>}
    {dialog?.type === "share" && <ShareDialog item={dialog.item} close={close}/>}
    {dialog?.type === "import" && <ImportDialog close={close} busy={busy} error={dialogError} save={storeLibraryItem}/>}
    {dialog?.type === "category" && <CategoryDialog item={dialog.item} categories={categories} close={close} busy={busy} error={dialogError} save={storeLibraryItem}/>}
    {dialog?.type === "repertoire" && <RepertoireDialog localOnly={localOnly} preferences={opponent} close={close}/>}
    {dialog?.type === "players" && <Modal title="对手与持拍手" close={close}><div className="player-settings">{[["myHand", "我方"], ["hand", "对手"]].map(([field, label]) => <div className="setting-row" key={field}>
      <span>{label}</span><Segments values={{ right: "右手", left: "左手" }} value={hands[field]} set={value => changeHand(field, value)} label={label + "持拍手"} /></div>)}</div><p className="muted">更改持拍手后，后续板次需重选。</p><button type="button" className="button outline" onClick={editPreferences}><SlidersHorizontal size={15}/>对手常用接法</button><div className="modal-actions"><button type="button" className="button primary" onClick={close}>完成</button></div></Modal>}
    {dialog?.type === "custom" && <CustomShot draft={draft} results={base} close={close} onChoose={choose} />}
    {dialog?.type === "save" && <SaveRoutine mode={mode} draft={draft} close={close} save={save} categories={categories} busy={busy} error={dialogError} />}
    {dialog?.type === "ideas" && <Modal title="找新套路" close={close} wide>{draft.steps.length > 0 && <IdeaList title="同一发球，换一种接法" ideas={ideas.branches} mode={mode} hands={hands} apply={apply} />}
      <IdeaList title="试试这些组合" ideas={ideas.openers} mode={mode} hands={hands} apply={apply} /></Modal>}
    {dialog?.type === "reset" && <Modal title="重新开始这条套路？" close={close}><p className="muted">当前未保存的选择会清空，套路库不受影响。</p><div className="modal-actions"><button className="button outline" type="button" onClick={close}>取消</button>
      <button className="button primary" type="button" onClick={() => { update(() => blankDraft(myHand, hand)); close() }}>重新开始</button></div></Modal>}
    {dialog?.type === "delete" && <Modal title="删除这条套路？" close={close} busy={busy}><p className="delete-title">{dialog.item.title}</p>{dialogError && <p className="notice error" role="alert">{dialogError}</p>}
      <div className="modal-actions"><button className="button outline" type="button" disabled={busy} onClick={close}>取消</button><button className="button danger" type="button" disabled={busy} onClick={() => remove(dialog.item)}>删除</button></div></Modal>}
    <div aria-live="polite">{message && <div className="toast"><Check size={17} />{message}</div>}</div>
  </>
}
