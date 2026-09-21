import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_KEY = process.env.LIVEAVATAR_API_KEY;
const API_URL = process.env.LIVEAVATAR_API_URL || "https://api.liveavatar.com";
const PEDRO_ID = "7001c332-8101-4e5a-b695-eac2a72d9568";
const PORT = Number(process.env.PORT || 4173);

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".mp4", "video/mp4"],
  [".json", "application/json; charset=utf-8"]
]);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function safeAssetPath(urlPath) {
  if (urlPath === "/" || urlPath === "/avatar-lab.html") {
    return path.join(ROOT, "avatar-lab.html");
  }

  if (!urlPath.startsWith("/assets/")) return null;

  const decoded = decodeURIComponent(urlPath);
  const resolved = path.resolve(ROOT, "." + decoded);
  const assetsRoot = path.resolve(ROOT, "assets");

  if (!resolved.startsWith(assetsRoot + path.sep)) return null;
  return resolved;
}

function serveFile(req, res, filePath) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  if (!stat.isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = mimeTypes.get(ext) || "application/octet-stream";
  const range = req.headers.range;

  if (range && ext === ".mp4") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store"
    });

    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60"
  });

  createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "POST" && url.pathname === "/api/liveavatar-token") {
    if (!API_KEY) {
      sendJson(res, 500, {
        error: "LIVEAVATAR_API_KEY is not set in the shell running this test server."
      });
      return;
    }

    try {
      const upstream = await fetch(`${API_URL}/v1/sessions/token`, {
        method: "POST",
        headers: {
          "X-API-KEY": API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "LITE",
          avatar_id: PEDRO_ID,
          is_sandbox: false
        })
      });

      const payload = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        const firstMessage =
          payload?.data?.[0]?.message ||
          payload?.error ||
          payload?.message ||
          "LiveAvatar rejected the token request.";

        sendJson(res, upstream.status, { error: firstMessage });
        return;
      }

      sendJson(res, 200, {
        session_token: payload?.data?.session_token,
        session_id: payload?.data?.session_id
      });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err)
      });
    }

    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD, POST" });
    res.end();
    return;
  }

  const filePath = safeAssetPath(url.pathname);
  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  serveFile(req, res, filePath);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("Pepper Junction Pedro Kitchen Lab");
  console.log("--------------------------------");
  console.log(`Open: http://127.0.0.1:${PORT}/avatar-lab.html`);
  console.log(`Pedro: ${PEDRO_ID}`);
  console.log("");
  if (!API_KEY) {
    console.log("LIVEAVATAR_API_KEY is not set. The page will load, but Pedro cannot start.");
  }
});
