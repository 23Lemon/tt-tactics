"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight, ArrowUpRight, Bookmark, Check, ChevronDown, Compass,
  Library, Plus, RefreshCw, Search, Trash2, X,
} from "lucide-react"
import {
  DEFAULT_POSITION, SERVES, SERVE_POSITION_LIMITS, STARTING_POSITIONS, STRENGTHS, STROKES, STROKE_GROUPS, ZONES,
  handName, openingKey, patternKey, playerHand, servePositionName, serveSpinName,
  shotActor, shotName, zoneName,
} from "../lib/table-tennis/catalog.mjs"
import { analyze, secondBounceDescription, spinDescription } from "../lib/table-tennis/physics.mjs"
import { findIdeas, incomingIntentLabel, optionsFor } from "../lib/table-tennis/tactics.mjs"
import Court, { NumberBadge } from "./court"
import { routineStore } from "./routine-store.mjs"

const blankDraft = () => ({
  setup: { family: "", spin: "", zone: "", strength: "medium", position: DEFAULT_POSITION },
  steps: [], active: 1, myHand: "right", hand: "right", saved: null,
})
const defaults = () => ({ serve: blankDraft(), receive: blankDraft() })
const modeNames = { serve: "我发球", receive: "我接发" }
const statuses = { practice: "想练", using: "在用" }

const tracks = {
  serve: [
    { title: "对方常见接法", tab: "对方接发" },
    { title: "我的第三板", tab: "我的第三板" },
  ],
  receive: [
    { title: "我的接发选择", tab: "我的接发" },
    { title: "对方可能的第三板", tab: "对方第三板" },
    { title: "我的第四板", tab: "我的第四板" },
  ],
}

const refs = [
  ["Table Tennis England", "接发的三种主要选择", "https://newsarchive.tabletennisengland.co.uk/news/archived/return-of-serve/"],
  ["Table Tennis Scotland", "接发球训练卡", "https://tabletennisscotland.co.uk/wp-content/uploads/2025/04/TTS-Snap-Cards-A4-Improving-Service-Return-print-at-home.pdf"],
  ["Larry Hodges · Butterfly", "不同旋转与长短的接发", "https://butterflyonline.com/how-to-return-different-serves/"],
]

function Select({ children, ...props }) {
  return <div className="select-frame">
    <select {...props}>{children}</select><ChevronDown size={14} aria-hidden="true" />
  </div>
}

function ZoneOptions() {
  return ZONES.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)
}

function PositionControl({ value, set }) {
  const { min, max } = SERVE_POSITION_LIMITS
  const isOldPosition = value > max
  const description = isOldPosition ? "原站位" : servePositionName(value)
  return <div className="position-control">
    <div className="position-heading"><span id="serve-position">发球站位</span>
      <div className="segments small" role="group" aria-labelledby="serve-position">
        {STARTING_POSITIONS.map(position => <button key={position.name} type="button"
          aria-pressed={description === position.name} onClick={() => set(position.value)}>{position.name}</button>)}
      </div>
    </div>
    <input className="position-range" type="range" min={min} max={max} step={.01}
      aria-label="微调发球站位" aria-valuetext={description} value={Math.min(value, max)}
      onChange={event => set(Number(event.target.value))} />
    {isOldPosition && <p className="position-note">当前显示这条旧套路的原站位。移动滑条可更新击球点。</p>}
  </div>
}

function ServeControls({ mode, draft, onChange }) {
  const serve = draft.setup
  const actor = shotActor(mode, 0)
  return <section className="panel serve-panel">
    <div className="panel-heading with-number">
      <NumberBadge index={0} />
      <h2>{mode === "serve" ? "我的发球" : "对方发球"}</h2>
    </div>
    <div className="serve-controls">
      <label><span>发球手法</span>
        <Select name="serve-family" value={serve.family} onChange={event => {
          const family = event.target.value
          onChange({ family, spin: SERVES[family].spins.includes(serve.spin) ? serve.spin : "" })
        }}>
          <option value="" disabled>选发球手法</option>
          {Object.entries(SERVES).map(([id, family]) => <option key={id} value={id}>{family.name}</option>)}
        </Select>
      </label>
      <label><span>旋转</span>
        <Select name="serve-spin" value={serve.spin} disabled={!serve.family} onChange={event => onChange({ spin: event.target.value })}>
          <option value="" disabled>选旋转</option>
          {SERVES[serve.family]?.spins.map(id => <option key={id} value={id}>
            {serveSpinName({ ...serve, spin: id }, actor, draft)}
          </option>)}
        </Select>
      </label>
      <label><span>落点分区</span>
        <Select name="serve-zone" value={serve.zone} onChange={event => onChange({ zone: event.target.value, point: undefined })}>
          <option value="" disabled>选分区</option>
          <ZoneOptions />
        </Select>
      </label>
    </div>
    {serve.spin && serve.spin !== "dead" && <div className="strength-row">
      <span id="spin-strength">旋转强度</span>
      <div className="segments small" role="group" aria-labelledby="spin-strength">
        {Object.entries(STRENGTHS).map(([id, name]) => <button key={id} type="button"
          aria-pressed={serve.strength === id} onClick={() => onChange({ strength: id })}>{name}</button>)}
      </div>
    </div>}
    <PositionControl value={serve.position} set={position => onChange({ position })} />
  </section>
}

