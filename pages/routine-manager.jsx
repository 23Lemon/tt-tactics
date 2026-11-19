import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowUpRight, Bookmark, Check, Copy, Download, Folder, Plus, RefreshCw, Search, Share2, Trash2, Upload, X } from "lucide-react"
import { handName, openingKey, playerHand, shotActor, shotName, zoneName } from "../lib/table-tennis/catalog.mjs"
import { exportRoutine, exportRoutineLibrary, importRoutine, importLimit } from "../lib/table-tennis/sharing.mjs"
import { deleteRoutine, listRoutines, restoreRoutineLibrary, saveRoutine, subscribeRoutines } from "./storage.mjs"
import "./routines.css"

const modeNames = { serve: "我发球", receive: "我接发" }
const statuses = { practice: "想练", using: "在用" }

function downloadJson(json, filename) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Modal({ title, close, busy = false, wide = false, children }) {
  const element = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = element.current
    dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [])
  return <dialog ref={element} className={`routine-modal${wide ? " routine-wide" : ""}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) close() }}
    onClick={event => { if (event.target === element.current && !busy) close() }}>
    <div className="routine-modal-content">
      <header className="routine-modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="routine-icon-button" aria-label="关闭" disabled={busy} onClick={close}><X size={20}/></button></header>
      {children}
    </div>
  </dialog>
}

function RouteSummary({ item }) {
  return <ol className="routine-route-summary" aria-label="套路线路">{item.steps.map((step, index) => {
    const actor = shotActor(item.mode, index)
    return <li key={index} className={actor === "me" ? "routine-my-shot" : "routine-opponent-shot"}>
      <span className="routine-step-number">{index + 1}</span><span><strong>{shotName(step, actor, item)}</strong><small>{actor === "me" ? "我方 → 对手" : "对手 → 我方"} · {zoneName(step.zone)}</small></span>
    </li>
  })}</ol>
}

function CategoryField({ value, onChange, categories, disabled = false }) {
  const id = useId()
  return <label className="routine-field"><span>分类</span><input aria-label="分类" value={value} list={id} maxLength={32} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder="未分类 · 可输入新分类"/><datalist id={id}>{categories.map(category => <option key={category} value={category}/>)}</datalist></label>
}

function titleSuggestion(item) {
  try {
    const first = item.steps[1], last = item.steps.at(-1)
    return `${shotName(first, shotActor(item.mode, 1), item)} · ${zoneName(first.zone)} → ${shotName(last, shotActor(item.mode, item.steps.length - 1), item)}`.slice(0, 60)
  } catch { return "我的发接发套路" }
}

export function SaveRoutineDialog({ item, categories, close, onSaved }) {
  const [form, setForm] = useState(() => ({ title: item.title || titleSuggestion(item), category: item.category || "", status: item.status || "practice", note: item.note || "" }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  function set(key, value) { setForm(previous => ({ ...previous, [key]: value })) }
  async function save(asNew) {
    if (busy || !form.title.trim()) return
    setBusy(true); setError("")
    try { const saved = await saveRoutine({ ...item, ...form }, { asNew }); onSaved(saved) }
    catch (problem) { setError(problem.message); setBusy(false) }
  }
  return <Modal title="保存套路" close={close} busy={busy}>
    <RouteSummary item={item}/>
    <form className="routine-form" onSubmit={event => { event.preventDefault(); save(!item.id) }}>
      <label className="routine-field"><span>套路名称</span><input aria-label="套路名称" autoComplete="off" value={form.title} onChange={event => set("title", event.target.value)} required maxLength={60} disabled={busy}/></label>
      <CategoryField value={form.category} onChange={value => set("category", value)} categories={categories} disabled={busy}/>
      <fieldset className="routine-status-field"><legend>状态</legend><div className="routine-segments">{Object.entries(statuses).map(([value, label]) => <button key={value} type="button" disabled={busy} aria-pressed={form.status === value} onClick={() => set("status", value)}>{label}</button>)}</div></fieldset>
      <label className="routine-field"><span>实战笔记 <small>选填</small></span><textarea aria-label="实战笔记" value={form.note} onChange={event => set("note", event.target.value)} maxLength={1000} rows={3} disabled={busy} placeholder="记录使用条件、衔接和下次要改进的地方"/></label>
      {error && <p role="alert" className="routine-error">{error}</p>}
      <div className="routine-actions">{item.id && <button type="button" className="routine-button" disabled={busy || !form.title.trim()} onClick={() => save(true)}><Plus size={16}/>另存一条</button>}<button type="submit" className="routine-button routine-primary" disabled={busy || !form.title.trim()}><Bookmark size={16}/>{busy ? "正在保存…" : item.id ? "保存修改" : "保存新套路"}</button></div>
    </form>
  </Modal>
}

export function ShareRoutineDialog({ item, close }) {
  const [includeNote, setIncludeNote] = useState(false)
  const [feedback, setFeedback] = useState("")
  const output = useRef(null)
  const json = exportRoutine(item, includeNote)
  const filename = (item.title.replace(/[^\p{L}\p{N}._-]+/gu, "-") || "tt-routine") + ".json"
  async function copy() {
    try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(json); setFeedback("已复制，可发给球友。") }
    catch { output.current?.focus(); output.current?.select(); setFeedback("已选中 JSON，可直接复制。") }
  }
  function download() {
    downloadJson(json, filename)
    setFeedback("已下载套路文件。")
  }
  return <Modal title="分享套路" close={close}><div className="routine-form">
    <strong className="routine-share-title">{item.title}</strong>
    {item.note && <label className="routine-check"><input type="checkbox" checked={includeNote} onChange={event => setIncludeNote(event.target.checked)}/>附上实战笔记</label>}
    <textarea ref={output} className="routine-json" aria-label="套路 JSON" readOnly value={json} rows={7} spellCheck={false}/>
    <p className="routine-muted">球友可在原网站或此页面的套路库导入这份 JSON。</p>
    <div className="routine-actions">
      <button type="button" className="routine-button routine-primary" onClick={copy}><Copy size={16}/>复制 JSON</button>
      <button type="button" className="routine-button" onClick={download}><Download size={16}/>下载文件</button>
    </div>
    <p className="routine-feedback" role="status">{feedback}</p>
  </div></Modal>
}

export function ImportRoutineDialog({ close, onImported }) {
  const [raw, setRaw] = useState("")
  const [item, setItem] = useState(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const reading = useRef(0)
  function preview(text) {
    try { setItem(importRoutine(text)); setError("") }
    catch (problem) { setItem(null); setError(problem.message) }
  }
  async function selectFile(file) {
    if (!file) return
    const sequence = ++reading.current
    setRaw(""); setItem(null); setError("")
    if (file.size > importLimit) { setError("文件超过 32 KB。"); return }
    try { const text = await file.text(); if (sequence === reading.current) { setRaw(text); preview(text) } }
    catch { if (sequence === reading.current) setError("文件读取失败，请重新选择。") }
  }
  async function save() {
    if (!item || busy) return
    setBusy(true); setError("")
    try { const result = await saveRoutine(item, { asNew: true }); onImported(result) }
    catch (problem) { setError(problem.message); setBusy(false) }
  }
  return <Modal title="导入套路" close={close} busy={busy}><div className="routine-form">
    <label className="routine-field"><span>选择 JSON 文件</span><input aria-label="选择套路 JSON 文件" type="file" accept=".json,application/json" disabled={busy} onChange={event => selectFile(event.target.files?.[0])}/></label>
    <label className="routine-field"><span>或粘贴 JSON</span><textarea aria-label="粘贴套路 JSON" value={raw} rows={5} spellCheck={false} maxLength={importLimit} disabled={busy} onChange={event => { reading.current++; setRaw(event.target.value); setItem(null); setError("") }} placeholder="粘贴球友分享的完整套路 JSON"/></label>
    {item && <div className="routine-import-preview"><strong>{item.title}</strong><p className="routine-muted">{modeNames[item.mode]} · 我方{handName(item.myHand)} · 对手{handName(item.hand)}</p><RouteSummary item={item}/>{item.note && <p className="routine-note">{item.note}</p>}</div>}
    {error && <p role="alert" className="routine-error">{error}</p>}
    <div className="routine-actions">{item ? <button type="button" className="routine-button routine-primary" disabled={busy} onClick={save}><Check size={16}/>{busy ? "正在导入…" : "加入我的套路库"}</button> : <button type="button" className="routine-button routine-primary" disabled={!raw.trim() || busy} onClick={() => preview(raw)}>预览套路</button>}</div>
  </div></Modal>
}

function CategoryDialog({ item, categories, close, onSaved }) {
  const [category, setCategory] = useState(item.category || "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError("")
    try { const record = await saveRoutine({ ...item, category }); onSaved(record) }
    catch (problem) { setError(problem.message); setBusy(false) }
  }
  return <Modal title="调整分类" close={close} busy={busy}><form className="routine-form" onSubmit={submit}><strong>{item.title}</strong><CategoryField value={category} onChange={setCategory} categories={categories} disabled={busy}/>{error && <p role="alert" className="routine-error">{error}</p>}<div className="routine-actions"><button className="routine-button routine-primary" disabled={busy}>{busy ? "正在保存…" : "保存分类"}</button></div></form></Modal>
}

function DeleteDialog({ item, close, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function remove() {
    setBusy(true); setError("")
    try { await deleteRoutine(item); onDeleted() }
    catch (problem) { setError(problem.message); setBusy(false) }
  }
  return <Modal title="删除这条套路？" close={close} busy={busy}><div className="routine-form"><strong>{item.title}</strong><p className="routine-muted">删除后无法恢复；需要保留时可先分享导出。</p>{error && <p role="alert" className="routine-error">{error}</p>}<div className="routine-actions"><button type="button" className="routine-button" disabled={busy} onClick={close}>取消</button><button type="button" className="routine-button routine-danger" disabled={busy} onClick={remove}><Trash2 size={16}/>{busy ? "正在删除…" : "确认删除"}</button></div></div></Modal>
}

export default function RoutineManager({ open, onClose, onOpen, draftToSave, onSaved }) {
  const view = open === true ? "library" : open
  const [records, setRecords] = useState([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [overlay, setOverlay] = useState(null)
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState("all")
  const [category, setCategory] = useState("*")
  const [feedback, setFeedback] = useState("")
  const [backupAction, setBackupAction] = useState(null)
  const [backupError, setBackupError] = useState("")
  const backupInput = useRef(null)
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const current = ++sequence.current
    setPending(true); setError("")
    try { const items = await listRoutines(); if (current === sequence.current) setRecords(items) }
    catch (problem) { if (current === sequence.current) setError(problem.message) }
    finally { if (current === sequence.current) setPending(false) }
  }, [])
  useEffect(() => {
    setFeedback("")
    setBackupError("")
    if (!view) { setOverlay(null); return }
    reload()
    const unsubscribe = subscribeRoutines(reload)
    return () => { sequence.current++; unsubscribe() }
  }, [view, reload])
  const categories = useMemo(() => [...new Set(records.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh")), [records])
  const groups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const map = new Map()
    for (const item of records) {
      if (mode !== "all" && item.mode !== mode || category !== "*" && (item.category || "") !== category) continue
      const text = [item.title, item.note, item.category, ...item.steps.map((step, index) => `${shotName(step, shotActor(item.mode, index), item)} ${zoneName(step.zone)}`)].join(" ").toLocaleLowerCase()
      if (query && !text.includes(query)) continue
      const key = openingKey(item.mode, item, item.steps[0])
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(item)
    }
    return [...map.values()]
  }, [records, search, mode, category])
  if (!view) return null
  function saved(item) { onSaved?.(item); onClose?.() }
  if (view === "save") return draftToSave ? <SaveRoutineDialog item={draftToSave} categories={categories} close={onClose} onSaved={saved}/> : <Modal title="保存套路" close={onClose}><p className="routine-error" role="alert">请先完成这条套路的所有板次。</p></Modal>
  function openRecord(item) { if (onOpen?.(item) !== false) onClose?.() }
  function imported(message) {
    setOverlay(null); setFeedback(message); setSearch(""); setMode("all"); setCategory("*"); reload()
  }
  async function exportAll() {
    setBackupAction("export"); setBackupError(""); setFeedback("")
    try {
      const items = await listRoutines()
      const date = new Date().toLocaleDateString("sv-SE")
      downloadJson(exportRoutineLibrary(items), `tt-tactics-${date}.json`)
      setFeedback(`已导出 ${items.length} 条套路（含笔记）。`)
    } catch (problem) { setBackupError(problem.message) }
    finally { setBackupAction(null) }
  }
  async function importAll(event) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setBackupAction("import"); setBackupError(""); setFeedback("")
    try {
      const count = await restoreRoutineLibrary(await file.text())
      imported(count ? `已添加 ${count} 条套路。` : "这份备份没有套路。")
    } catch (problem) { setBackupError(problem.message) }
    finally { setBackupAction(null) }
  }
  return <>
    <Modal title="套路库" close={onClose} busy={Boolean(backupAction)} wide>
      <div className="routine-library-heading">
        <p className="routine-muted">保存在当前浏览器。</p>
        <div className="routine-actions">
          <button type="button" className="routine-button" disabled={Boolean(backupAction)}
            onClick={() => { setFeedback(""); setBackupError(""); setOverlay({ type: "import" }) }}><Upload size={16}/>导入单条</button>
          <button type="button" className="routine-button" disabled={Boolean(backupAction)}
            onClick={() => backupInput.current.click()}><Upload size={16}/>{backupAction === "import" ? "正在导入…" : "导入全部"}</button>
          <button type="button" className="routine-button" disabled={pending || Boolean(backupAction) || !records.length}
            onClick={exportAll}><Download size={16}/>{backupAction === "export" ? "正在导出…" : "导出全部"}</button>
          <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={importAll}/>
          <button type="button" className="routine-icon-button" aria-label="刷新套路库" disabled={pending} onClick={reload}><RefreshCw size={17} className={pending ? "routine-spinning" : ""}/></button>
        </div>
      </div>
      <div className="routine-library-controls"><div className="routine-segments" role="group" aria-label="筛选套路模式">{[["all", "全部"], ["serve", "我发球"], ["receive", "我接发"]].map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div><label className="routine-search"><Search size={16}/><input aria-label="搜索套路" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索名称、技术、落点或笔记"/></label><select aria-label="按分类筛选" value={category} onChange={event => setCategory(event.target.value)}><option value="*">全部分类</option><option value="">未分类</option>{category && category !== "*" && !categories.includes(category) && <option value={category}>{category}</option>}{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
      {error && <p className="routine-error" role="alert">{error} <button type="button" className="routine-text-button" onClick={reload}>重新读取</button></p>}
      {backupError && <p className="routine-error" role="alert">{backupError}</p>}
      {feedback && <p role="status" className="routine-feedback">{feedback}</p>}
      {pending && !records.length && <p className="routine-empty" role="status">正在读取套路…</p>}
      {!pending && !groups.length && !error && <div className="routine-empty"><Bookmark size={27}/><h3>{records.length ? "没有符合条件的套路" : "还没有保存的套路"}</h3><p>{records.length ? "试试其他关键词或分类。" : "在球台选完三／四板后，就能保存一套套路。"}</p><button type="button" className="routine-button" onClick={onClose}><ArrowLeft size={16}/>返回球台</button></div>}
      <div className="routine-groups">{groups.map(items => {
        const first = items[0]
        return <section className="routine-group" key={openingKey(first.mode, first, first.steps[0])}><header><div><small>{modeNames[first.mode]} · 我方{handName(playerHand("me", first))} · 对手{handName(playerHand("opponent", first))}</small><h3>{shotName(first.steps[0], shotActor(first.mode, 0), first)} <span>· {zoneName(first.steps[0].zone)}</span></h3></div><span>{items.length} 条</span></header>{items.map(item => <article className="routine-record" key={item.id}><div className="routine-record-heading"><button type="button" className="routine-record-title" onClick={() => openRecord(item)}>{item.title}<ArrowUpRight size={15}/></button><span className={`routine-status ${item.status}`}>{statuses[item.status]}</span></div><div className="routine-record-tools"><button type="button" className="routine-text-button" onClick={() => setOverlay({ type: "category", item })}><Folder size={14}/>{item.category || "未分类"}</button><button type="button" className="routine-text-button" onClick={() => setOverlay({ type: "share", item })}><Share2 size={14}/>分享</button><button type="button" className="routine-icon-button routine-delete" aria-label={`删除${item.title}`} onClick={() => setOverlay({ type: "delete", item })}><Trash2 size={15}/></button></div><RouteSummary item={item}/>{item.note && <p className="routine-note">{item.note}</p>}<button type="button" className="routine-edit" onClick={() => openRecord(item)}>打开修改<ArrowUpRight size={14}/></button></article>)}</section>
      })}</div>
    </Modal>
    {overlay?.type === "share" && <ShareRoutineDialog item={overlay.item} close={() => setOverlay(null)}/>}
    {overlay?.type === "import" && <ImportRoutineDialog close={() => setOverlay(null)} onImported={() => imported("套路已导入。")}/>}
    {overlay?.type === "category" && <CategoryDialog item={overlay.item} categories={categories} close={() => setOverlay(null)} onSaved={() => { setOverlay(null); setFeedback("分类已更新。"); reload() }}/>}
    {overlay?.type === "delete" && <DeleteDialog item={overlay.item} close={() => setOverlay(null)} onDeleted={() => { setOverlay(null); setFeedback("套路已删除。"); reload() }}/>}
  </>
}
