export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return json({}, 204);
    }

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "aim-web",
        databaseConfigured: Boolean(env.DB)
      });
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      return handleLeaderboard(url, env);
    }

    if (url.pathname === "/api/sessions" && request.method === "POST") {
      return handleCreateSession(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};

async function handleLeaderboard(url, env) {
  const mode = sanitizeMode(url.searchParams.get("mode"));
  if (!mode) {
    return json({ error: "Invalid mode." }, 400);
  }

  if (!env.DB) {
    return json({ entries: [] });
  }

  const statement = mode === "click"
    ? env.DB.prepare(`
        SELECT
          id, mode, player_name AS playerName, created_at AS createdAt,
          session_number AS sessionNumber, hits, misses, avg, best, acc, score
        FROM sessions
        WHERE mode = ?
        ORDER BY avg ASC, acc DESC, created_at ASC
        LIMIT 20
      `)
    : env.DB.prepare(`
        SELECT
          id, mode, player_name AS playerName, created_at AS createdAt,
          session_number AS sessionNumber, on_time AS onTime, off_time AS offTime, pct, score
        FROM sessions
        WHERE mode = ?
        ORDER BY pct DESC, score DESC, created_at ASC
        LIMIT 20
      `);

  const { results } = await statement.bind(mode).all();
  return json({ entries: results ?? [] });
}

async function handleCreateSession(request, env) {
  if (!env.DB) {
    return json({ error: "Database binding is not configured yet." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const normalized = normalizeSession(payload);
  if (!normalized.ok) {
    return json({ error: normalized.error }, 400);
  }

  const entry = normalized.value;

  await env.DB.prepare(`
    INSERT INTO sessions (
      id, mode, player_name, created_at, session_number,
      hits, misses, avg, best, acc, on_time, off_time, pct, score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.id,
    entry.mode,
    entry.playerName,
    entry.createdAt,
    entry.sessionNumber ?? null,
    entry.hits ?? null,
    entry.misses ?? null,
    entry.avg ?? null,
    entry.best ?? null,
    entry.acc ?? null,
    entry.onTime ?? null,
    entry.offTime ?? null,
    entry.pct ?? null,
    entry.score
  ).run();

  return json({ ok: true, entry }, 201);
}

function normalizeSession(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Body is required." };
  }

  const mode = sanitizeMode(payload.mode);
  if (!mode) {
    return { ok: false, error: "Mode must be click or track." };
  }

  const playerName = String(payload.playerName || "guest").trim().slice(0, 20) || "guest";
  const createdAt = isIsoDate(payload.createdAt) ? payload.createdAt : new Date().toISOString();
  const score = toFiniteNumber(payload.score);

  if (score == null) {
    return { ok: false, error: "Score is required." };
  }

  const entry = {
    id: crypto.randomUUID(),
    mode,
    playerName,
    createdAt,
    sessionNumber: toFiniteNumber(payload.sessionNumber),
    score
  };

  if (mode === "click") {
    const avg = toFiniteNumber(payload.avg);
    const best = toFiniteNumber(payload.best);
    const hits = toFiniteNumber(payload.hits);
    const misses = toFiniteNumber(payload.misses);
    const acc = toFiniteNumber(payload.acc);

    if (avg == null || best == null || hits == null || acc == null) {
      return { ok: false, error: "Click runs require avg, best, hits, and acc." };
    }

    entry.avg = Math.round(avg);
    entry.best = Math.round(best);
    entry.hits = Math.round(hits);
    entry.misses = misses == null ? 0 : Math.round(misses);
    entry.acc = Math.round(acc);
  } else {
    const onTime = toFiniteNumber(payload.onTime);
    const offTime = toFiniteNumber(payload.offTime);
    const pct = toFiniteNumber(payload.pct);

    if (onTime == null || offTime == null || pct == null) {
      return { ok: false, error: "Tracking runs require onTime, offTime, and pct." };
    }

    entry.onTime = Number(onTime.toFixed(2));
    entry.offTime = Number(offTime.toFixed(2));
    entry.pct = Math.round(pct);
  }

  return { ok: true, value: entry };
}

function sanitizeMode(value) {
  return value === "click" || value === "track" ? value : null;
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
