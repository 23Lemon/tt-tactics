import { validateSteps } from "./catalog.mjs"

export const format = "tt-tactics/routine"
export const importLimit = 32_768
const libraryFormat = "tt-tactics/routine-library"

function routineFields(value) {
  if (!value || !["serve", "receive"].includes(value.mode) || !["using", "practice"].includes(value.status) ||
      !["left", "right"].includes(value.hand) || !["left", "right"].includes(value.myHand ?? "right") ||
      typeof value.title !== "string" || !value.title.trim() || value.title.length > 60 ||
      typeof (value.note ?? "") !== "string" || (value.note ?? "").length > 1000 ||
      typeof (value.category ?? "") !== "string" || (value.category ?? "").length > 32)
    throw new Error("套路名称、持拍手、分类或笔记无效。")
  const steps = validateSteps(value.mode, value.steps)
  if (!steps) throw new Error("线路不完整，或包含无法识别的技术、旋转或落点。")
  return { title: value.title.trim(), mode: value.mode, myHand: value.myHand ?? "right", hand: value.hand,
    status: value.status, category: (value.category ?? "").trim(), note: (value.note ?? "").trim(), steps }
}

export function exportRoutine(item, includeNote = false) {
  return JSON.stringify({ format, version: 1, routine: routineFields({ ...item, note: includeNote ? item.note : "" }) }, null, 2)
}

export function importRoutine(raw) {
  if (typeof raw !== "string" || raw.length > importLimit) throw new Error("请使用 32 KB 以内的单条套路文件。")
  const data = parseJson(raw)
  if (data?.format !== format || data.version !== 1) throw new Error("无法识别这份套路文件的格式或版本。")
  return routineFields(data.routine)
}

function parseJson(raw) {
  let data
  try { data = JSON.parse(raw.replace(/^\uFEFF/, "")) } catch { throw new Error("JSON 格式有误，请复制完整内容或选择文件。") }
  return data
}

export function exportRoutineLibrary(items) {
  return JSON.stringify({ format: libraryFormat, version: 1, routines: items.map(routineFields) }, null, 2)
}

export function importRoutineLibrary(raw) {
  const data = parseJson(raw)
  if (data?.format !== libraryFormat || data.version !== 1 || !Array.isArray(data.routines))
    throw new Error("请选择通过「导出全部」下载的套路库文件。")
  return data.routines.map((item, index) => {
    try { return routineFields(item) }
    catch (error) { throw new Error(`第 ${index + 1} 条套路无法导入。${error.message}`) }
  })
}
