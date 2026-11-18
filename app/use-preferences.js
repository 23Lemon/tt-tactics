"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { loadPreferences, writePreferences } from "../lib/table-tennis/preferences.mjs"

function storage() {
  try { return window.localStorage } catch { return null }
}
const deviceOnly = async () => new Response(null, { status: 401 })

export function usePreferences(editing, localOnly = false) {
  const send = localOnly ? deviceOnly : fetch
  const [snapshot, setSnapshot] = useState(null), [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0), writing = useRef(false)
  const refresh = useCallback(async () => {
    if (writing.current) return
    const token = ++sequence.current
    try {
      const current = await loadPreferences(send, storage())
      if (token === sequence.current) { setSnapshot(current); setError("") }
    } catch (e) {
      if (token === sequence.current) setError(e.message)
    }
  }, [send])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const visible = () => { if (!editing && document.visibilityState === "visible") void refresh() }
    document.addEventListener("visibilitychange", visible)
    return () => document.removeEventListener("visibilitychange", visible)
  }, [editing, refresh])
  async function save(base, groups) {
    if (!base || writing.current) return false
    ++sequence.current
    writing.current = true
    setBusy(true)
    try {
      const current = await writePreferences(send, storage(), base, groups)
      setSnapshot(current); setError("")
      return true
    } catch (e) {
      if (e.current) setSnapshot(e.current)
      if (e.status === 401) setSnapshot(null)
      setError(localOnly ? "当前浏览器无法保存设置。" : e.message)
      return false
    } finally { writing.current = false; setBusy(false) }
  }
  return { snapshot, error, busy, refresh, save }
}
