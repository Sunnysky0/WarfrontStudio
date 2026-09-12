/**
 * Start/stop PostgreSQL 16.
 * Prefers Docker Desktop Compose (including the default Windows install path
 * when `docker` is missing from PATH). Falls back to zonky binaries in
 * `.cache/pgsql-16` if Docker is unavailable.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "16.15.0";
const CACHE = path.join(ROOT, ".cache");
const PREFIX = path.join(CACHE, "pgsql-16");
const DATA = path.join(ROOT, ".data", "pgdata");
const LOG = path.join(ROOT, ".data", "postgres.log");
const JAR = path.join(CACHE, `pgsql-${VERSION}.jar`);
const USER = "postgres";
const PASSWORD = "postgres";
const PORT = 5432;
const DB_NAME = "app_db";

const isWin = process.platform === "win32";
const exe = (name) => path.join(PREFIX, "bin", isWin ? `${name}.exe` : name);

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...opts,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  return result;
}

function mustRun(command, args, opts = {}) {
  const result = run(command, args, opts);
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout, result.error?.message].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed:\n${detail}`);
  }
  return result;
}

function pgEnv() {
  const bin = path.join(PREFIX, "bin");
  const lib = path.join(PREFIX, "lib");
  const pathKey = isWin ? "Path" : "PATH";
  const sep = isWin ? ";" : ":";
  return {
    ...process.env,
    [pathKey]: `${bin}${sep}${lib}${sep}${process.env[pathKey] ?? process.env.PATH ?? ""}`,
    PGPASSWORD: PASSWORD,
    PGUSER: USER,
    PGHOST: "127.0.0.1",
    PGPORT: String(PORT),
  };
}

const DOCKER_CANDIDATES = [
  process.env.DOCKER_PATH,
  "docker",
  "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
].filter(Boolean);

function dockerEnv(dockerPath) {
  const extra = path.isAbsolute(dockerPath) ? path.dirname(dockerPath) : "";
  const pathKey = isWin ? "Path" : "PATH";
  const sep = isWin ? ";" : ":";
  return {
    ...process.env,
    [pathKey]: extra
      ? `${extra}${sep}${process.env[pathKey] ?? process.env.PATH ?? ""}`
      : (process.env[pathKey] ?? process.env.PATH ?? ""),
    // Local Postgres and Docker named pipes must not go through the VPN proxy.
    NO_PROXY: [process.env.NO_PROXY, "localhost", "127.0.0.1"].filter(Boolean).join(","),
    no_proxy: [process.env.no_proxy, "localhost", "127.0.0.1"].filter(Boolean).join(","),
  };
}

function resolveDocker() {
  for (const candidate of DOCKER_CANDIDATES) {
    const env = typeof candidate === "string" && path.isAbsolute(candidate) ? dockerEnv(candidate) : process.env;
    const r = run(candidate, ["compose", "version"], { env });
    if (r.status === 0) return candidate;
  }
  return null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (current, hops) => {
      if (hops > 5) {
        reject(new Error(`too many redirects: ${current}`));
        return;
      }
      https
        .get(current, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            follow(res.headers.location, hops + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`GET ${current} -> ${res.statusCode}`));
            return;
          }
          const out = createWriteStream(dest);
          res.pipe(out);
          out.on("finish", () => out.close(resolve));
          out.on("error", reject);
        })
        .on("error", reject);
    };
    follow(url, 0);
  });
}

function artifactName() {
  if (process.platform === "win32") return "postgres-windows-x86_64.txz";
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "postgres-darwin-arm_64.txz" : "postgres-darwin-x86_64.txz";
  }
  return process.arch === "arm64" ? "postgres-linux-arm_64.txz" : "postgres-linux-x86_64.txz";
}

function artifactCoords() {
  const artifact = `embedded-postgres-binaries-${
    process.platform === "win32"
      ? "windows-amd64"
      : process.platform === "darwin"
        ? process.arch === "arm64"
          ? "darwin-arm64"
          : "darwin-amd64"
        : process.arch === "arm64"
          ? "linux-arm64v8"
          : "linux-amd64"
  }`;
  return {
    artifact,
    url: `https://repo1.maven.org/maven2/io/zonky/test/postgres/${artifact}/${VERSION}/${artifact}-${VERSION}.jar`,
  };
}

async function ensureBinaries() {
  if (existsSync(exe("pg_ctl"))) return;
  mkdirSync(CACHE, { recursive: true });
  const { url } = artifactCoords();
  if (!existsSync(JAR)) {
    console.log(`Downloading PostgreSQL ${VERSION} binaries…`);
    await download(url, JAR);
  }
  const inner = artifactName();
  const txz = path.join(CACHE, inner);
  console.log("Extracting PostgreSQL binaries…");
  mustRun("tar", ["-xf", JAR, "-C", CACHE, inner]);
  mkdirSync(PREFIX, { recursive: true });
  mustRun("tar", ["-xf", txz, "-C", PREFIX]);
}

function ensureCluster() {
  mkdirSync(path.dirname(DATA), { recursive: true });
  if (existsSync(path.join(DATA, "PG_VERSION"))) return;
  const pwfile = path.join(CACHE, "pwfile");
  writeFileSync(pwfile, `${PASSWORD}\n`, { encoding: "utf8" });
  console.log("Initializing database cluster…");
  mustRun(
    exe("initdb"),
    ["-D", DATA, "-U", USER, "-A", "scram-sha-256", "--pwfile", pwfile, "--encoding=UTF8", "--no-locale"],
    { env: pgEnv(), cwd: path.join(PREFIX, "bin") },
  );
}

function isPostmasterAlive() {
  const pidFile = path.join(DATA, "postmaster.pid");
  if (!existsSync(pidFile)) return false;
  const pid = Number(readFileSync(pidFile, "utf8").split(/\r?\n/)[0]);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: PORT });
    socket.setTimeout(400);
    socket.on("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitUntilReady(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen()) return;
    await sleep(200);
  }
  throw new Error(`PostgreSQL did not become ready on 127.0.0.1:${PORT} within ${timeoutMs}ms. See ${LOG}`);
}

async function startLocal() {
  if (await isPortOpen()) {
    console.log(`PostgreSQL already listening on 127.0.0.1:${PORT}`);
    return;
  }
  const pidFile = path.join(DATA, "postmaster.pid");
  if (existsSync(pidFile) && !isPostmasterAlive()) {
    unlinkSync(pidFile);
  }
  console.log("Starting PostgreSQL…");
  // Detach `postgres` directly. `pg_ctl start` often never returns on Windows.
  const child = spawn(exe("postgres"), ["-D", DATA, "-p", String(PORT), "-h", "127.0.0.1"], {
    env: pgEnv(),
    cwd: path.join(PREFIX, "bin"),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  await waitUntilReady();
}

function stopLocal() {
  const pidFile = path.join(DATA, "postmaster.pid");
  if (!existsSync(pidFile)) {
    console.log("PostgreSQL is not running.");
    return;
  }
  const result = run(exe("pg_ctl"), ["-D", DATA, "stop", "-m", "fast"], { env: pgEnv() });
  if (result.status !== 0 && !isPostmasterAlive()) {
    unlinkSync(pidFile);
    console.log("PostgreSQL was already stopped.");
    return;
  }
  if (result.status !== 0) {
    throw new Error(`pg_ctl stop failed:\n${[result.stderr, result.stdout].filter(Boolean).join("\n")}`);
  }
  console.log("PostgreSQL stopped.");
}

async function withAdminClient(fn) {
  const client = new pg.Client({
    host: "127.0.0.1",
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres",
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureDatabase() {
  const exists = await withAdminClient(async (client) => {
    const { rows } = await client.query("select 1 from pg_database where datname = $1", [DB_NAME]);
    return rows.length > 0;
  });
  if (exists) return;
  console.log(`Creating database ${DB_NAME}…`);
  await withAdminClient((client) => client.query(`create database ${DB_NAME}`));
}

async function upLocal() {
  await ensureBinaries();
  ensureCluster();
  await startLocal();
  await ensureDatabase();
  console.log(`Ready: postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`);
}

function dockerUp(dockerPath) {
  console.log(`Using Docker Compose (${dockerPath})…`);
  mustRun(dockerPath, ["compose", "up", "-d", "--wait"], { cwd: ROOT, env: dockerEnv(dockerPath) });
}

function dockerDown(dockerPath) {
  mustRun(dockerPath, ["compose", "down"], { cwd: ROOT, env: dockerEnv(dockerPath) });
}

const cmd = process.argv[2] ?? "up";
const dockerPath = resolveDocker();

if (cmd === "up") {
  if (dockerPath) dockerUp(dockerPath);
  else await upLocal();
} else if (cmd === "down") {
  if (dockerPath) dockerDown(dockerPath);
  else if (existsSync(exe("pg_ctl"))) stopLocal();
  else console.log("PostgreSQL is not running.");
} else {
  console.error("Usage: node scripts/pg-local.mjs [up|down]");
  process.exit(1);
}
