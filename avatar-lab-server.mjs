import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChefPepperIdentityRoot } from "./chef-pepper-identity.mjs";

const LIVEAVATAR_API_KEY = process.env.LIVEAVATAR_API_KEY;
const LIVEAVATAR_API_URL = process.env.LIVEAVATAR_API_URL || "https://api.liveavatar.com";
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_API_URL = process.env.HEYGEN_API_URL || "https://api.heygen.com";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1";
const HEAD_PEPPER_ID = "b6378b3e-614a-47e0-9ea3-c129c7851ba4";
const HEAD_PEPPER_VOICE_ID = process.env.LIVEAVATAR_VOICE_ID || "bb5e52ca-1775-442d-a70b-0152a7e518f2";
const HEAD_PEPPER_CONTEXT_ID = process.env.LIVEAVATAR_CONTEXT_ID || "";
const JG3_STARFISH_VOICE_ID = "bb7b684ec33a4d1fa032f5683d41abec";
const JG3_TEST_TEXT = "Welcome to Pepper Junction. Tell me what's on the plate, and we'll find something worth pouring.";
const PORT = Number(process.env.PORT || 4173);

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
const CHEF_PEPPER_IDENTITY = loadChefPepperIdentityRoot();
const CHEF_PEPPER_MODEL = process.env.OPENAI_MODEL || CHEF_PEPPER_IDENTITY.model.id;
const CHEF_PEPPER_CONVERSATIONS = new Map();
const CONVERSATION_TTL_MS = 30 * 60 * 1000;
const MAX_CONVERSATION_MESSAGES = 60;
const MAX_CUSTOMER_MESSAGE_CHARS = 4000;

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

async function readJsonBody(req, maxBytes = 16_384) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > maxBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
  }

  try {
    return body ? JSON.parse(body) : {};
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function getResponseText(payload) {
  const text = [];

  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        text.push(content.text);
      }
    }
  }

  return text.join("\n").trim();
}

function getOpenAIError(payload) {
  return (
    payload?.error?.message ||
    payload?.message ||
    "OpenAI rejected Chef Pepper's response request."
  );
}

