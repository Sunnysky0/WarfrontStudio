import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type Db = ReturnType<typeof drizzle>;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

let cachedPool: Pool | undefined;
let dbInstance: Db | undefined;

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return databaseUrl;
}

function getPool(): Pool {
  if (cachedPool) return cachedPool;
  if (process.env.NODE_ENV !== "production" && globalForDb.__arenaNextJsPostgresqlPool) {
    cachedPool = globalForDb.__arenaNextJsPostgresqlPool;
    return cachedPool;
  }
  cachedPool = new Pool({ connectionString: requireDatabaseUrl() });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = cachedPool;
  }
  return cachedPool;
}

function getDb(): Db {
  if (!dbInstance) dbInstance = drizzle(getPool());
  return dbInstance;
}

/** Defer Pool/drizzle construction so `next build` can import route modules without DATABASE_URL. */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = resolve();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
}

export const pool = lazy(getPool);
export const db = lazy(getDb);
