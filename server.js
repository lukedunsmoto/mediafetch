import express from "express";
import path from "path";
import fs from "fs";
import https from "https";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/**
 * Env
 */
const PORT = Number(process.env.PORT || 3002);
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/data/downloads";
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || "";
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

function getNumericEnv(name, fallback, min = 1) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const int = Math.floor(value);
  if (int < min) return fallback;
  return int;
}

const MAX_CONCURRENT_JOBS = getNumericEnv("MAX_CONCURRENT_JOBS", 2, 1);
const JOB_TIMEOUT_MS = getNumericEnv("JOB_TIMEOUT_MS", 600000, 1000);
const VERSION_CHECK_TTL_MS = getNumericEnv("VERSION_CHECK_TTL_MS", 21600000, 60000);
const GITHUB_REPO = process.env.GITHUB_REPO || "lukedunsmoto/mediafetch";

let CURRENT_VERSION = "0.0.0";
try {
  const packageJsonPath = path.join(__dirname, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (typeof packageJson.version === "string" && packageJson.version.trim()) {
    CURRENT_VERSION = packageJson.version.trim();
  }
} catch {
  CURRENT_VERSION = "0.0.0";
}

let activeJobCount = 0;
const versionCache = {
  checkedAt: 0,
  data: null,
};

/**
 * Ensure output dir exists
 */
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Middleware
 */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/**
 * Basic Auth (applies to everything)
 */
function basicAuth(req, res, next) {
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASS) return next();

  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="MediaFetch"');
    return res.status(401).send("Auth required");
  }

  const decoded = Buffer.from(hdr.slice(6), "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const user = idx >= 0 ? decoded.slice(0, idx) : "";
  const pass = idx >= 0 ? decoded.slice(idx + 1) : "";

  const userBuf = Buffer.from(user);
  const passBuf = Buffer.from(pass);
  const expectedUserBuf = Buffer.from(BASIC_AUTH_USER);
  const expectedPassBuf = Buffer.from(BASIC_AUTH_PASS);

  const userOk =
    userBuf.length === expectedUserBuf.length &&
    crypto.timingSafeEqual(userBuf, expectedUserBuf);
  const passOk =
    passBuf.length === expectedPassBuf.length &&
    crypto.timingSafeEqual(passBuf, expectedPassBuf);

  if (userOk && passOk) return next();

  res.setHeader("WWW-Authenticate", 'Basic realm="MediaFetch"');
  return res.status(401).send("Invalid credentials");
}

app.use(basicAuth);

/**
 * Static: UI + Assets
 * - / serves ./public (so / loads public/index.html)
 * - /assets serves ./assets (fixes missing logo if your UI references /assets/...)
 * - /downloads serves OUTPUT_DIR so the UI can link files
 */
app.use(express.static(path.join(__dirname, "public")));

app.use("/assets", express.static(path.join(__dirname, "assets")));

app.use("/downloads", express.static(OUTPUT_DIR));

/**
 * Helpers
 */
function safeSlug(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "mediafetch";
}

function normalisePublicBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL.replace(/\/+$/, "");

  const proto =
    (req.headers["x-forwarded-proto"] || "").toString().split(",")[0].trim() ||
    "http";
  const host =
    (req.headers["x-forwarded-host"] || req.headers.host || "")
      .toString()
      .split(",")[0]
      .trim();

  if (!host) return "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function cleanInputUrl(raw) {
  const u = String(raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) return "";
  return u;
}

function normaliseVersion(input) {
  const raw = String(input || "").trim();
  const withoutPrefix = raw.startsWith("v") ? raw.slice(1) : raw;
  const match = withoutPrefix.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    value: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "mediafetch-version-check",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message = `GitHub API request failed (${res.statusCode})`;
            reject(new Error(message));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("Invalid JSON from GitHub API"));
          }
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error("GitHub API request timed out"));
    });
  });
}

