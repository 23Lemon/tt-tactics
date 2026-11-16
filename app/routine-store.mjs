import { validateSteps } from "../lib/table-tennis/catalog.mjs"

const storeName = "routines"

function openDatabase() {
  const path = new URL("./", window.location.href).pathname
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`tt-tactics:${path}`, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error("无法打开浏览器的套路库。"))
  })
}

export async function routineStore(method = "GET", body) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, method === "GET" ? "readonly" : "readwrite")
    const store = transaction.objectStore(storeName)
    let result
    let failure

    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onabort = () => {
      database.close()
      reject(failure ?? new Error("无法更新浏览器的套路库，请重试。"))
    }

    if (method === "GET") {
      const request = store.getAll()
      request.onsuccess = () => {
        result = { items: request.result.sort((a, b) => b.updatedAt - a.updatedAt) }
      }
      return
    }

    const request = store.get(body.id)
    request.onsuccess = () => {
      const existing = request.result
      if (method === "POST" && existing) {
        result = { item: existing }
        return
      }
      if (method !== "POST" && (!existing || existing.revision !== body.revision)) {
        failure = new Error("这条套路已在另一处更新，请从套路库重新打开。")
        transaction.abort()
        return
      }
      if (method === "DELETE") {
        store.delete(body.id)
        result = { id: body.id }
        return
      }

      const steps = validateSteps(body.mode, body.steps)
      if (!steps) {
        failure = new Error("请选完这条套路的线路。")
        transaction.abort()
        return
      }
      const { id, mode, myHand, hand, status } = body
      const item = {
        id, mode, myHand, hand, status, steps, title: body.title.trim(), note: body.note.trim(),
        revision: (existing?.revision ?? 0) + 1, updatedAt: Date.now(),
      }
      store.put(item)
      result = { item }
    }
  })
}
