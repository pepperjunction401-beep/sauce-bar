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
const AVATAR_DIR = path.join(ROOT, "assets", "avatar");

const RULES_FILE = "Pepper_Junction_Avatar_Chef_Rules_Guidelines.json";
const DIALOGUE_FILE = "Pepper_Junction_Avatar_Chef_Dialogue_Reaction_Library.json";

function readValidatedJson(filename) {
  const filePath = path.join(AVATAR_DIR, filename);
  const raw = readFileSync(filePath, "utf8").trim();

  try {
    JSON.parse(raw);
  } catch (error) {
    console.error(`Invalid JSON in ${filename}.`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  return raw;
}

const rules = readValidatedJson(RULES_FILE);
const dialogue = readValidatedJson(DIALOGUE_FILE);

// The Rules & Guidelines remain the governing authority. The Dialogue / Reaction
// Library follows as the approved conversational source governed by those rules.
// The source JSON is passed through unchanged; these markers only preserve the
// document boundary inside the LiveAvatar context.
const prompt = [
  `===== BEGIN ${RULES_FILE} =====`,
  rules,
  `===== END ${RULES_FILE} =====`,
  "",
  `===== BEGIN ${DIALOGUE_FILE} =====`,
  dialogue,
  `===== END ${DIALOGUE_FILE} =====`
].join("\n");

const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
const name = `Head Pepper governed ${stamp}`;

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
console.log("Head Pepper governed context created.");
console.log(`Rules:    ${RULES_FILE}`);
console.log(`Dialogue: ${DIALOGUE_FILE}`);
console.log(`Prompt:   ${prompt.length.toLocaleString()} characters`);
console.log(`Context ID: ${contextId}`);
console.log("");
console.log("Run this in the same shell before restarting the server:");
console.log(`export LIVEAVATAR_CONTEXT_ID=${contextId}`);
console.log("");
