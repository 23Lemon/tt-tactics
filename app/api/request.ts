export function respond(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function readRequest(request: Request) {
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