function Decisions({ mode, draft, results, goTo, choose, onCustom, onSave }) {
  const { steps, active } = draft
  const incoming = results[active - 1]
  const options = optionsFor(incoming, draft)
  const [selected, track] = [steps[active], tracks[mode][active - 1]]
  const actor = shotActor(mode, active)
  const complete = steps.length === tracks[mode].length + 1
  const ready = steps.length > 0

  return <section className="panel decision-panel" id="decisions" aria-label="逐板选择">
    <div className="step-nav" role="group" aria-label="板次">
      {tracks[mode].map(({ tab }, index) => {
        const step = index + 1
        return <button key={tab} type="button" aria-current={active === step ? "step" : undefined}
          disabled={step > steps.length} onClick={() => goTo(step)}>
          <NumberBadge index={step} /><span>{tab}</span>
          {steps[step] && active !== step && <Check className="step-check" size={13} aria-label="已选" />}
        </button>
      })}
    </div>
    <div className="decision-body">
      <div className="decision-title">
        <h2>{track.title}</h2>
        {ready && <button className="button subtle compact" onClick={onCustom} type="button"><Plus size={15} />自定义</button>}
      </div>
      {incoming?.valid ? <p className="incoming">来球
        {[zoneName(incoming.zone), spinDescription(incoming), secondBounceDescription(incoming), incomingIntentLabel(incoming)]
          .filter(Boolean).map(label => <span key={label}>{label}</span>)}
      </p> :
        <p className="incoming">{ready ? "上一板预计失误，调整线路后可继续分析。" : "选好发球手法、旋转和落点后继续。"}</p>}
      {selected?.label && <div className="custom-selected"><Check size={15} />{selected.label} · {zoneName(selected.zone)}</div>}
      <div className="choices">
        {options.map(({ tech, zone, reason }) => {
          const chosen = selected?.tech === tech && selected?.zone === zone && !selected?.label
          return <button className="choice" aria-pressed={chosen} key={tech + zone} type="button" onClick={() => choose({ tech, zone })}>
            <div className="choice-copy">
              <div className="choice-title"><strong>{STROKES[tech].name}</strong><span className="choice-zone">{zoneName(zone)}</span></div>
              <p>{reason}</p>
            </div>
            {chosen ? <Check className="choice-arrow" size={17} /> : <ArrowRight className="choice-arrow" size={16} />}
          </button>
        })}
        {selected && !selected.label && !options.some(({ tech, zone }) => tech === selected.tech && zone === selected.zone) &&
          <div className="custom-selected"><Check size={15} />{shotName(selected, actor, draft)} · {zoneName(selected.zone)}</div>}
      </div>
    </div>
    {ready && <div className="decision-footer">
      <span>{complete ? "已选完这条路线" : "选完第 " + (tracks[mode].length + 1) + " 板后保存"}</span>
      <button className="button primary" type="button" disabled={!complete} onClick={onSave}><Bookmark size={16} />保存套路</button>
    </div>}
  </section>
}

function RouteSummary({ mode, hands, steps }) {
  return <ol className="route-summary">
    {steps.map((step, index) => {
      const actor = shotActor(mode, index)
      return <li key={index}>
        <NumberBadge index={index} />
        <span><strong>{shotName(step, actor, hands)}</strong><small>{actor === "me" ? "我方 → 对手" : "对手 → 我方"}{zoneName(step.zone)}</small></span>
      </li>
    })}
  </ol>
}

