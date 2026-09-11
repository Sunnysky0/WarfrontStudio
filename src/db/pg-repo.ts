import { asc, desc, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { assets, projects } from "./schema";
import type { AssetRecord, NewAsset, NewProject, ProjectRecord, Repo } from "./types";
import type { Project } from "@/lib/types";

function asProject(data: unknown): Project {
  return data as Project;
}

function asAssetData(data: unknown): Record<string, unknown> {
  return (data ?? {}) as Record<string, unknown>;
}

export function createPgRepo(databaseUrl: string): Repo {
  const pool = new Pool({ connectionString: databaseUrl });
  const db: NodePgDatabase = drizzle(pool);

  return {
    async listProjectSummaries() {
      return db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          isTemplate: projects.isTemplate,
          templateKey: projects.templateKey,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .orderBy(desc(projects.updatedAt));
    },

    async getProject(id) {
      const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      if (!row) return null;
      return { ...row, data: asProject(row.data) };
    },

    async findProjectByTemplateKey(key) {
      const [row] = await db.select().from(projects).where(eq(projects.templateKey, key)).limit(1);
      if (!row) return null;
      return { ...row, data: asProject(row.data) };
    },

    async insertProject(input: NewProject) {
      const [row] = await db
        .insert(projects)
        .values({
          name: input.name,
          description: input.description ?? "",
          data: input.data,
          isTemplate: input.isTemplate ?? false,
          templateKey: input.templateKey ?? null,
        })
        .returning({ id: projects.id });
      return { id: row.id };
    },

    async updateProject(id, input) {
      const [row] = await db
        .update(projects)
        .set({
          data: { ...input.data, name: input.name },
          name: input.name,
          description: input.description,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning({ id: projects.id, updatedAt: projects.updatedAt });
      return row ?? null;
    },

    async deleteProject(id) {
      await db.delete(projects).where(eq(projects.id, id));
    },

    async listAssets() {
      const rows = await db.select().from(assets).orderBy(asc(assets.category), asc(assets.name));
      return rows.map((row) => ({ ...row, data: asAssetData(row.data) }));
    },

    async insertAsset(input: NewAsset) {
      const [row] = await db
        .insert(assets)
        .values({
          key: input.key,
          category: input.category,
          name: input.name,
          description: input.description ?? "",
          data: input.data,
          builtIn: input.builtIn ?? false,
        })
        .returning();
      return { ...row, data: asAssetData(row.data) } satisfies AssetRecord;
    },

    async insertAssets(input: NewAsset[]) {
      if (!input.length) return;
      await db.insert(assets).values(
        input.map((item) => ({
          key: item.key,
          category: item.category,
          name: item.name,
          description: item.description ?? "",
          data: item.data,
          builtIn: item.builtIn ?? false,
        })),
      );
    },

    async ping() {
      await db.execute(sql`select 1`);
    },
  };
}
