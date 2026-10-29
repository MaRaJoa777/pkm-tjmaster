/**
 * Pokémon Typing Master leaderboard API
 * GET  /scores -> reads scores.json from GitHub
 * POST /scores -> validates a score and commits scores.json to GitHub
 *
 * Configure GITHUB_TOKEN as a Cloudflare Worker Secret.
 * Configure GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, ALLOWED_ORIGIN as variables.
 */
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, "access-control-allow-origin": origin || "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type" }
  });
}
function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function cleanName(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[<>\u0000-\u001f\u007f]/g, "").slice(0, 20);
}
function sortScores(scores) {
  return scores.sort((a, b) => Number(b.score) - Number(a.score) || String(a.created_at).localeCompare(String(b.created_at)));
}
async function githubRequest(url, env, options = {}) {
  return fetch(url, { ...options, headers: {
    "Authorization": "Bearer " + env.GITHUB_TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {})
  }});
}
async function readFile(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/scores.json?ref=${encodeURIComponent(env.GITHUB_BRANCH || "main")}`;
  const response = await githubRequest(url, env);
  if (response.status === 404) return { sha: null, scores: [] };
  if (!response.ok) throw new Error("GitHub read failed: " + response.status);
  const file = await response.json();
  const parsed = JSON.parse(decodeBase64Utf8(file.content || ""));
  return { sha: file.sha, scores: Array.isArray(parsed.scores) ? parsed.scores : [] };
}
async function writeFile(env, sha, scores) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/scores.json`;
  const body = {
    message: "Update public typing game leaderboard",
    content: encodeBase64Utf8(JSON.stringify({ version: 1, updated_at: new Date().toISOString(), scores }, null, 2) + "\n"),
    branch: env.GITHUB_BRANCH || "main"
  };
  if (sha) body.sha = sha;
  return githubRequest(url, env, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsOrigin = allowedOrigin === "*" || origin === allowedOrigin ? (allowedOrigin === "*" ? "*" : origin) : "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": corsOrigin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "access-control-max-age": "86400"
      }});
    }
    if (!corsOrigin) return json({ error: "Origin not allowed" }, 403, "null");
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) return json({ error: "Worker is not configured" }, 503, corsOrigin);
    const url = new URL(request.url);
    if (url.pathname !== "/scores") return json({ error: "Not found" }, 404, corsOrigin);
    if (request.method === "GET") {
      try {
        const { scores } = await readFile(env);
        return json({ scores: sortScores(scores).slice(0, 100) }, 200, corsOrigin);
      } catch (error) {
        console.error(error);
        return json({ error: "Could not read leaderboard" }, 502, corsOrigin);
      }
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, corsOrigin);
    let input;
    try { input = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, corsOrigin); }
    const name = cleanName(input?.name);
    const score = Number(input?.score);
    if (!name || !Number.isInteger(score) || score < 0 || score > 100000) {
      return json({ error: "Invalid name or score" }, 400, corsOrigin);
    }
    // Retry once on concurrent writes so two players are less likely to overwrite one another.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { sha, scores } = await readFile(env);
        const record = {
          id: crypto.randomUUID(),
          name,
          score,
          created_at: new Date().toISOString()
        };
        const updated = sortScores([record, ...scores]).slice(0, 1000);
        const response = await writeFile(env, sha, updated);
        if (response.ok) return json({ ok: true, record, scores: updated.slice(0, 100) }, 201, corsOrigin);
        if (response.status !== 409 && response.status !== 422) {
          console.error("GitHub write failed:", response.status, await response.text());
          return json({ error: "Could not save score to GitHub" }, 502, corsOrigin);
        }
      } catch (error) {
        console.error(error);
        return json({ error: "Could not save score" }, 502, corsOrigin);
      }
    }
    return json({ error: "Leaderboard changed concurrently; please try again" }, 409, corsOrigin);
  }
};