function RoutineLibrary({ records, pending, error, reload, open, onDelete, onStart }) {
  const [which, setWhich] = useState("all")
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()
  const relevant = records.filter(item => (which === "all" || which === item.mode) &&
    (!query || [item.title, item.note, ...item.steps.map((step, index) => shotName(step, shotActor(item.mode, index), item) + " " + zoneName(step.zone))]
      .join(" ").toLowerCase().includes(query)))
  const groups = new Map()
  for (const item of relevant) {
    const key = openingKey(item.mode, item, item.steps[0])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  return <main className="main-frame library-view">
    <div className="page-heading">
      <div><h1>套路库</h1><p>套路保存在当前浏览器。</p></div>
      <button className="button outline" type="button" onClick={reload} disabled={pending}><RefreshCw size={16} />刷新</button>
    </div>
    <div className="library-controls">
      <div className="segments" role="group" aria-label="筛选套路">
        {[["all", "全部"], ["serve", "我发球"], ["receive", "我接发"]].map(([id, name]) =>
          <button type="button" key={id} aria-pressed={which === id} onClick={() => setWhich(id)}>{name}</button>)}
      </div>
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
          <RouteSummary mode={item.mode} hands={item} steps={item.steps} />
          {item.note && <p className="routine-note">{item.note}</p>}
        </article>)}
      </section>
    })}
  </main>
}

function Modal({ title, children, close, wide = false, busy }) {
  const element = useRef(null)
  useEffect(() => {
    const dialog = element.current
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])
  return <dialog ref={element} className={"modal" + (wide ? " wide" : "")} aria-labelledby="dialog-title"
    onCancel={event => { event.preventDefault(); if (!busy) close() }}
    onClick={event => { if (event.target === element.current && !busy) close() }}>
    <div className="modal-content">
      <header><h2 id="dialog-title">{title}</h2>
        <button className="button icon subtle" type="button" disabled={busy} aria-label="关闭" onClick={close}><X size={19} /></button>
      </header>
      {children}
    </div>
  </dialog>
}

function CustomShot({ mode, draft, results, onChoose, close }) {
  const initial = draft.steps[draft.active] ?? optionsFor(results[draft.active - 1], draft)[0] ?? { tech: "fhPush", zone: "bh-long" }
  const initialTech = STROKES[initial.tech].menuTech ?? initial.tech
  const [tech, setTech] = useState(initialTech)
  const [zone, setZone] = useState(initial.zone)
  const [label, setLabel] = useState(initial.label ?? "")
  return <Modal title={"自定义第 " + (draft.active + 1) + " 板"} close={close}>
    <form className="modal-form" onSubmit={event => {
      event.preventDefault()
      const point = zone === initial.zone ? initial.point : undefined
      onChoose({ tech: tech === initialTech ? initial.tech : tech, zone,
        ...(point ? { point } : {}), ...(label.trim() ? { label: label.trim() } : {}) })
    }}>
      <label><span>接球方式</span><Select name="stroke" value={tech} onChange={event => setTech(event.target.value)}>
        {STROKES[initial.tech]?.legacy && <option value={initial.tech}>{STROKES[initial.tech].name}</option>}
        {STROKE_GROUPS.map(({ name, strokes }) => <optgroup key={name} label={name}>
          {strokes.map(id => <option key={id} value={id}>{STROKES[id].name}</option>)}
        </optgroup>)}
      </Select></label>
      <label><span>{shotActor(mode, draft.active) === "me" ? "对手" : "我方"}的落点</span><Select value={zone} onChange={event => setZone(event.target.value)}><ZoneOptions /></Select></label>
      <label><span>自定义叫法 <small>选填</small></span>
        <input value={label} maxLength={28} placeholder="可填写你习惯的技术名称" onChange={event => setLabel(event.target.value)} /></label>
      <div className="modal-actions"><button className="button primary" type="submit">选用这板<ArrowRight size={16} /></button></div>
    </form>
  </Modal>
}

function IdeaList({ title, ideas, mode, hands, apply }) {
  return <section className="idea-group">
    <h3>{title}</h3>
    {ideas.length ? ideas.map(idea => <article className="idea" key={patternKey(mode, hands, idea.steps)}>
      <RouteSummary mode={mode} hands={hands} steps={idea.steps} />
      <div className="idea-bottom"><p>{idea.reason}</p>
        <button className="button outline compact" type="button" onClick={() => apply(idea.steps)}>查看线路<ArrowRight size={15} /></button></div>
    </article>) : <p className="muted">当前推荐已收录。换个发球或落点再试。</p>}
  </section>
}