async function fetchLatestVersionFromGitHub() {
  const releaseUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const tagsUrl = `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=20`;

  try {
    const latestRelease = await fetchJson(releaseUrl);
    const parsed = normaliseVersion(latestRelease?.tag_name);
    if (parsed) {
      return {
        latestVersion: parsed.value,
        releaseUrl: latestRelease?.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      };
    }
  } catch {
    // Fall back to tags lookup
  }

  const tags = await fetchJson(tagsUrl);
  if (!Array.isArray(tags)) {
    throw new Error("Unexpected tags response from GitHub API");
  }

  const parsedTags = tags
    .map((tag) => {
      const parsed = normaliseVersion(tag?.name);
      if (!parsed) return null;
      return {
        parsed,
        raw: String(tag.name),
      };
    })
    .filter(Boolean)
    .sort((a, b) => compareVersions(b.parsed, a.parsed));

  if (!parsedTags.length) {
    throw new Error("No semantic version tags found");
  }

  const latest = parsedTags[0];
  return {
    latestVersion: latest.parsed.value,
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${latest.raw}`,
  };
}

async function getVersionInfo() {
  const now = Date.now();
  if (versionCache.data && now - versionCache.checkedAt < VERSION_CHECK_TTL_MS) {
    return versionCache.data;
  }

  try {
    const current = normaliseVersion(CURRENT_VERSION);
    const latest = await fetchLatestVersionFromGitHub();
    const latestParsed = normaliseVersion(latest.latestVersion);
    const updateAvailable = Boolean(current && latestParsed && compareVersions(latestParsed, current) > 0);

    const data = {
      currentVersion: CURRENT_VERSION,
      latestVersion: latest.latestVersion,
      updateAvailable,
      releaseUrl: latest.releaseUrl,
      checkedAt: new Date(now).toISOString(),
      cacheTtlMs: VERSION_CHECK_TTL_MS,
    };

    versionCache.checkedAt = now;
    versionCache.data = data;
    return data;
  } catch {
    if (versionCache.data) {
      return {
        ...versionCache.data,
        stale: true,
      };
    }

    return {
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      updateAvailable: false,
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
      checkedAt: new Date(now).toISOString(),
      cacheTtlMs: VERSION_CHECK_TTL_MS,
      stale: true,
    };
  }
}

function startSSE(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Helpful for some proxies
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Core runner (shared by GET + POST)
 */
function runYtDlp({ req, res, url, mode, filename }) {
  const cleanUrl = cleanInputUrl(url);
  if (!cleanUrl) {
    // For SSE endpoints, still reply cleanly
    res.status(400);
    startSSE(res);
    sseSend(res, "done", { ok: false, error: "Invalid url" });
    return res.end();
  }

  if (activeJobCount >= MAX_CONCURRENT_JOBS) {
    startSSE(res);
    sseSend(res, "done", {
      ok: false,
      error: `Server is busy. ${MAX_CONCURRENT_JOBS} concurrent job limit reached.`,
    });
    return res.end();
  }

  const jobId = crypto.randomBytes(8).toString("hex");
  const baseName = safeSlug(filename) || "mediafetch";
  const outTemplate = path.join(OUTPUT_DIR, `${baseName}-${jobId}.%(ext)s`);

  const argsBase = [
    "--no-warnings",
    "--newline",
    "--restrict-filenames",
    "--no-playlist",
    "--no-part",
    "-o",
    outTemplate,
  ];

  if (fs.existsSync("/app/cookies.txt")) {
    argsBase.push("--cookies", "/app/cookies.txt");
  }

  let args = [];
  if (String(mode) === "audio") {
    // Extract Audio (mp3)
    args = [...argsBase, "-x", "--audio-format", "mp3", "--audio-quality", "192K", cleanUrl];
  } else {
    // Best Video + Best Audio (merge to mp4)
    args = [...argsBase, "-f", "bv*+ba/b", "--merge-output-format", "mp4", cleanUrl];
  }

  startSSE(res);
  sseSend(res, "start", { jobId });

  activeJobCount += 1;
  const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
  let lastFile = null;
  let settled = false;

  const timeout = setTimeout(() => {
    if (settled) return;
    sseSend(res, "log", { line: `Job timed out after ${Math.floor(JOB_TIMEOUT_MS / 1000)} seconds.` });
    proc.kill("SIGTERM");
    setTimeout(() => {
      if (!settled) proc.kill("SIGKILL");
    }, 3000);
    finish({ ok: false, error: "Job timed out" });
  }, JOB_TIMEOUT_MS);

  function finish(payload) {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    activeJobCount = Math.max(0, activeJobCount - 1);
    sseSend(res, "done", payload);
    res.end();
  }

  const onLine = (chunk) => {
    if (settled) return;
    const text = chunk.toString("utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      if (line.includes("Destination:") || line.includes("Merging formats into")) {
        const m = line.match(/(?:Destination:|Merging formats into)\s+"?([^"]+)"?$/);
        if (m?.[1]) lastFile = m[1].trim();
      }
      sseSend(res, "log", { line });
    }
  };

  proc.stdout.on("data", onLine);
  proc.stderr.on("data", onLine);

  proc.on("close", (code) => {
    const baseUrl = normalisePublicBaseUrl(req);
    let link = null;

    if (code === 0 && lastFile) {
      const normalisedOutput = path.resolve(OUTPUT_DIR) + path.sep;
      const normalisedFile = path.resolve(lastFile);

      if (normalisedFile.startsWith(normalisedOutput) && baseUrl) {
        const rel = normalisedFile.slice(normalisedOutput.length).replace(/^\/+/, "");
        link = `${baseUrl}/downloads/${rel}`;
      }
    }

    finish({ ok: code === 0, code, downloadUrl: link });
  });

  proc.on("error", (err) => {
    finish({ ok: false, error: err.message });
  });
}

/**
 * The route your UI is calling
 * POST /api/fetch
 * Body: { url, mode, filename }
 */
app.post("/api/fetch", (req, res) => {
  const { url, mode, filename } = req.body || {};
  runYtDlp({ req, res, url, mode, filename });
});

/**
 * Optional: keep a GET version for manual testing
 * GET /api/run?url=...&mode=video|audio&filename=...
 */
app.get("/api/run", (req, res) => {
  const url = req.query.url;
  const mode = req.query.mode || "video";
  const filename = req.query.filename || "";
  runYtDlp({ req, res, url, mode, filename });
});

/**
 * Health
 */
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/version", async (req, res) => {
  const versionInfo = await getVersionInfo();
  return res.json(versionInfo);
});

app.listen(PORT, () => console.log(`MediaFetch listening on :${PORT}`));

