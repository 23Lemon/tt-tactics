// Groups describe observed receiving habits. An empty list means all techniques.
export const receiveGroups = [
  ["touch", "摆短", ["fhTouch", "bhTouch"]], ["push", "普通搓", ["fhPushControl", "bhPushControl"]],
  ["deep", "劈长", ["fhPush", "bhPush"]], ["flip", "挑打", ["fhFlip", "bhFlip"]],
  ["banana", "反手拧拉", ["banana"]], ["turn", "反手翻挑", ["bhTurnFlip"]],
  ["lift", "拉下旋", ["fhHighUnder", "bhHighUnder", "fhRushUnder", "bhRushUnder", "pivotHigh", "pivotRush"]],
  ["loop", "正手拉／反手拉", ["fhLoopTop", "bhLoopTop"]], ["drive", "快带／快拨", ["fhDrive", "bhDrive"]],
  ["block", "防", ["fhBlock", "bhBlock"]], ["counter", "反拉／反撕", ["fhCounter", "bhCounter"]],
  ["flatPush", "正手推／反手推", ["fhFlatPush", "bhFlatPush"]], ["rip", "反手撕", ["bhRip"]],
  ["sideBrush", "反手侧剌", ["bhSideBrush"]],
  ["punch", "反手弹击", ["bhPunch"]], ["cut", "反手侧切", ["bhSideCut"]],
]
export function validReceiveGroups(value) {
  if (!Array.isArray(value) || value.length > receiveGroups.length) return false
  const known = new Set(receiveGroups.map(([key]) => key))
  return value.every(key => known.delete(key))
}
export function receiveSelection(preferences) {
  const groups = receiveGroups.filter(([key]) => preferences?.includes(key))
  return groups.length ? new Set(groups.flatMap(([, , strokes]) => strokes)) : null
}
