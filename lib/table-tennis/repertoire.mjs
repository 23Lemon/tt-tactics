import { STROKES, strokeFitsRubber } from "./catalog.mjs"

// Persisted empty lists from older versions still mean all techniques.
export const noReceiveGroups = "none"
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
const groupIds = receiveGroups.map(([key]) => key)
const noGroups = []

export function availableReceiveGroups(hands) {
  return receiveGroups.flatMap(([key, , strokes]) => {
    const available = strokes.filter(tech => strokeFitsRubber(tech, "opponent", hands))
    if (!available.length) return []
    const names = [...new Set(available.map(tech => STROKES[tech].name.replace(/（(?:高吊|前冲)）$/, "")))]
    const label = names.filter(name => !name.startsWith("反手") || !names.includes("正手" + name.slice(2)))
      .map(name => name.startsWith("正手") && names.includes("反手" + name.slice(2)) ? name.slice(2) : name)
      .join("／")
    return [[key, label]]
  })
}

export function checkedReceiveGroups(preferences) {
  if (!preferences?.length) return groupIds
  return preferences.includes(noReceiveGroups) ? noGroups : preferences
}

export function validReceiveGroups(value) {
  if (!Array.isArray(value) || value.length > receiveGroups.length) return false
  if (value.length === 1 && value[0] === noReceiveGroups) return true
  const known = new Set(groupIds)
  return value.every(key => known.delete(key))
}
export function receiveSelection(preferences) {
  if (preferences?.includes(noReceiveGroups)) return new Set()
  const groups = receiveGroups.filter(([key]) => preferences?.includes(key))
  return groups.length && groups.length !== receiveGroups.length ? new Set(groups.flatMap(([, , strokes]) => strokes)) : null
}
