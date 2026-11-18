"use client"
import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { shotActor, shotName, zoneName } from "../lib/table-tennis/catalog.mjs"
import { NumberBadge } from "./court"

export function RouteSummary({ mode, hands, steps }) {
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


export function Modal({ title, children, close, wide = false, busy }) {
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

