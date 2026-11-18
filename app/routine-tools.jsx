"use client"
import { useId, useRef, useState } from "react"
import { Check, Copy, Download, Share2 } from "lucide-react"
import { exportRoutine, importRoutine, importLimit } from "../lib/table-tennis/sharing.mjs"
import { receiveGroups } from "../lib/table-tennis/repertoire.mjs"
import { Modal, RouteSummary } from "./routine-controls"

export function CategoryField({ value, set, categories }) {
  const id = useId()
  return <label><span>分类</span><input aria-label="分类" list={id} maxLength={32} value={value}
    placeholder="未分类 · 可输入新分类" onChange={e => set(e.target.value)}/>
    <datalist id={id}>{categories.map(name => <option key={name} value={name}/>)}</datalist></label>
}

export function CategoryDialog({ item, categories, close, save, busy, error }) {
  const [category, set] = useState(item.category || "")
  return <Modal title="调整分类" close={close} busy={busy}><form className="modal-form" onSubmit={e => {
    e.preventDefault(); save({ ...item, category: category.trim() }, item)
  }}><p>{item.title}</p><CategoryField value={category} set={set} categories={categories}/>
    {!!categories.length && <div className="spin-picker">{categories.map(c => <button type="button" key={c} onClick={() => set(c)} aria-pressed={category === c}>{c}</button>)}</div>}
    {error && <p role="alert" className="notice error">{error}</p>}
    <div className="modal-actions"><button disabled={busy} className="button primary">保存分类</button></div></form></Modal>
}

function RepertoireForm({ snapshot, busy, save, close }) {
  const [picked, set] = useState(snapshot.groups)
  function toggle(key) { set(old => old.includes(key) ? old.filter(x => x !== key) : [...old, key]) }
  return <div className="modal-form"><p className="muted">勾选球友用来接你发球的技术。留空时显示全部。</p>
    <div className="repertoire-grid">{receiveGroups.map(([key, label]) => <label key={key}><input type="checkbox" checked={picked.includes(key)} disabled={busy} onChange={() => toggle(key)}/>{label}</label>)}</div>
    <p className="sync-note">{snapshot.account ? "随当前 ChatGPT 账号同步。" : <>当前保存在此浏览器。<a href="/signin-with-chatgpt?return_to=/">登录 ChatGPT 同步</a></>}</p>
    <div className="modal-actions"><button type="button" className="button outline" disabled={busy} onClick={() => set([])}>恢复全部</button><button type="button" className="button primary" disabled={busy} onClick={async () => { if (await save(snapshot, picked)) close() }}>{busy ? "保存中…" : "保存偏好"}</button></div></div>
}
export function RepertoireDialog({ preferences, close }) {
  const { snapshot, busy, error, refresh, save } = preferences
  return <Modal title="对手常用接法" close={close} busy={busy}>
    {error && <p className="notice error" role="alert">{error} <button type="button" className="text-button" disabled={busy} onClick={refresh}>重新读取</button></p>}
    {snapshot ? <RepertoireForm key={JSON.stringify([snapshot.account, snapshot.revision])} snapshot={snapshot} busy={busy} save={save} close={close}/> :
      !error && <p role="status" className="muted">正在读取偏好…</p>}
  </Modal>
}

export function ShareDialog({ item, close }) {
  const [includeNote, setNote] = useState(false), [feedback, setFeedback] = useState("")
  const output = useRef(null)
  const json = exportRoutine(item, includeNote)
  const name = item.title.replace(/[^\p{L}\p{N}._-]+/gu, "-") + ".json"
  function file() { return new File([json], name, { type: "application/json" }) }
  async function copy() {
    try { await navigator.clipboard.writeText(json); setFeedback("已复制，可发给球友。") }
    catch { output.current.focus(); output.current.select(); setFeedback("已选中 JSON，可直接复制。") }
  }
  function download() {
    const url = URL.createObjectURL(file()), link = document.createElement("a")
    link.href = url; link.download = name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function share() {
    try {
      const files = [file()]
      if (navigator.canShare?.({ files })) await navigator.share({ files, title: item.title })
      else await navigator.share({ text: json, title: item.title })
    } catch (error) { if (error.name !== "AbortError") setFeedback("可以复制 JSON 或下载文件分享。") }
  }
  return <Modal title="分享套路" close={close}><div className="modal-form"><strong>{item.title}</strong>
    {item.note && <label className="toggle-row"><input type="checkbox" checked={includeNote} onChange={e => setNote(e.target.checked)}/>附上实战笔记</label>}
    <textarea aria-label="套路 JSON" readOnly value={json} ref={output} rows={5} spellCheck={false}/>
    <p className="muted">球友可在「套路库 → 导入套路」粘贴或打开文件。</p>
    <div className="tool-actions"><button className="button primary" onClick={copy}><Copy size={16}/>复制 JSON</button>
      <button className="button outline" onClick={download}><Download size={16}/>下载文件</button>
      {typeof navigator !== "undefined" && navigator.share && <button className="button outline" onClick={share}><Share2 size={15}/>系统分享</button>}</div>
    <span role="status">{feedback}</span></div></Modal>
}

export function ImportDialog({ busy, error, close, save }) {
  const [raw, setRaw] = useState(""), [item, setItem] = useState(null), [problem, setProblem] = useState("")
  const read = useRef(0)
  function preview(text) {
    try { setItem(importRoutine(text)); setProblem("") }
    catch (err) { setItem(null); setProblem(err.message) }
  }
  async function selectFile(file) {
    if (!file) return
    const sequence = ++read.current
    setItem(null); setRaw(""); setProblem("")
    if (file.size > importLimit) { setProblem("文件超过 32 KB。"); return }
    try {
      const text = await file.text()
      if (sequence === read.current) { setRaw(text); preview(text) }
    } catch { if (sequence === read.current) setProblem("文件读取失败，请重新选择。") }
  }
  return <Modal title="导入套路" close={close} busy={busy}><div className="modal-form">
    <label>选择 JSON 文件<input type="file" accept=".json,application/json" disabled={busy} onChange={e => selectFile(e.target.files[0])}/></label>
    <label>或粘贴 JSON<textarea rows={4} spellCheck={false} maxLength={importLimit} disabled={busy} value={raw} onChange={e => {
      read.current++; setRaw(e.target.value); setItem(null); setProblem("")
    }}/></label>
    {item && <><strong>{item.title}</strong><RouteSummary mode={item.mode} hands={item} steps={item.steps}/></>}
    {(problem || error) && <p className="notice error" role="alert">{problem || error}</p>}
    <div className="modal-actions">{item ? <button className="button primary" disabled={busy} onClick={() => save(item)}><Check size={16}/>{busy ? "正在导入…" : "加入我的套路库"}</button>
      : <button className="button primary" disabled={!raw.trim()} onClick={() => preview(raw)}>预览套路</button>}</div></div></Modal>
}