async function requestChefPepperReply(conversationId, customerMessage) {
  const now = Date.now();
  const existing = CHEF_PEPPER_CONVERSATIONS.get(conversationId);
  const history = existing?.messages || [];
  const input = [...history, { role: "user", content: customerMessage }];

  const upstream = await fetch(`${OPENAI_API_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: CHEF_PEPPER_MODEL,
      instructions: CHEF_PEPPER_IDENTITY.instructionText,
      input,
      store: false
    })
  });

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const error = new Error(getOpenAIError(payload));
    error.statusCode = upstream.status;
    throw error;
  }

  const reply = getResponseText(payload);
  if (!reply) {
    throw new Error("OpenAI returned no written Chef Pepper response.");
  }

  const messages = [
    ...input,
    { role: "assistant", content: reply }
  ].slice(-MAX_CONVERSATION_MESSAGES);

  CHEF_PEPPER_CONVERSATIONS.set(conversationId, {
    messages,
    lastActive: now
  });

  return reply;
}

const conversationCleanup = setInterval(() => {
  const staleBefore = Date.now() - CONVERSATION_TTL_MS;
  for (const [conversationId, conversation] of CHEF_PEPPER_CONVERSATIONS) {
    if (conversation.lastActive < staleBefore) {
      CHEF_PEPPER_CONVERSATIONS.delete(conversationId);
    }
  }
}, 5 * 60 * 1000);
conversationCleanup.unref();

function safeAssetPath(urlPath) {
  if (urlPath === "/" || urlPath === "/avatar-lab.html") {
    return path.join(ROOT, "avatar-lab.html");
  }

  if (urlPath === "/index.html") {
    return path.join(ROOT, "index.html");
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

  if (req.method === "POST" && url.pathname === "/api/starfish-jg3-test-audio") {
    if (!HEYGEN_API_KEY) {
      sendJson(res, 500, {
        error: "HEYGEN_API_KEY is not set in the shell running this test server."
      });
      return;
    }

    try {
      const speechResponse = await fetch(`${HEYGEN_API_URL}/v3/voices/speech`, {
        method: "POST",
        headers: {
          "x-api-key": HEYGEN_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: JG3_TEST_TEXT,
          voice_id: JG3_STARFISH_VOICE_ID,
          input_type: "text",
          speed: 0.9,
          locale: "en-US"
        })
      });

      const speechPayload = await speechResponse.json().catch(() => ({}));
      if (!speechResponse.ok) {
        const message =
          speechPayload?.error?.message ||
          speechPayload?.message ||
          "HeyGen rejected the JG3 Starfish speech request.";
        sendJson(res, speechResponse.status, { error: message });
        return;
      }

      const audioUrl = speechPayload?.data?.audio_url;
      if (typeof audioUrl !== "string") {
        sendJson(res, 502, { error: "HeyGen returned no Starfish audio URL." });
        return;
      }

      const parsedAudioUrl = new URL(audioUrl);
      if (
        parsedAudioUrl.protocol !== "https:" ||
        !(parsedAudioUrl.hostname === "heygen.ai" || parsedAudioUrl.hostname.endsWith(".heygen.ai"))
      ) {
        sendJson(res, 502, { error: "HeyGen returned an unexpected Starfish audio host." });
        return;
      }

      const audioResponse = await fetch(parsedAudioUrl);
      if (!audioResponse.ok) {
        sendJson(res, 502, { error: "HeyGen created JG3 speech, but its audio file could not be downloaded." });
        return;
      }

      const audio = Buffer.from(await audioResponse.arrayBuffer());
      res.writeHead(200, {
        "Content-Type": audioResponse.headers.get("content-type") || "audio/mpeg",
        "Content-Length": audio.length,
        "Cache-Control": "no-store",
        "X-Chef-Pepper-Audio-Duration": String(speechPayload?.data?.duration || "")
      });
      res.end(audio);
    } catch (err) {
      console.error("JG3 Starfish test error", err);
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err)
      });
    }

    return;
  }

  if (req.method === "GET" && url.pathname === "/api/chef-pepper-status") {
    sendJson(res, 200, {
      ready: Boolean(OPENAI_API_KEY),
      identity: CHEF_PEPPER_IDENTITY.identity,
      identity_version: CHEF_PEPPER_IDENTITY.version,
      fingerprint: CHEF_PEPPER_IDENTITY.fingerprint,
      model: CHEF_PEPPER_MODEL
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chef-pepper-chat") {
    if (!OPENAI_API_KEY) {
      sendJson(res, 500, {
        error: "OPENAI_API_KEY is not set in the shell running this server."
      });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : "";
      const customerMessage = typeof body.message === "string" ? body.message.trim() : "";

      if (!/^[A-Za-z0-9_-]{16,128}$/.test(conversationId)) {
        sendJson(res, 400, { error: "A valid Chef Pepper conversation ID is required." });
        return;
      }

      if (!customerMessage) {
        sendJson(res, 400, { error: "Type a message for Chef Pepper first." });
        return;
      }

      if (customerMessage.length > MAX_CUSTOMER_MESSAGE_CHARS) {
        sendJson(res, 400, {
          error: `Keep this Chef Pepper test message under ${MAX_CUSTOMER_MESSAGE_CHARS.toLocaleString()} characters.`
        });
        return;
      }

      const reply = await requestChefPepperReply(conversationId, customerMessage);
      sendJson(res, 200, {
        conversation_id: conversationId,
        reply,
        identity_version: CHEF_PEPPER_IDENTITY.version,
        fingerprint: CHEF_PEPPER_IDENTITY.fingerprint,
        model: CHEF_PEPPER_MODEL
      });
    } catch (err) {
      console.error("Chef Pepper response error", err);
      sendJson(res, Number(err?.statusCode) || 500, {
        error: err instanceof Error ? err.message : String(err)
      });
    }

    return;
  }

  if (
    req.method === "POST" &&
    (url.pathname === "/api/liveavatar-token" || url.pathname === "/api/liveavatar-lite-token")
  ) {
    if (!LIVEAVATAR_API_KEY) {
      sendJson(res, 500, {
        error: "LIVEAVATAR_API_KEY is not set in the shell running this test server."
      });
      return;
    }

    try {
      const forceLite = url.pathname === "/api/liveavatar-lite-token";
      const fullMode = Boolean(HEAD_PEPPER_CONTEXT_ID) && !forceLite;
      const upstream = await fetch(`${LIVEAVATAR_API_URL}/v1/sessions/token`, {
        method: "POST",
        headers: {
          "X-API-KEY": LIVEAVATAR_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          fullMode
            ? {
                mode: "FULL",
                avatar_id: HEAD_PEPPER_ID,
                avatar_persona: {
                  voice_id: HEAD_PEPPER_VOICE_ID,
                  context_id: HEAD_PEPPER_CONTEXT_ID,
                  language: "en"
                },
                is_sandbox: false
              }
            : {
                mode: "LITE",
                avatar_id: HEAD_PEPPER_ID,
                is_sandbox: false
              }
        )
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
        session_id: payload?.data?.session_id,
        mode: fullMode ? "FULL" : "LITE"
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
  console.log("Pepper Junction Head Pepper Kitchen Lab");
  console.log("--------------------------------");
  console.log(`Lab:        http://127.0.0.1:${PORT}/avatar-lab.html`);
  console.log(`Pairing Bar: http://127.0.0.1:${PORT}/index.html`);
  console.log(`Chef Pepper: Identity Root v${CHEF_PEPPER_IDENTITY.version}`);
  console.log(`Fingerprint: ${CHEF_PEPPER_IDENTITY.fingerprint}`);
  console.log(`Model:       ${CHEF_PEPPER_MODEL}`);
  console.log("Pass 1:      typed text only; no LiveAvatar session starts from the Pairing Bar");
  console.log("");
  if (!OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY is not set. The Pairing Bar will load, but typed Chef Pepper replies cannot run.");
  }
  if (!LIVEAVATAR_API_KEY) {
    console.log("LIVEAVATAR_API_KEY is not set. The separate avatar lab cannot start Head Pepper.");
  }
  if (!HEYGEN_API_KEY) {
    console.log("HEYGEN_API_KEY is not set. The avatar lab can start Head Pepper, but cannot generate the JG3 voice test.");
  }
});
