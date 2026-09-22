#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
const AVATAR_DIR = path.join(ROOT, "assets", "avatar");
const MANIFEST_PATH = path.join(AVATAR_DIR, "Chef_Pepper_Identity_Root.json");

function fail(message) {
  throw new Error(`Chef Pepper Identity Root: ${message}`);
}

function readJson(filePath, label) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8").trim();
  } catch {
    fail(`unable to read ${label}: ${filePath}`);
  }

  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch (error) {
    fail(
      `invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function validateManifest(manifest) {
  if (manifest?.identity !== "Chef Pepper") {
    fail("manifest identity must be Chef Pepper");
  }

  if (!manifest?.identity_root_version) {
    fail("manifest identity_root_version is required");
  }

  if (!manifest?.model?.provider || !manifest?.model?.id) {
    fail("manifest model provider and id are required");
  }

  if (!Array.isArray(manifest?.authoritative_sources) || manifest.authoritative_sources.length === 0) {
    fail("manifest authoritative_sources must contain at least one source");
  }

  const roles = new Set();
  for (const source of manifest.authoritative_sources) {
    if (!source?.role || !source?.path) {
      fail("every authoritative source requires role and path");
    }
    if (roles.has(source.role)) {
      fail(`duplicate source role: ${source.role}`);
    }
    roles.add(source.role);
  }

  const order = manifest?.assembly?.source_order;
  if (!Array.isArray(order) || order.length !== roles.size) {
    fail("assembly.source_order must list every authoritative source exactly once");
  }

  for (const role of order) {
    if (!roles.has(role)) {
      fail(`assembly.source_order references unknown role: ${role}`);
    }
  }

  if (new Set(order).size !== order.length) {
    fail("assembly.source_order contains duplicate roles");
  }

  if (manifest?.assembly?.preserve_source_text !== true) {
    fail("assembly.preserve_source_text must be true");
  }

  if (manifest?.assembly?.rewrite_or_summarize_sources !== false) {
    fail("assembly.rewrite_or_summarize_sources must be false");
  }
}

function safeSourcePath(relativePath) {
  const resolved = path.resolve(AVATAR_DIR, relativePath);
  const avatarRoot = path.resolve(AVATAR_DIR);

  if (!resolved.startsWith(avatarRoot + path.sep)) {
    fail(`source path escapes assets/avatar: ${relativePath}`);
  }

  return resolved;
}

export function loadChefPepperIdentityRoot() {
  const { raw: manifestRaw, parsed: manifest } = readJson(
    MANIFEST_PATH,
    "identity root manifest"
  );

  validateManifest(manifest);

  const sourceByRole = new Map();

  for (const source of manifest.authoritative_sources) {
    const sourcePath = safeSourcePath(source.path);
    const { raw, parsed } = readJson(sourcePath, source.path);

    sourceByRole.set(source.role, {
      role: source.role,
      path: source.path,
      raw,
      parsed
    });
  }

  const orderedSources = manifest.assembly.source_order.map((role) => {
    const source = sourceByRole.get(role);
    if (!source) fail(`missing loaded source for role: ${role}`);
    return source;
  });

  const instructionText = orderedSources
    .map(
      (source) =>
        `===== BEGIN ${source.role}: ${source.path} =====\n` +
        source.raw +
        `\n===== END ${source.role}: ${source.path} =====`
    )
    .join("\n\n");

  const fingerprint = createHash("sha256")
    .update(manifestRaw)
    .update("\n")
    .update(instructionText)
    .digest("hex");

  return Object.freeze({
    identity: manifest.identity,
    version: manifest.identity_root_version,
    model: Object.freeze({ ...manifest.model }),
    fingerprint,
    manifest: Object.freeze(manifest),
    sources: Object.freeze(
      orderedSources.map((source) =>
        Object.freeze({
          role: source.role,
          path: source.path,
          parsed: source.parsed
        })
      )
    ),
    instructionText
  });
}

const invokedDirectly =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  try {
    const root = loadChefPepperIdentityRoot();

    console.log("");
    console.log("Chef Pepper Identity Root");
    console.log("-------------------------");
    console.log(`Identity:    ${root.identity}`);
    console.log(`Version:     ${root.version}`);
    console.log(`Model:       ${root.model.provider} / ${root.model.id}`);
    console.log(`Sources:     ${root.sources.length}`);
    for (const source of root.sources) {
      console.log(`  - ${source.role}: ${source.path}`);
    }
    console.log(`Instructions: ${root.instructionText.length.toLocaleString()} characters`);
    console.log(`Fingerprint:  ${root.fingerprint}`);
    console.log("");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
