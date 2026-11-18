import {
  DEFAULT_POSITION, PACES, SERVES, SERVE_DISTANCE, STRENGTHS, STROKES,
  forehand, other, playerHand, pointZone, shotActor, snapPoint, validateSteps, zoneInfo,
} from '../lib/table-tennis/catalog.mjs'
import { COURT, analyze, targetPoint } from '../lib/table-tennis/physics.mjs'
import { assessStroke, findIdeas, optionsFor } from '../lib/table-tennis/tactics.mjs'

export const TRACKS = {
  serve: ['我的发球', '对手接发', '我的第三板'],
  receive: ['对手发球', '我的接发', '对手第三板', '我的第四板'],
}

const analyses = new WeakMap()
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const clamp = value => Math.max(0, Math.min(1, value))
const handsAreValid = hand => hand === 'right' || hand === 'left'
const setupFields = new Set(['family', 'spin', 'zone', 'strength', 'pace', 'position', 'distance', 'point'])
const clonePoint = point => point ? { lateral: point.lateral, depth: point.depth } : undefined

export function stepCount(mode) {
  return mode === 'receive' ? 4 : 3
}

export function createDraft(mode = 'serve', myHand = 'right', hand = 'right') {
  if (!TRACKS[mode]) throw new TypeError('无法识别分析模式。')
  if (!handsAreValid(myHand) || !handsAreValid(hand)) throw new TypeError('持拍手设置无效。')
  return {
    mode, myHand, hand, active: 0, saved: null,
    setup: {
      family: '', spin: '', zone: '', strength: 'medium', pace: 'normal',
      position: DEFAULT_POSITION, distance: SERVE_DISTANCE.default,
    },
    steps: [],
  }
}

export function actorAt(draft, index) {
  return shotActor(draft.mode, index)
}

export function receiverAt(draft, index) {
  return other(actorAt(draft, index))
}

export function titleAt(draft, index) {
  return TRACKS[draft.mode]?.[index] ?? ''
}

function serveIsReady(serve) {
  return Boolean(SERVES[serve.family]?.spins.includes(serve.spin) && zoneInfo(serve.zone))
}

function samePoint(a, b) {
  return a?.lateral === b?.lateral && a?.depth === b?.depth
}

function sameShot(a, b) {
  if (!a || !b) return a === b
  return ['family', 'spin', 'zone', 'strength', 'pace', 'position', 'distance', 'tech', 'label']
    .every(field => a[field] === b[field]) && samePoint(a.point, b.point)
}

export function updateServe(draft, changes) {
  const patch = Object.fromEntries(Object.entries(changes).filter(([key]) => setupFields.has(key)))
  const setup = { ...draft.setup, ...patch }
  if (own(patch, 'family') && !SERVES[setup.family]?.spins.includes(setup.spin)) setup.spin = ''
  if (own(patch, 'zone') && !own(patch, 'point')) delete setup.point
  if (setup.point === undefined) delete setup.point
  if (setup.point) {
    setup.point = snapPoint(setup.point.lateral, setup.point.depth)
    setup.zone = pointZone(setup.point)
  }
  if (sameShot(draft.setup, setup)) return draft
  return { ...draft, setup, active: 0, steps: serveIsReady(setup) ? [{ ...setup, ...(setup.point ? { point: clonePoint(setup.point) } : {}) }] : [] }
}

export function setHands(draft, changes) {
  const patch = {}
  for (const field of ['myHand', 'hand']) {
    if (own(changes, field)) {
      if (!handsAreValid(changes[field])) throw new TypeError('持拍手设置无效。')
      patch[field] = changes[field]
    }
  }
  if (Object.entries(patch).every(([key, value]) => draft[key] === value)) return draft
  return { ...draft, ...patch, active: 0, steps: draft.steps.slice(0, 1) }
}

