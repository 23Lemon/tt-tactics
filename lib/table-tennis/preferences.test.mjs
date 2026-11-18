import test from "node:test"
import assert from "node:assert/strict"
import { loadPreferences, writePreferences } from "./preferences.mjs"
import { validReceiveGroups } from "./repertoire.mjs"

const key = "tt-receive-preferences"
function device(initial) {
  const values = new Map(initial === undefined ? [] : [[key, JSON.stringify(initial)]])
  return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }
}
function session(account, records) {
  return async (_url, options) => {
    if (!account) return Response.json({}, { status:401 })
    const current = records.get(account) ?? {account, groups:[], revision:0}
    if (options.method !== "PUT") return Response.json(current)
    const edit = JSON.parse(options.body)
    if (edit.revision !== current.revision || edit.account !== account)
      return Response.json({current}, {status:409})
    const next = {account, groups:edit.groups, revision:current.revision + 1}
    records.set(account,next)
    return Response.json(next)
  }
}

test("old browser preferences migrate once and a saved all-selection wins over a different device", async () => {
  const records = new Map(), account = session("a",records), one = device(["push"]), two = device(["banana"])
  const first = await loadPreferences(account, one)
  assert.deepEqual(first.groups,["push"])
  assert.equal(one.getItem(key),null)
  await writePreferences(account,one,first,[])
  assert.deepEqual((await loadPreferences(account,two)).groups,[])
  assert.equal(two.getItem(key),null)
  assert.deepEqual((await loadPreferences(session("b",records),one)).groups,[])
  assert.equal(records.has("b"),false)
})
test("simultaneous first imports converge, stale edits get the winning snapshot, and accounts stay separate", async () => {
  const records = new Map(), account = session("a",records), one = device(["push"]), two = device(["deep"])
  const [a,b] = await Promise.all([loadPreferences(account,one),loadPreferences(account,two)])
  assert.deepEqual(a,b)
  const changed = await writePreferences(account,one,a,["deep","touch"])
  await assert.rejects(writePreferences(account,two,b,["lift"]),e => e.status === 409 && e.current.revision === changed.revision)
  const other = session("b",records)
  await assert.rejects(writePreferences(other,two,changed,["turn"]),e => e.current.account === "b")
  assert.equal(records.has("b"),false)
})
test("anonymous preferences stay local and a failed migration retains the original", async () => {
  const records = new Map(), guest = session(null,records), storage = device()
  const first = await loadPreferences(guest,storage)
  await writePreferences(guest,storage,first,["flip"])
  assert.deepEqual((await loadPreferences(guest,storage)).groups,["flip"])
  const failed = (url,options) => options.method === "PUT" ? Promise.reject(new Error()) : session("a",records)(url,options)
  await assert.rejects(loadPreferences(failed,storage))
  assert.equal(storage.getItem(key),'["flip"]')
  const migrated = await loadPreferences(session("a",records),storage)
  await assert.rejects(writePreferences(guest,storage,migrated,["touch"]))
  assert.equal(storage.getItem(key),null)
})
test("only known and distinct receiving groups can be stored", () => {
  for (const v of [[],["banana","push"]]) assert.ok(validReceiveGroups(v))
  for (const v of ["push",["wrong"],["deep","deep"],null]) assert.equal(validReceiveGroups(v),false)
})
