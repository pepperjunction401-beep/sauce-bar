#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_KEY = process.env.LIVEAVATAR_API_KEY;
const API_URL = process.env.LIVEAVATAR_API_URL || "https://api.liveavatar.com";

if (!API_KEY) {
  console.error("LIVEAVATAR_API_KEY is not set in this shell.");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
const promptPath = path.join(
  ROOT,
  "assets",
  "avatar",
  "Head_Pepper_Conversation_Context_v0.1.txt"
);
const prompt = readFileSync(promptPath, "utf8").trim();

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const name = `Pepper Junction Head Pepper Conversation v0.1 ${stamp}`;

const response = await fetch(`${API_URL}/v1/contexts`, {
  method: "POST",
  headers: {
    "X-API-KEY": API_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    name,
    prompt,
    opening_text: "Hi. Welcome to the Pairing Bar."
  })
});

const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  const message =
    payload?.data?.[0]?.message ||
    payload?.error ||
    payload?.message ||
    "LiveAvatar rejected the context request.";
  console.error(`Context creation failed (${response.status}): ${message}`);
  process.exit(1);
}

const contextId = payload?.data?.id;
if (!contextId) {
  console.error("LiveAvatar created the context but did not return an id.");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log("");
console.log("Head Pepper conversation context created.");
console.log(`Context ID: ${contextId}`);
console.log("");
console.log("Run this in the same shell before restarting the server:");
console.log(`export LIVEAVATAR_CONTEXT_ID=${contextId}`);
console.log("");
