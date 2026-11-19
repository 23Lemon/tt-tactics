export const RUBBERS = {
  inverted: { name: "反胶" },
  short: { name: "正胶" },
  raw: { name: "生胶" },
  longOx: { name: "长胶（单胶皮）", shortName: "长胶单胶皮" },
  longSponge: { name: "长胶（带海绵）", shortName: "长胶带海绵" },
  softAnti: { name: "软防弧", description: "回球的速度和旋转可以通过手法调整。轻挡可降低回球速度，推拨可加快节奏，轻提可增加一定的旋转。" },
  hardAnti: { name: "硬防弧", description: "回球的旋转特征接近长胶。挡强上旋时，回球通常带有较明显的下旋。接近不转的来球时，回球的旋转通常较弱。" },
}

export const LONG_RUBBERS = ["longOx", "longSponge"]
export const ANTI_RUBBERS = ["softAnti", "hardAnti"]
export const SHORT_RUBBERS = ["short", "raw"]

const players = ["me", "opponent"]
const sides = ["fh", "bh"]

export const serveFace = ({ family }) => family === "backhand" ? "bh" : "fh"

export function normalizeRubbers(value) {
  if (value === undefined) return {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const result = {}
  for (const [actor, faces] of Object.entries(value)) {
    if (!players.includes(actor) || !faces || typeof faces !== "object" || Array.isArray(faces)) return null
    for (const [side, id] of Object.entries(faces)) {
      if (!sides.includes(side) || !Object.hasOwn(RUBBERS, id)) return null
      if (id !== "inverted") (result[actor] ??= {})[side] = id
    }
  }
  return result
}

export function rubberFor(hands, actor, face) {
  return (hands?.rubbers ?? hands?.steps?.[0]?.rubbers)?.[actor]?.[face] ?? "inverted"
}

// Effective contact settings for the representative presets, not measurements of individual rubbers.
// Spin retention sets the stroke's target. Friction limits the actual tangential impulse.
export const RUBBER_CONTACT = {
  inverted: { elasticity: .72, friction: 1.65, tangentFactor: 1.18, brush: 1, carry: 0, pace: 1, serveSpin: 1 },
  short: { elasticity: .76, friction: .95, tangentFactor: 1.12, brush: .77, carry: .07, pace: 1.04, serveSpin: .74 },
  raw: { elasticity: .77, friction: .65, tangentFactor: 1.08, brush: .54, carry: .17, pace: 1.03, serveSpin: .49 },
  longOx: { elasticity: .52, friction: .31, tangentFactor: .97, brush: .42, carry: .73, pace: .88, serveSpin: .26 },
  longSponge: { elasticity: .59, friction: .39, tangentFactor: 1.05, brush: .54, carry: .55, pace: 1, serveSpin: .33 },
  softAnti: { elasticity: .45, friction: .42, tangentFactor: 1.05, brush: .63, carry: .28, pace: .95, serveSpin: .27 },
  hardAnti: { elasticity: .40, friction: .15, tangentFactor: .94, brush: .24, carry: .91, pace: .93, serveSpin: .11 },
}