export function getAnalysis(draft, adjustment = 'read') {
  let cache = analyses.get(draft)
  if (!cache) {
    cache = new Map()
    analyses.set(draft, cache)
  }
  if (!cache.has(adjustment)) {
    const focus = Math.max(0, Math.min(draft.active, draft.steps.length - 1))
    cache.set(adjustment, analyze(draft.mode, draft, draft.steps, adjustment, focus))
  }
  return cache.get(adjustment)
}

export function getSuggestions(draft, index = draft.active, preferences = [], results = getAnalysis(draft)) {
  if (index <= 0 || index >= stepCount(draft.mode)) return []
  return optionsFor(results[index - 1], draft, preferences)
}

export function assessChoice(draft, index, tech, results = getAnalysis(draft)) {
  return assessStroke(results[index - 1], tech)
}

export function chooseStroke(draft, index, techOrOption, zone) {
  if (!Number.isInteger(index) || index < 1 || index >= stepCount(draft.mode)) return draft
  if (!canVisit(draft, index)) return draft
  const value = typeof techOrOption === 'string' ? { tech: techOrOption } : techOrOption
  if (!value || !STROKES[value.tech]) throw new TypeError('请选择有效的接法。')
  const assessment = assessChoice(draft, index, value.tech)
  if (!assessment.allowed) throw new TypeError(assessment.reason)
  const suggested = getSuggestions(draft, index).find(option => option.tech === value.tech)
  const target = zone ?? value.zone ?? suggested?.zone ?? (STROKES[value.tech].kind === 'short' ? 'mid-short' : 'mid-long')
  if (!zoneInfo(target)) throw new TypeError('请选择有效落点。')
  const shot = { tech: value.tech, zone: target }
  if (value.label?.trim()) shot.label = value.label.trim().slice(0, 28)
  if (value.point) {
    shot.point = snapPoint(value.point.lateral, value.point.depth)
    shot.zone = pointZone(shot.point)
  }
  if (sameShot(draft.steps[index], shot)) return draft.active === index ? draft : { ...draft, active: index }
  return { ...draft, active: index, steps: [...draft.steps.slice(0, index), shot] }
}

/** Screen half-table: u increases right, v increases down; net is right for me. */
export function halfToPoint(u, v, receiver, hands) {
  if (!Number.isFinite(u) || !Number.isFinite(v) || !['me', 'opponent'].includes(receiver)) {
    throw new TypeError('落点坐标无效。')
  }
  return snapPoint((clamp(v) * 2 - 1) * forehand(receiver, hands), receiver === 'me' ? 1 - clamp(u) : clamp(u))
}

export function pointToHalf(point, receiver, hands) {
  if (!point || !Number.isFinite(point.lateral) || !Number.isFinite(point.depth)) return null
  return {
    u: clamp(receiver === 'me' ? 1 - point.depth : point.depth),
    v: clamp((point.lateral * forehand(receiver, hands) + 1) / 2),
  }
}

export function moveLanding(draft, index, u, v) {
  if (!Number.isInteger(index) || index < 0 || index >= stepCount(draft.mode)) return draft
  const point = halfToPoint(u, v, receiverAt(draft, index), draft)
  const zone = pointZone(point)
  if (index === 0) return updateServe(draft, { zone, point })
  const previous = draft.steps[index]
  if (!previous) return draft
  if (previous.zone === zone && samePoint(previous.point, point)) return draft.active === index ? draft : { ...draft, active: index }
  return { ...draft, active: index, steps: [...draft.steps.slice(0, index), { ...previous, zone, point }] }
}

