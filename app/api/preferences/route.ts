import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { playerPreferences } from "../../../db/schema";
import { validReceiveGroups } from "../../../lib/table-tennis/repertoire.mjs";
import { readRequest, respond } from "../request";

export const dynamic = "force-dynamic";
const fields = { groups: playerPreferences.groups, revision: playerPreferences.revision };

async function current(account: string) {
  const [row] = await getDb().select(fields).from(playerPreferences).where(eq(playerPreferences.owner, account));
  return { account, groups: row?.groups ?? [], revision: row?.revision ?? 0 };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return respond({ error: "登录 ChatGPT 后可同步接法偏好。" }, 401);
  return respond(await current(user.userId));
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return respond({ error: "登录状态已改变，请重新打开接法设置。" }, 401);
  const data = await readRequest(request);
  if (!data || !validReceiveGroups(data.groups) || !Number.isSafeInteger(data.revision) || data.revision < 0)
    return respond({ error: "接法选择或版本无效。" }, 400);
  const account = user.userId;
  if (data.account !== account) return respond({ error: "账号已切换，请重新选择。", current: await current(account) }, 409);
  const values = { groups: data.groups, revision: data.revision + 1 };
  const db = getDb();
  const [row] = data.revision === 0
    ? await db.insert(playerPreferences).values({ ...values, owner: account }).onConflictDoNothing().returning(fields)
    : await db.update(playerPreferences).set(values)
        .where(and(eq(playerPreferences.owner, account), eq(playerPreferences.revision, data.revision))).returning(fields);
  if (row) return respond({ account, ...row });
  return respond({ error: "其他设备已更新，已载入最新偏好。请重新勾选后保存。", current: await current(account) }, 409);
}
