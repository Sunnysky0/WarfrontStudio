import { createFileRepo } from "./file-repo";
import { createPgRepo } from "./pg-repo";
import type { Repo } from "./types";

const globalForDb = globalThis as typeof globalThis & {
  __arenaRepo?: Repo;
};

/** Postgres when DATABASE_URL is set; otherwise a local JSON file so `next dev` works without Postgres. */
export function getRepo(): Repo {
  if (!globalForDb.__arenaRepo) {
    const databaseUrl = process.env.DATABASE_URL;
    globalForDb.__arenaRepo = databaseUrl ? createPgRepo(databaseUrl) : createFileRepo();
  }
  return globalForDb.__arenaRepo;
}
