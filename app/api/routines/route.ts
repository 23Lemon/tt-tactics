import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { routines } from "../../../db/schema";
import { validateSteps } from "../../../lib/table-tennis/catalog.mjs";

export const dynamic = "force-dynamic";

const { owner: _owner, ...fields } = getTableColumns(routines);
const idFormat = /^[a-f0-9-]{36}$/i;

function respond(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function readRequest(request: Request) {
  // These mutations are invoked by the authenticated, same-origin page.
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return null;
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return null;
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return null;
  const body = await request.text();
  if (body.length > 16_000) return null;
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return respond({ error: "请登录 ChatGPT 后读取套路。" }, 401);
  const items = await getDb().select(fields).from(routines)
    .where(eq(routines.owner, user.userId)).orderBy(desc(routines.updatedAt));
  return respond({ items: items.map(item => ({ ...item, steps: validateSteps(item.mode, item.steps) ?? item.steps })) });
}

async function save(request: Request, update: boolean) {
  const user = await getChatGPTUser();
  if (!user) return respond({ error: "请登录 ChatGPT 后保存套路。" }, 401);
  const data = await readRequest(request);
  if (!data || typeof data.id !== "string" || !idFormat.test(data.id) ||
    (data.mode !== "serve" && data.mode !== "receive") ||
    (data.hand !== "left" && data.hand !== "right") ||
    (data.myHand !== undefined && data.myHand !== "left" && data.myHand !== "right") ||
    (data.status !== "using" && data.status !== "practice") ||
    typeof data.title !== "string" || !data.title.trim() || data.title.trim().length > 60 ||
    typeof data.note !== "string" || data.note.length > 1000) {
    return respond({ error: "请检查套路名称、备注和线路。" }, 400);
  }
  const steps = validateSteps(data.mode, data.steps);
  if (!steps) return respond({ error: "请选完这条套路的线路。" }, 400);
  const values = {
    mode: data.mode,
    hand: data.hand,
    ...(data.myHand !== undefined ? { myHand: data.myHand } : {}),
    status: data.status,
    title: data.title.trim(),
    note: data.note.trim(),
    steps,
    updatedAt: Date.now(),
  };
  const db = getDb();
  if (update) {
    if (!Number.isInteger(data.revision)) return respond({ error: "缺少套路的版本信息。" }, 400);
    const [item] = await db.update(routines)
      .set({ ...values, revision: data.revision + 1 })
      .where(and(eq(routines.id, data.id), eq(routines.owner, user.userId), eq(routines.revision, data.revision)))
      .returning(fields);
    return item ? respond({ item }) : respond({ error: "这条套路已在另一处更新。可以另存一条，或从套路库重新打开。" }, 409);
  }
  const [item] = await db.insert(routines).values({
    ...values, id: data.id, owner: user.userId, revision: 1,
  }).onConflictDoNothing().returning(fields);
  if (item) return respond({ item }, 201);

  const [existing] = await db.select(fields).from(routines)
    .where(and(eq(routines.id, data.id), eq(routines.owner, user.userId)));
  return existing ? respond({ item: existing }) : respond({ error: "保存失败，请重试。" }, 409);
}

export async function POST(request: Request) {
  return save(request, false);
}

export async function PUT(request: Request) {
  return save(request, true);
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return respond({ error: "请登录 ChatGPT 后编辑套路。" }, 401);
  const data = await readRequest(request);
  if (!data || typeof data.id !== "string" || !idFormat.test(data.id) || !Number.isInteger(data.revision)) {
    return respond({ error: "请从套路库重新打开这条套路。" }, 400);
  }
  const [removed] = await getDb().delete(routines)
    .where(and(eq(routines.id, data.id), eq(routines.owner, user.userId), eq(routines.revision, data.revision)))
    .returning({ id: routines.id });
  return removed ? respond({ id: removed.id }) : respond({ error: "这条套路已变更，请刷新套路库。" }, 409);
}
