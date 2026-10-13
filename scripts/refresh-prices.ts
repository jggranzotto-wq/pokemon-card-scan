import { existsSync, readFileSync } from "node:fs";
import { refreshAllPrices } from "../src/lib/prices/refresh";
import { closePool } from "../src/lib/db";

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(".env.local");
loadEnv(".env");

async function main() {
  const result = await refreshAllPrices();
  console.log(JSON.stringify(result, null, 2));
  await closePool();
  if (result.failures.length) process.exitCode = 1;
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await closePool();
  process.exitCode = 1;
});
