import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const folder = mkdtempSync(path.join(tmpdir(), "tiki-postgres-"));
const password = randomBytes(24).toString("hex");
const port = 55439;
let log = "";
// PG18 async IO workers can retain inherited pipes after taskkill on Windows.
const pg = new EmbeddedPostgres({ databaseDir: path.join(folder, "data"), user: "postgres", password, port, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-c", "io_method=sync"], onLog: m => { log += `${m}\n`; }, onError: m => { log += `${m}\n`; } });
const env = { ...process.env, TEST_DATABASE_URL: `postgresql://postgres:${password}@localhost:${port}/postgres?schema=public`, NEXTAUTH_SECRET: randomBytes(32).toString("base64") };
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Test exited ${code}: ${args.join(" ")}`)));
  });
}
let started = false;
try {
  await pg.initialise(); await pg.start(); started = true;
  console.log("Temporary local PostgreSQL ready; application DATABASE_URL is untouched.");
  await run(["--test", "tests/database.test.mjs"]);
  await run(["tests/e2e.mjs"]);
} catch (error) { if (!started) console.error(log); throw error; }
finally { if (started) await pg.stop(); rmSync(folder, { recursive: true, force: true }); }