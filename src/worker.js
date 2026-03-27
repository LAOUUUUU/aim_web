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
        databaseConfigured: Boolean(env.DB),
        features: ["leaderboard", "name-reservation", "difficulty"]
      });
    }

    if (url.pathname === "/api/register" && request.method === "POST") {
      return withDbErrorHandling("register", () => handleRegisterPlayer(request, env));
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      return withDbErrorHandling("leaderboard", () => handleLeaderboard(url, env));
    }

    if (url.pathname === "/api/sessions" && request.method === "POST") {
      return withDbErrorHandling("sessions", () => handleCreateSession(request, env));
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};

async function withDbErrorHandling(route, operation) {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      level: "error",
      route,
      code: "db_schema_mismatch",
      message
    }));

    return json({
      error: "The leaderboard backend is temporarily out of sync.",
      code: "db_schema_mismatch",
      route
    }, 500);
  }
}

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
          difficulty, session_number AS sessionNumber, hits, misses, avg, best, acc, score
        FROM sessions
        WHERE mode = ?
        ORDER BY avg ASC, acc DESC, created_at ASC
        LIMIT 20
      `)
    : env.DB.prepare(`
        SELECT
          id, mode, player_name AS playerName, created_at AS createdAt,
          difficulty, session_number AS sessionNumber, on_time AS onTime, off_time AS offTime, pct, score
        FROM sessions
        WHERE mode = ?
        ORDER BY pct DESC, score DESC, created_at ASC
        LIMIT 20
      `);

  const { results } = await statement.bind(mode).all();
  return json({ entries: results ?? [] });
}

async function handleRegisterPlayer(request, env) {
  if (!env.DB) {
    return json({ error: "Database binding is not configured yet." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const displayName = sanitizePlayerName(payload.playerName);
  if (!displayName) {
    return json({ error: "Player name must be 2-20 characters." }, 400);
  }

  const normalizedName = normalizeName(displayName);
  const claimToken = sanitizeClaimToken(payload.playerToken);

  const existing = await env.DB.prepare(`
    SELECT id, display_name AS displayName, claim_token AS claimToken
    FROM players
    WHERE normalized_name = ?
    LIMIT 1
  `).bind(normalizedName).first();

  if (existing) {
    if (claimToken && existing.claimToken === claimToken) {
      return json({
        ok: true,
        playerName: existing.displayName,
        playerToken: existing.claimToken,
        claimed: true
      });
    }

    return json({ error: "That player name is already taken." }, 409);
  }

  const nextToken = claimToken || crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO players (id, display_name, normalized_name, claim_token, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    displayName,
    normalizedName,
    nextToken,
    new Date().toISOString()
  ).run();

  return json({
    ok: true,
    playerName: displayName,
    playerToken: nextToken,
    claimed: true
  }, 201);
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
  const playerCheck = await ensurePlayerReservation(env, entry.playerName, entry.playerToken);
  if (!playerCheck.ok) {
    return json({ error: playerCheck.error }, 409);
  }

  await env.DB.prepare(`
    INSERT INTO sessions (
      id, mode, difficulty, player_name, created_at, session_number,
      hits, misses, avg, best, acc, on_time, off_time, pct, score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.id,
    entry.mode,
    entry.difficulty,
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
  const difficulty = sanitizeDifficulty(payload.difficulty);
  const createdAt = isIsoDate(payload.createdAt) ? payload.createdAt : new Date().toISOString();
  const score = toFiniteNumber(payload.score);

  if (score == null) {
    return { ok: false, error: "Score is required." };
  }
  if (!difficulty) {
    return { ok: false, error: "Difficulty must be easy, medium, or hard." };
  }

  const entry = {
    id: crypto.randomUUID(),
    mode,
    difficulty,
    playerName,
    playerToken: sanitizeClaimToken(payload.playerToken),
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

function sanitizeDifficulty(value) {
  return value === "easy" || value === "medium" || value === "hard" ? value : null;
}

function sanitizePlayerName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : null;
}

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function sanitizeClaimToken(value) {
  return typeof value === "string" && value.length >= 8 ? value.slice(0, 128) : null;
}

async function ensurePlayerReservation(env, playerName, playerToken) {
  const normalizedName = normalizeName(playerName);
  const existing = await env.DB.prepare(`
    SELECT display_name AS displayName, claim_token AS claimToken
    FROM players
    WHERE normalized_name = ?
    LIMIT 1
  `).bind(normalizedName).first();

  if (!existing) {
    const token = playerToken || crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO players (id, display_name, normalized_name, claim_token, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      playerName,
      normalizedName,
      token,
      new Date().toISOString()
    ).run();
    return { ok: true, playerToken: token };
  }

  if (!playerToken || existing.claimToken !== playerToken) {
    return { ok: false, error: "That player name is already taken." };
  }

  return { ok: true, playerToken };
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
