"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { loadPreferences, writePreferences } from "../lib/table-tennis/preferences.mjs"

function storage() {
  try { return window.localStorage } catch { return null }
}
export function usePreferences(editing) {
  const [snapshot, setSnapshot] = useState(null), [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0), writing = useRef(false)
  const refresh = useCallback(async () => {
    if (writing.current) return
    const token = ++sequence.current
    try {
      const current = await loadPreferences(fetch, storage())
      if (token === sequence.current) { setSnapshot(current); setError("") }
    } catch (e) {
      if (token === sequence.current) setError(e.message)
    }
  }, [])
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
      const current = await writePreferences(fetch, storage(), base, groups)
      setSnapshot(current); setError("")
      return true
    } catch (e) {
      if (e.current) setSnapshot(e.current)
      if (e.status === 401) setSnapshot(null)
      setError(e.message)
      return false
    } finally { writing.current = false; setBusy(false) }
  }
  return { snapshot, error, busy, refresh, save }
}