function SaveRoutine({ mode, draft, busy, error, close, save }) {
  const { saved, steps } = draft
  const same = saved && patternKey(mode, draft, steps) === patternKey(saved.mode, saved, saved.steps)
  const lastIndex = steps.length - 1
  const titleHint = shotName(steps[1], shotActor(mode, 1), draft) + " · " +
    zoneName(steps[1].zone) + " → " + shotName(steps[lastIndex], shotActor(mode, lastIndex), draft)
  const [form, setForm] = useState({ title: same ? saved.title : titleHint, status: same ? saved.status : "practice", note: same ? saved.note : "" })
  function set(field, value) { setForm(previous => ({ ...previous, [field]: value })) }
  const canSave = form.title.trim().length > 0 && !busy
  return <Modal title="保存套路" close={close} busy={busy}>
    <RouteSummary mode={mode} hands={draft} steps={steps} />
    <form className="modal-form" onSubmit={event => {
      event.preventDefault()
      if (canSave) save(form, !!same)
    }}>
      <label><span>套路名称</span><input value={form.title} onChange={event => set("title", event.target.value)} maxLength={60} required /></label>
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

export default function Workbench() {
  const [page, setPage] = useState("serve")
  const [mode, setMode] = useState("serve")
  const [drafts, setDrafts] = useState(defaults)
  const [adjustment, setAdjustment] = useState("read")
  const [dialog, setDialog] = useState(null)
  const [records, setRecords] = useState([])
  const [pending, setPending] = useState(false)
  const [storageError, setStorageError] = useState("")
  const [dialogError, setDialogError] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [ideas, setIdeas] = useState({ openers: [], branches: [] })
  const sequence = useRef(0)
  const id = useRef("")
  const draft = drafts[mode]
  const { myHand, hand } = draft
  const hands = useMemo(() => ({ myHand, hand }), [myHand, hand])
  const focus = Math.max(0, Math.min(draft.active, draft.steps.length - 1))
  const base = useMemo(() => analyze(mode, hands, draft.steps, "read", focus), [mode, hands, draft.steps, focus])
  const projected = useMemo(() => adjustment === "fixed" ? analyze(mode, hands, draft.steps.slice(0, focus + 1), adjustment, focus) : base,
    [adjustment, base, mode, hands, draft.steps, focus])

  const refresh = useCallback(async () => {
    const index = ++sequence.current
    setPending(true)
    try {
      const { items } = await routineStore()
      if (index === sequence.current) {
        setRecords(items)
        setStorageError("")
      }
    } catch (error) {
      if (index === sequence.current) setStorageError(error.message)
    } finally {
      if (index === sequence.current) setPending(false)
    }
  }, [])

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
    setPage(name)
    setAdjustment("read")
    if (name === "library") void refresh()
    else setMode(name)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  function changeServe(changes) {
    update(previous => {
      if (Object.entries(changes).every(([field, value]) => value === previous.setup[field])) return previous
      const setup = { ...previous.setup, ...changes }
      const ready = setup.family && setup.spin && setup.zone
      return { ...previous, setup, active: 1, steps: ready ? [setup] : [] }
    })
  }

  function changeHand(field, value) {
    if (field === "hand") {
      update(previous => ({ ...previous, hand: value, steps: previous.steps.slice(0, 1), active: 1 }))
      return
    }
    setAdjustment("read")
    setDrafts(previous => ({
      serve: { ...previous.serve, myHand: value },
      receive: { ...previous.receive, myHand: value },
    }))
  }

  function setZone(index, zone, point) {
    if (index === 0) {
      changeServe({ zone, point })
      return
    }
    update(previous => {
      const previousShot = previous.steps[index]
      if (previousShot.zone === zone && previousShot.point?.lateral === point?.lateral &&
        previousShot.point?.depth === point?.depth) return previous
      const active = Math.min(previous.active, index + 1)
      return { ...previous, active, steps: [...previous.steps.slice(0, index), { ...previousShot, zone, point }] }
    })
  }

  function choose(shot) {
    update(previous => {
      const index = previous.active
      const selected = previous.steps[index]
      const same = selected?.tech === shot.tech && selected.zone === shot.zone && selected.label === shot.label
      const active = Math.min(index + 1, tracks[mode].length)
      return { ...previous, active, steps: same ? previous.steps : [...previous.steps.slice(0, index), shot] }
    })
    setDialog(null)
  }

  function openSave() {
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
      setStorageError("")
      update(previous => ({ ...previous, saved: item }))
      setDialog(null)
      setMessage("套路已保存")
    } catch (error) {
      setDialogError(error.message)
    } finally {
      setBusy(false)
    }
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
  return <>
    <header className="top-bar">
      <div className="top-inner">
        <div className="brand"><img src={import.meta.env.BASE_URL + "court.png"} width="29" height="29" alt="" /><span>乒乓球发接发技战术分析平台</span></div>
        <nav className="primary-nav" aria-label="分析模式">
          {Object.entries(modeNames).map(([id, name]) =>
            <button key={id} type="button" aria-current={page === id ? "page" : undefined} onClick={() => changePage(id)}>{name}</button>)}
          <button type="button" className="library-link" aria-current={page === "library" ? "page" : undefined}
            onClick={() => changePage("library")}><Library size={16} />套路库</button>
        </nav>
      </div>
    </header>

    {page === "library" ? <RoutineLibrary records={records} pending={pending} error={storageError} reload={refresh}
      open={open} onDelete={item => { setDialogError(""); setDialog({ type: "delete", item }) }} onStart={() => changePage(mode)} /> :
      <main className="main-frame">
        <div className="page-heading">
          <div><h1>{mode === "serve" ? "发球与第三板" : "接发与第四板"}</h1>
            <p>{mode === "serve" ? "选定发球，逐个拆解对方的接法。" : "先选接发，再看对方第三板可能怎么打。"}</p></div>
          <div className="page-actions">
            {[["myHand", "我方"], ["hand", "对手"]].map(([field, label]) =>
              <label key={field} className="hand-select"><span>{label}</span>
                <Select value={hands[field]} onChange={event => changeHand(field, event.target.value)}>
                  <option value="right">右手</option><option value="left">左手</option>
                </Select>
              </label>)}
            <button className="button outline" type="button" onClick={() => {
              setIdeas(findIdeas(mode, hands, draft.steps[0], records))
              setDialog({ type: "ideas" })
            }}><Compass size={17} />找新套路</button>
          </div>
        </div>
        <div className="workspace">
          <Court mode={mode} hands={hands} active={draft.active} setup={draft.setup} steps={draft.steps} focus={focus} readResults={base} visibleResults={projected}
            adjustment={adjustment} setAdjustment={setAdjustment} setZone={setZone} />
          <div className="work-controls">
            <ServeControls mode={mode} draft={draft} onChange={changeServe} />
            <Decisions mode={mode} draft={draft} results={base} goTo={active => update(previous => ({ ...previous, active }))}
              choose={choose} onCustom={() => setDialog({ type: "custom" })} onSave={openSave} />
          </div>
        </div>
        <footer className="page-footer">
          <span>落点按接球方的正反手标记</span>
          <button type="button" className="button subtle compact" onClick={() => setDialog({ type: "refs" })}>训练资料<ArrowUpRight size={14} /></button>
        </footer>
      </main>}

    {dialog?.type === "custom" && <CustomShot mode={mode} draft={draft} results={base} close={close} onChoose={choose} />}
    {dialog?.type === "save" && <SaveRoutine mode={mode} draft={draft} close={close} save={save} busy={busy} error={dialogError} />}
    {dialog?.type === "ideas" && <Modal title="找新套路" close={close} wide>
      {draft.steps.length > 0 && <IdeaList title="这个发球下的其他分支" ideas={ideas.branches} mode={mode} hands={hands} apply={steps => {
        update(previous => ({ ...previous, steps, setup: steps[0], active: steps.length - 1, saved: null })); close()
      }} />}
      <IdeaList title="尚未收录的发球组合" ideas={ideas.openers} mode={mode} hands={hands} apply={steps => {
        update(previous => ({ ...previous, steps, setup: steps[0], active: steps.length - 1, saved: null })); close()
      }} />
    </Modal>}
    {dialog?.type === "delete" && <Modal title="删除这条套路？" close={close} busy={busy}>
      <p className="delete-title">{dialog.item.title}</p>
      {dialogError && <p className="notice error" role="alert">{dialogError}</p>}
      <div className="modal-actions">
        <button className="button outline" type="button" disabled={busy} onClick={close}>取消</button>
        <button className="button danger" type="button" disabled={busy} onClick={() => remove(dialog.item)}>删除</button>
      </div>
    </Modal>}
    {dialog?.type === "refs" && <Modal title="训练资料" close={close}>
      <div className="refs">{refs.map(([source, title, url]) => <a className="ref-link" key={url} href={url} target="_blank" rel="noreferrer">
        <div><strong>{title}</strong><span>{source}</span></div><ArrowUpRight size={16} />
      </a>)}</div>
    </Modal>}
    <div aria-live="polite">{message && <div className="toast"><Check size={17} />{message}</div>}</div>
  </>
}
