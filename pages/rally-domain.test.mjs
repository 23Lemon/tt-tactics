import test from 'node:test'
import assert from 'node:assert/strict'
import {
  actorAt, applySteps, buildSteps, canVisit, chooseStroke, createDraft, fromRoutine,
  getAnalysis, getIdeas, getLandingView, getStatus, getSuggestions, goTo, halfToPoint,
  moveLanding, pointToHalf, receiverAt, setHands, setRubber, stepCount, toRoutinePayload, updateServe,
} from './rally-domain.mjs'
import { pointZone, validateSteps } from '../lib/table-tennis/catalog.mjs'
import { COURT, targetPoint } from '../lib/table-tennis/physics.mjs'
import { exportRoutine, importRoutine } from '../lib/table-tennis/sharing.mjs'

const form = { title: '侧下旋衔接', note: '接发后准备下一板', status: 'practice', category: '接发' }
const approx = (a, b, epsilon = .00051) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`)

function opening(mode = 'serve', myHand = 'right', hand = 'right') {
  return updateServe(createDraft(mode, myHand, hand), { family: 'hook', spin: 'sideUnder', zone: 'fh-short' })
}

function finish(draft) {
  for (let i = draft.steps.length; i < stepCount(draft.mode); i++) {
    const options = getSuggestions(draft, i)
    assert.ok(options.length, `第 ${i + 1} 板应有真实可行建议`)
    draft = chooseStroke(draft, i, options[0])
  }
  return draft
}

test('更换胶皮后重新推荐受影响的板次，并随套路保存和回读', () => {
  const inverted = updateServe(createDraft(), { family: 'plain', spin: 'under', zone: 'bh-long', position: -.8 })
  const draft = setRubber(inverted, 'opponent', 'bh', 'longOx')
  const option = getSuggestions(draft, 1).find(choice => choice.tech === 'bhPipPush')
  assert.ok(option)
  assert.ok(!getSuggestions(inverted, 1).some(choice => choice.tech === option.tech))
  const selected = chooseStroke(draft, 1, option)
  assert.ok(getAnalysis(selected)[1].top > 0)
  const payload = toRoutinePayload(finish(selected), form)
  assert.deepEqual(payload.steps[0].rubbers, { opponent: { bh: 'longOx' } })
  const restored = fromRoutine(importRoutine(exportRoutine(payload, true)))
  assert.deepEqual(buildSteps(restored), payload.steps)
  assert.ok(getStatus(restored).complete)
  const changed = setRubber(restored, 'opponent', 'bh', 'inverted')
  assert.equal(changed.steps.length, 1)
  assert.equal(changed.active, 1)
  assert.deepEqual(changed.rubbers, {})
})

test('原推荐完整串联三板和四板，并按模式固定左右身份', () => {
  for (const mode of ['serve', 'receive']) {
    const draft = finish(opening(mode))
    assert.equal(draft.steps.length, mode === 'serve' ? 3 : 4)
    assert.equal(draft.steps[1].tech, 'fhPushControl')
    assert.equal(draft.steps[1].zone, 'bh-long')
    assert.equal(draft.steps[2].tech, 'bhHighUnder')
    assert.equal(getStatus(draft).complete, true)
    assert.ok(getAnalysis(draft).every(result => result.valid))
    assert.deepEqual(draft.steps.map((_, i) => actorAt(draft, i)),
      mode === 'serve' ? ['me', 'opponent', 'me'] : ['opponent', 'me', 'opponent', 'me'])
    assert.notEqual(actorAt(draft, 1), receiverAt(draft, 1))
    assert.ok(validateSteps(mode, draft.steps))
  }
})

test('半台六区在双方和左右持拍手下均映射正确，球网方向不随手别改变', () => {
  const expected = {
    'me:right': [['bh-long', 'bh-short'], ['mid-long', 'mid-short'], ['fh-long', 'fh-short']],
    'me:left': [['fh-long', 'fh-short'], ['mid-long', 'mid-short'], ['bh-long', 'bh-short']],
    'opponent:right': [['fh-short', 'fh-long'], ['mid-short', 'mid-long'], ['bh-short', 'bh-long']],
    'opponent:left': [['bh-short', 'bh-long'], ['mid-short', 'mid-long'], ['fh-short', 'fh-long']],
  }
  for (const receiver of ['me', 'opponent']) {
    for (const hand of ['right', 'left']) {
      const hands = receiver === 'me' ? { myHand: hand, hand: 'right' } : { myHand: 'right', hand }
      for (const [r, v] of [.18, .5, .82].entries()) {
        for (const [c, u] of [.18, .82].entries()) {
          const point = halfToPoint(u, v, receiver, hands)
          assert.equal(pointZone(point), expected[`${receiver}:${hand}`][r][c])
          const back = pointToHalf(point, receiver, hands)
          approx(back.u, u)
          approx(back.v, v)
          const world = targetPoint(pointZone(point), receiver, hands, point)
          // 俯视球台顺时针转为左右对打后，屏幕纵向位置不随持拍手改变。
          approx(world[0], (2 * v - 1) * COURT.halfWidth)
          assert.equal(Math.sign(world[1]), receiver === 'me' ? -1 : 1)
        }
      }
    }
  }
})

test('落点保留连续位置，两个同区点击不会吸附到格子中心', () => {
  const base = opening()
  const a = moveLanding(base, 0, .371, .273)
  const b = moveLanding(base, 0, .374, .279)
  assert.equal(a.setup.zone, b.setup.zone)
  assert.notDeepEqual(a.setup.point, b.setup.point)
  assert.notDeepEqual(a.setup.point, { lateral: .5, depth: .25 })
  const view = getLandingView(a, 0)
  approx(view.u, .371)
  approx(view.v, .273)
  assert.equal(view.precise, true)
  assert.deepEqual(base.setup, opening().setup)
  assert.equal(base.setup.point, undefined)
})

test('无自定义坐标时半台圆点使用原引擎 targetPoint，而非演示网格中心', () => {
  const draft = opening()
  const view = getLandingView(draft, 0)
  assert.equal(view.receiver, 'opponent')
  assert.equal(view.precise, false)
  approx(view.u, .345 / COURT.halfLength)
  assert.notEqual(view.u, .25)
  assert.deepEqual(view.depths, ['short', 'long'])
  assert.deepEqual(view.lanes, ['fh', 'mid', 'bh'])
  const leftHand = getLandingView(setHands(draft, { hand: 'left' }), 0)
  assert.deepEqual(leftHand.lanes, ['bh', 'mid', 'fh'])
  approx(view.v + leftHand.v, 1)
})

test('修改早期落点、发球参数或持拍手会截断后续板，原草稿不被修改', () => {
  const original = finish(opening())
  const before = JSON.stringify(original)
  const view = getLandingView(original, 1)
  const moved = moveLanding(original, 1, view.u + .004, view.v + .002)
  assert.equal(moved.steps.length, 2)
  assert.equal(moved.active, 1)
  assert.equal(getStatus(moved).complete, false)
  assert.equal(JSON.stringify(original), before)
  const stronger = updateServe(original, { strength: 'heavy' })
  assert.equal(stronger.steps.length, 1)
  assert.equal(stronger.active, 0)
  const left = setHands(original, { myHand: 'left' })
  assert.equal(left.steps.length, 1)
  assert.equal(left.active, 0)
  assert.equal(updateServe(original, { strength: original.setup.strength }), original)
  assert.equal(setHands(original, { myHand: original.myHand }), original)
  assert.equal(goTo(createDraft(), 2).active, 0)
  assert.equal(canVisit(createDraft(), 1), false)
})

test('连续点选后的套路可用原 JSON 格式往返，打开时各板折叠', () => {
  for (const mode of ['serve', 'receive']) {
    let draft = opening(mode)
    const start = getLandingView(draft, 0)
    draft = moveLanding(draft, 0, start.u + .001, start.v + .001)
    draft = finish(draft)
    const payload = toRoutinePayload(draft, { ...form, title: ` ${form.title} ` })
    assert.equal(payload.title, form.title)
    assert.ok(payload.steps[0].point)
    const parsed = importRoutine(exportRoutine(payload, true))
    assert.deepEqual(parsed, payload)
    const record = { ...parsed, id: 'fixture-routine', revision: 2, updatedAt: 1 }
    const reopened = fromRoutine(record)
    assert.equal(reopened.saved, record)
    assert.equal(reopened.active, -1)
    assert.equal(getStatus(reopened).complete, true)
    assert.equal(getAnalysis(reopened).length, stepCount(mode))
    for (let index = 0; index < stepCount(mode); index++) {
      const edited = goTo(reopened, index)
      assert.equal(edited.active, index)
      assert.deepEqual(buildSteps(edited), payload.steps)
    }
    assert.equal(applySteps(createDraft(mode), payload.steps).active, 0)
  }
})

test('结构合法但接法不适用的导入套路不能继续或保存，并指明首个问题板', () => {
  const payload = toRoutinePayload(finish(opening()), form)
  payload.steps[1].tech = 'fhBlock'
  assert.ok(validateSteps('serve', payload.steps))
  const invalid = fromRoutine(payload)
  assert.equal(invalid.active, -1)
  const status = getStatus(invalid)
  assert.equal(status.complete, false)
  assert.equal(status.ready, false)
  assert.equal(status.invalidIndex, 1)
  assert.equal(goTo(invalid, status.invalidIndex).active, 1)
  assert.ok(status.error)
  assert.throws(() => toRoutinePayload(invalid, form), /有效/)
  assert.throws(() => chooseStroke(opening(), 1, 'fhBlock'), /台内|下旋/)
})

test('原 findIdeas 可直接应用为本草稿，且物理分析不会被示例规则替代', () => {
  const draft = opening()
  const ideas = getIdeas(draft)
  const idea = ideas.branches[0] ?? ideas.openers[0]
  assert.ok(idea)
  const next = applySteps(draft, idea.steps)
  assert.equal(getStatus(next).complete, true)
  assert.equal(next.saved, null)
  assert.equal(next.active, 0)
})

test('同一板重复连续点选只替换最终 point，不积累点击历史或物理轨迹', () => {
  const oneClick = moveLanding(opening(), 0, .26, .27)
  let repeated = opening()
  for (let i = 0; i < 250; i++) {
    repeated = moveLanding(repeated, 0, .259 + i % 5 * .0002, .269 + i % 7 * .0001)
  }
  repeated = moveLanding(repeated, 0, .26, .27)
  assert.deepEqual(repeated, oneClick)
  assert.deepEqual(repeated.steps[0].point, { lateral: .46, depth: .26 })
  const beforeAnalysis = JSON.stringify(repeated)
  assert.ok(getAnalysis(repeated)[0].valid)
  assert.equal(JSON.stringify(repeated), beforeAnalysis)
  const payload = toRoutinePayload(finish(repeated), form)
  assert.deepEqual(payload.steps[0].point, { lateral: .46, depth: .26 })
  assert.equal(JSON.stringify(payload).includes('history'), false)
  assert.equal(JSON.stringify(payload).includes('results'), false)
  assert.equal(JSON.stringify(payload).includes('"points"'), false)
})

test('原 JSON 分享只含原schema，完整连续点线路及合法字段极值体量有界', t => {
  function preciseFixture(mode) {
    let draft = opening(mode)
    for (let i = 0; i < stepCount(mode); i++) {
      if (i) draft = chooseStroke(draft, i, getSuggestions(draft, i)[0])
      const point = getLandingView(draft, i)
      draft = moveLanding(draft, i, point.u, point.v)
    }
    assert.equal(getStatus(draft).complete, true)
    return draft
  }
  function fields(draft, character) {
    const labeled = { ...draft, steps: draft.steps.map((shot, i) => i ? { ...shot, label: character.repeat(28) } : shot) }
    return toRoutinePayload(labeled, {
      title: character.repeat(60), category: character.repeat(32), note: character.repeat(1000), status: 'practice',
    })
  }
  function verifySchema(payload) {
    assert.deepEqual(Object.keys(payload).sort(), ['category', 'hand', 'mode', 'myHand', 'note', 'status', 'steps', 'title'])
    payload.steps.forEach((shot, i) => {
      const keys = i ? ['point', 'tech', 'zone'] : ['distance', 'family', 'pace', 'point', 'position', 'spin', 'strength', 'zone']
      if (i && shot.label !== undefined) keys.push('label')
      assert.deepEqual(Object.keys(shot).sort(), keys.sort())
      assert.deepEqual(Object.keys(shot.point).sort(), ['depth', 'lateral'])
    })
  }
  for (const mode of ['serve', 'receive']) {
    const draft = preciseFixture(mode)
    const ordinary = toRoutinePayload(draft, form)
    verifySchema(ordinary)
    const ordinaryJSON = exportRoutine(ordinary, true)
    const envelope = JSON.parse(ordinaryJSON)
    assert.deepEqual(Object.keys(envelope).sort(), ['format', 'routine', 'version'])
    const ordinaryBytes = Buffer.byteLength(ordinaryJSON, 'utf8')
    assert.ok(ordinaryBytes < 2 * 1024, `普通${stepCount(mode)}板分享为 ${ordinaryBytes} B`)
    const byteCounts = {}
    // NUL is legal under the original string validator and JSON encodes it as
    // six ASCII bytes (\u0000), exceeding ordinary Chinese's three UTF-8 bytes.
    for (const [name, character] of [['中文满长度', '字'], ['转义字符满长度', '\u0000']]) {
      const payload = fields(draft, character)
      verifySchema(payload)
      const json = exportRoutine(payload, true)
      const imported = importRoutine(json)
      // JSON canonicalizes -0 to 0; the physical coordinate is unchanged.
      assert.deepEqual(imported, JSON.parse(JSON.stringify(payload)))
      assert.equal(imported.note.length, 1000)
      assert.ok(imported.steps.slice(1).every(shot => shot.label.length === 28))
      const bytes = Buffer.byteLength(json, 'utf8')
      assert.ok(bytes < 8 * 1024, `${name}${stepCount(mode)}板分享为 ${bytes} B`)
      byteCounts[name] = bytes
    }
    t.diagnostic(`${stepCount(mode)}板 UTF-8：普通 ${ordinaryBytes} B；中文满长度 ${byteCounts['中文满长度']} B；转义字符满长度 ${byteCounts['转义字符满长度']} B`)
  }
})