export function getLandingView(draft, index) {
  const receiver = receiverAt(draft, index)
  const record = index === 0 ? draft.setup : draft.steps[index]
  const zone = record?.zone || null
  const hand = playerHand(receiver, draft)
  const lanes = forehand(receiver, draft) > 0 ? ['bh', 'mid', 'fh'] : ['fh', 'mid', 'bh']
  const depths = receiver === 'me' ? ['long', 'short'] : ['short', 'long']
  let point = record?.point ? clonePoint(record.point) : null
  if (!point && zoneInfo(zone)) {
    const world = targetPoint(zone, receiver, draft)
    point = { lateral: world[0] / (forehand(receiver, draft) * COURT.halfWidth), depth: Math.abs(world[1]) / COURT.halfLength }
  }
  const half = pointToHalf(point, receiver, draft)
  return { receiver, hand, zone, point, u: half?.u ?? null, v: half?.v ?? null, lanes, depths, precise: Boolean(record?.point) }
}

export function canVisit(draft, index, results = getAnalysis(draft)) {
  if (!Number.isInteger(index) || index < 0 || index >= stepCount(draft.mode)) return false
  for (let i = 0; i < index; i++) {
    if (!draft.steps[i] || !results[i]?.valid || (i > 0 && !assessStroke(results[i - 1], draft.steps[i].tech).allowed)) return false
  }
  return true
}

export function goTo(draft, index) {
  return canVisit(draft, index) && draft.active !== index ? { ...draft, active: index } : draft
}

export function getStatus(draft, results = getAnalysis(draft)) {
  const assessment = draft.active > 0 && draft.steps[draft.active]
    ? assessStroke(results[draft.active - 1], draft.steps[draft.active].tech) : null
  let invalidIndex = -1
  let error = ''
  for (let i = 0; i < draft.steps.length; i++) {
    const checked = i > 0 ? assessStroke(results[i - 1], draft.steps[i].tech) : null
    if (!results[i]?.valid || checked && !checked.allowed) {
      invalidIndex = i
      error = checked && !checked.allowed ? checked.reason : results[i]?.issue || '当前线路预计下网或出界，请调整落点或接法。'
      break
    }
  }
  const ready = Boolean(canVisit(draft, draft.active, results) && draft.steps[draft.active] &&
    results[draft.active]?.valid && (!assessment || assessment.allowed))
  const complete = draft.steps.length === stepCount(draft.mode) && invalidIndex === -1
  return { ready, complete, results, assessment, error, invalidIndex }
}

export function buildSteps(draft) {
  return draft.steps.map(step => ({ ...step, ...(step.point ? { point: clonePoint(step.point) } : {}) }))
}

export function toRoutinePayload(draft, form) {
  if (!getStatus(draft).complete) throw new TypeError('请先选完有效的整条线路。')
  const steps = validateSteps(draft.mode, buildSteps(draft))
  if (!steps) throw new TypeError('线路包含无效的技术、旋转或落点。')
  const title = String(form.title ?? '').trim()
  const note = String(form.note ?? '').trim()
  const category = String(form.category ?? '').trim()
  if (!title || title.length > 60 || note.length > 1000 || category.length > 32 || !['practice', 'using'].includes(form.status)) {
    throw new TypeError('请检查套路名称、分类、状态和笔记。')
  }
  return { mode: draft.mode, myHand: draft.myHand, hand: draft.hand, steps, title, note, category, status: form.status }
}

export function fromRoutine(item) {
  if (!TRACKS[item?.mode]) throw new TypeError('无法识别这条套路的模式。')
  const steps = validateSteps(item.mode, item.steps)
  if (!steps) throw new TypeError('这条套路的线路不完整或格式无效。')
  return {
    ...createDraft(item.mode, item.myHand ?? 'right', item.hand),
    setup: steps[0], steps, active: steps.length - 1, saved: item,
  }
}

export function applySteps(draft, rawSteps) {
  const steps = validateSteps(draft.mode, rawSteps)
  if (!steps) throw new TypeError('无法应用这条线路。')
  return { ...draft, setup: steps[0], steps, active: 0, saved: null }
}

export function getIdeas(draft, records = [], preferences = []) {
  return findIdeas(draft.mode, draft, draft.steps[0], records, preferences)
}

// Re-export the stable catalog and descriptions so the UI uses upstream identifiers.
export { PACES, SERVES, STRENGTHS, STROKES }
