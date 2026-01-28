import express from "express";
import path from "path";
import fs from "fs";
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

  if (user === BASIC_AUTH_USER && pass === BASIC_AUTH_PASS) return next();

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

  const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
  let lastFile = null;

  const onLine = (chunk) => {
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

    sseSend(res, "done", { ok: code === 0, code, downloadUrl: link });
    res.end();
  });

  proc.on("error", (err) => {
    sseSend(res, "done", { ok: false, error: err.message });
    res.end();
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

app.listen(PORT, () => console.log(`MediaFetch listening on :${PORT}`));

