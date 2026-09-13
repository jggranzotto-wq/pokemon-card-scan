#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apiDir = resolve(root, "src/app/api");
const middleware = resolve(root, "src/middleware.ts");
const backup = resolve(root, ".export-api-backup");
const middlewareBackup = resolve(root, ".export-middleware-backup.ts");

if (!process.env.NEXT_PUBLIC_API_ORIGIN) {
  console.warn(
    "NEXT_PUBLIC_API_ORIGIN is unset. The APK UI will call /api on https://localhost; set the hosted PWA origin before a store build.",
  );
}

function restore() {
  if (existsSync(backup)) {
    if (existsSync(apiDir)) rmSync(apiDir, { recursive: true, force: true });
    renameSync(backup, apiDir);
  }
  if (existsSync(middlewareBackup)) {
    if (existsSync(middleware)) rmSync(middleware);
    renameSync(middlewareBackup, middleware);
  }
}

if (!existsSync(apiDir)) {
  console.error("src/app/api is missing; cannot export the Android web bundle.");
  process.exit(1);
}

renameSync(apiDir, backup);
if (existsSync(middleware)) renameSync(middleware, middlewareBackup);
const www = resolve(root, "www");
if (existsSync(www)) rmSync(www, { recursive: true, force: true });

let status = 1;
try {
  const result = spawnSync("npx", ["next", "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_OUTPUT_EXPORT: "1" },
  });
  status = result.status ?? 1;
} finally {
  restore();
}

if (status !== 0) process.exit(status);
console.log("Exported static Android web assets to www/");
