// Groups describe observed receiving habits. An empty list means all techniques.
export const receiveGroups = [
  ["touch", "摆短", ["fhTouch", "bhTouch"]], ["push", "普通搓", ["fhPushControl", "bhPushControl"]],
  ["deep", "劈长", ["fhPush", "bhPush"]], ["flip", "挑打", ["fhFlip", "bhFlip"]],
  ["banana", "反手拧拉", ["banana"]], ["turn", "反手翻挑", ["bhTurnFlip"]],
  ["lift", "拉下旋／小提拉", ["fhHighUnder", "bhHighUnder", "fhRushUnder", "bhRushUnder", "pivotHigh", "pivotRush", "fhLiftUnder", "bhLiftUnder"]],
  ["loop", "正手拉／反手拉", ["fhLoopTop", "bhLoopTop"]], ["drive", "快带／快拨", ["fhDrive", "bhDrive"]],
  ["block", "挡／减力挡", ["fhBlock", "bhBlock", "fhSoftBlock", "bhSoftBlock", "fhPunchBlock", "bhPunchBlock"]], ["counter", "反拉／反撕", ["fhCounter", "bhCounter"]],
  ["flatPush", "正手推／反手推／推挡", ["fhFlatPush", "bhFlatPush", "bhPenhold"]], ["rip", "反手撕", ["bhRip"]],
  ["sideBrush", "反手侧剌", ["bhSideBrush"]],
  ["punch", "弹击", ["bhPunch", "bhPunchUnder", "fhPipHit", "bhPipHit"]], ["cut", "反手侧切", ["bhSideCut"]],
  ["wipe", "反手抹", ["bhWipe"]],
  ["hit", "正手快攻／突击", ["fhHit", "fhHitUnder"]],
  ["pipKnock", "长胶磕", ["fhKnock", "bhKnock"]],
  ["pipScrape", "长胶刮", ["fhScrape", "bhScrape"]],
  ["pipPush", "长胶拱", ["fhPipPush", "bhPipPush"]],
  ["pipVariation", "长胶侧挤／撇／削球", ["fhSqueeze", "bhSqueeze", "fhSwipe", "bhSwipe", "fhChop", "bhChop"]],
  ["anti", "防弧托接／推拨／推打", ["fhAntiLift", "bhAntiLift", "fhAntiBump", "bhAntiBump", "fhAntiTap", "bhAntiTap", "fhAntiBrush", "bhAntiBrush", "fhAntiHit", "bhAntiHit"]],
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
