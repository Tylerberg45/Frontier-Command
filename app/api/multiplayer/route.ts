const ROOM_TTL_MS = 45 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Room = {
  code: string;
  host_token: string;
  guest_token: string | null;
  offer: string | null;
  answer: string | null;
  fog_enabled: number;
  status: string;
  created_at: number;
  updated_at: number;
};

async function ensureSchema() {
  const database = await getDatabase();
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS multiplayer_rooms (
      code TEXT PRIMARY KEY,
      host_token TEXT NOT NULL,
      guest_token TEXT,
      offer TEXT,
      answer TEXT,
      fog_enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
}

async function getDatabase() {
  // @ts-expect-error Cloudflare provides this built-in module at runtime.
  const runtime = await import("cloudflare:workers");
  if (!runtime.env.DB) throw new Error("Multiplayer database is unavailable.");
  return runtime.env.DB;
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function token() {
  return crypto.randomUUID().replaceAll("-", "");
}

function roomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

function validCode(value: unknown) {
  return typeof value === "string" && /^[A-Z2-9]{6}$/.test(value);
}

async function room(code: string) {
  const database = await getDatabase();
  return database.prepare("SELECT * FROM multiplayer_rooms WHERE code = ?")
    .bind(code)
    .first() as Promise<Room | null>;
}

export async function POST(request: Request) {
  await ensureSchema();
  const database = await getDatabase();
  const now = Date.now();
  await database.prepare("DELETE FROM multiplayer_rooms WHERE updated_at < ?")
    .bind(now - ROOM_TTL_MS)
    .run();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const action = body.action;
  if (action === "create") {
    const hostToken = token();
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = roomCode();
      try {
        await database.prepare(`
          INSERT INTO multiplayer_rooms
            (code, host_token, fog_enabled, status, created_at, updated_at)
          VALUES (?, ?, ?, 'waiting', ?, ?)
        `).bind(code, hostToken, body.fogEnabled === false ? 0 : 1, now, now).run();
        return json({ code, hostToken });
      } catch {
        // Extremely unlikely room-code collision. Generate another code.
      }
    }
    return json({ error: "Could not create a room. Try again." }, 503);
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!validCode(code)) return json({ error: "Enter a valid six-character room code." }, 400);
  const existing = await room(code);
  if (!existing || existing.updated_at < now - ROOM_TTL_MS || existing.status === "closed") {
    return json({ error: "Room not found or expired." }, 404);
  }

  if (action === "offer") {
    if (body.token !== existing.host_token || typeof body.description !== "string")
      return json({ error: "Host authorization failed." }, 403);
    await database.prepare("UPDATE multiplayer_rooms SET offer = ?, updated_at = ? WHERE code = ?")
      .bind(body.description, now, code)
      .run();
    return json({ ok: true });
  }

  if (action === "join") {
    if (!existing.offer) return json({ error: "Host is still preparing the room. Try again in a moment." }, 409);
    if (existing.guest_token && existing.answer)
      return json({ error: "This private room already has two players." }, 409);
    const guestToken = existing.guest_token || token();
    await database.prepare("UPDATE multiplayer_rooms SET guest_token = ?, status = 'joining', updated_at = ? WHERE code = ?")
      .bind(guestToken, now, code)
      .run();
    return json({
      guestToken,
      offer: existing.offer,
      fogEnabled: Boolean(existing.fog_enabled),
    });
  }

  if (action === "answer") {
    if (body.token !== existing.guest_token || typeof body.description !== "string")
      return json({ error: "Guest authorization failed." }, 403);
    await database.prepare("UPDATE multiplayer_rooms SET answer = ?, status = 'connecting', updated_at = ? WHERE code = ?")
      .bind(body.description, now, code)
      .run();
    return json({ ok: true });
  }

  if (action === "poll") {
    const isHost = body.token === existing.host_token;
    const isGuest = body.token === existing.guest_token;
    if (!isHost && !isGuest) return json({ error: "Room authorization failed." }, 403);
    return json({
      status: existing.status,
      answer: isHost ? existing.answer : undefined,
      fogEnabled: Boolean(existing.fog_enabled),
    });
  }

  if (action === "connected") {
    if (body.token !== existing.host_token && body.token !== existing.guest_token)
      return json({ error: "Room authorization failed." }, 403);
    await database.prepare("UPDATE multiplayer_rooms SET status = 'connected', updated_at = ? WHERE code = ?")
      .bind(now, code)
      .run();
    return json({ ok: true });
  }

  if (action === "close") {
    if (body.token !== existing.host_token && body.token !== existing.guest_token)
      return json({ error: "Room authorization failed." }, 403);
    await database.prepare("UPDATE multiplayer_rooms SET status = 'closed', updated_at = ? WHERE code = ?")
      .bind(now, code)
      .run();
    return json({ ok: true });
  }

  return json({ error: "Unknown multiplayer action." }, 400);
}
