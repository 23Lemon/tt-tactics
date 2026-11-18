import { validReceiveGroups } from "./repertoire.mjs"

const deviceKey = "tt-receive-preferences"
const temporaryError = "暂时无法同步对手偏好，请重试。"

function deviceGroups(storage) {
  try {
    const groups = JSON.parse(storage?.getItem(deviceKey) ?? "null")
    return validReceiveGroups(groups) ? groups : null
  } catch { return null }
}
function isAccountPreference(data) {
  return typeof data?.account === "string" && !!data.account && validReceiveGroups(data.groups) &&
    Number.isSafeInteger(data.revision) && data.revision >= 0
}
async function request(send, body) {
  let response
  try {
    response = await send("/api/preferences", { cache: "no-store", ...(body ? {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    } : {}) })
  } catch { throw new Error(temporaryError) }
  const data = await response.json().catch(() => null)
  if (response.ok && isAccountPreference(data)) return data
  const error = new Error(data?.error || temporaryError)
  error.status = response.status
  if (response.status === 409 && isAccountPreference(data?.current)) error.current = data.current
  throw error
}
export async function loadPreferences(send, storage) {
  let remote
  try { remote = await request(send) }
  catch (error) {
    if (error.status !== 401) throw error
    return { account: null, groups: deviceGroups(storage) ?? [], revision: 0 }
  }
  const local = deviceGroups(storage)
  if (local === null) return remote
  if (!remote.revision) {
    try { remote = await request(send, { ...remote, groups: local }) }
    catch (error) {
      if (!error.current) throw error
      remote = error.current
    }
  }
  // Only retire the old browser copy after the server has acknowledged an account value.
  if (remote.revision) {
    try { storage.removeItem(deviceKey) } catch {}
  }
  return remote
}

export async function writePreferences(send, storage, base, groups) {
  try { return await request(send, { account: base.account, revision: base.revision, groups }) }
  catch (error) {
    if (error.status !== 401 || base.account !== null) throw error
    try { storage.setItem(deviceKey, JSON.stringify(groups)) }
    catch { throw new Error("当前浏览器无法保存设置。请登录 ChatGPT 后再试。") }
    return { account: null, groups, revision: 0 }
  }
}
