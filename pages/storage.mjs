import { routineStore } from "./routine-store.mjs"
import { exportRoutine, importRoutine, importRoutineLibrary } from "../lib/table-tennis/sharing.mjs"

const changeEvent = "tt-tactics:routines-changed"
const channelName = "tt-tactics:routines"

function failure(error) {
  if (error?.name === "QuotaExceededError") return new Error("浏览器存储空间不足，请先导出备份或清理空间。")
  if (error?.name === "SecurityError" || error?.name === "InvalidStateError") return new Error("当前浏览器无法保存数据，请检查隐私模式或存储权限。")
  return error instanceof Error ? error : new Error("套路库暂时不可用，请重试。")
}

function checkStorage() {
  if (typeof indexedDB === "undefined") throw new Error("当前浏览器不支持套路保存，请换用支持 IndexedDB 的浏览器。")
}

export function createRoutineId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function notify() {
  window.dispatchEvent(new Event(changeEvent))
  if (typeof BroadcastChannel === "function") {
    try {
      const channel = new BroadcastChannel(channelName)
      channel.postMessage("changed")
      channel.close()
    } catch { /* Cross-tab notification must not turn a successful save into an error. */ }
  }
}

export async function listRoutines() {
  try {
    checkStorage()
    const response = await routineStore()
    if (!Array.isArray(response.items)) throw new Error("套路库返回的数据不完整，请重新读取。")
    return response.items
  } catch (error) { throw failure(error) }
}

export async function saveRoutine(value, { asNew = false } = {}) {
  try {
    checkStorage()
    // Round-trip through the original sharing validator so saved and imported
    // records use the same contract, including continuous landing coordinates.
    const fields = importRoutine(exportRoutine({ ...value, note: value.note ?? "", status: value.status ?? "practice" }, true))
    const update = Boolean(value.id) && !asNew
    if (update && (!Number.isInteger(value.revision) || value.revision < 1)) throw new Error("请从套路库重新打开这条套路，再保存修改。")
    const body = { ...fields, id: update ? value.id : createRoutineId(), ...(update ? { revision: value.revision } : {}) }
    const response = await routineStore(update ? "PUT" : "POST", body)
    if (!response.item) throw new Error("未收到保存结果，请重新读取套路库确认。")
    notify()
    return response.item
  } catch (error) { throw failure(error) }
}

export async function restoreRoutineLibrary(raw) {
  const items = importRoutineLibrary(raw)
  if (!items.length) return 0
  try {
    checkStorage()
    const now = Date.now()
    const records = items.map((item, index) => ({
      ...item, id: createRoutineId(), revision: 1, updatedAt: now - index,
    }))
    await routineStore("IMPORT", records)
    notify()
    return records.length
  } catch (error) { throw failure(error) }
}

export async function deleteRoutine(item) {
  try {
    checkStorage()
    await routineStore("DELETE", { id: item.id, revision: item.revision })
    notify()
  } catch (error) { throw failure(error) }
}

export function subscribeRoutines(listener) {
  let channel = null
  try { if (typeof BroadcastChannel === "function") channel = new BroadcastChannel(channelName) } catch { /* Focus refresh remains available. */ }
  window.addEventListener(changeEvent, listener)
  window.addEventListener("focus", listener)
  channel?.addEventListener("message", listener)
  return () => {
    window.removeEventListener(changeEvent, listener)
    window.removeEventListener("focus", listener)
    channel?.close()
  }
}
