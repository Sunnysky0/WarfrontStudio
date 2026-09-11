import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Project } from "@/lib/types";
import type { AssetRecord, NewAsset, NewProject, ProjectRecord, Repo } from "./types";

type DiskStore = {
  projects: Array<Omit<ProjectRecord, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }>;
  assets: Array<Omit<AssetRecord, "createdAt"> & { createdAt: string }>;
};

function hydrate(raw: DiskStore): { projects: ProjectRecord[]; assets: AssetRecord[] } {
  return {
    projects: raw.projects.map((p) => ({
      ...p,
      data: p.data as Project,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    })),
    assets: raw.assets.map((a) => ({
      ...a,
      createdAt: new Date(a.createdAt),
    })),
  };
}

export function createFileRepo(filePath = path.join(process.cwd(), ".data", "store.json")): Repo {
  let mem: { projects: ProjectRecord[]; assets: AssetRecord[] } | null = null;
  let chain = Promise.resolve();

  const lock = async <T>(fn: () => Promise<T>): Promise<T> => {
    let release!: () => void;
    const prev = chain;
    chain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const load = async () => {
    if (mem) return mem;
    try {
      const raw = JSON.parse(await readFile(filePath, "utf8")) as DiskStore;
      mem = hydrate(raw);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw e;
      mem = { projects: [], assets: [] };
    }
    return mem;
  };

  const persist = async () => {
    if (!mem) return;
    await mkdir(path.dirname(filePath), { recursive: true });
    const disk: DiskStore = {
      projects: mem.projects.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      assets: mem.assets.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
    };
    await writeFile(filePath, JSON.stringify(disk, null, 2), "utf8");
  };

  return {
    async listProjectSummaries() {
      return lock(async () => {
        const s = await load();
        return [...s.projects]
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            templateKey: p.templateKey,
            isTemplate: p.isTemplate,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          }));
      });
    },

    async getProject(id) {
      return lock(async () => {
        const s = await load();
        return s.projects.find((p) => p.id === id) ?? null;
      });
    },

    async findProjectByTemplateKey(key) {
      return lock(async () => {
        const s = await load();
        return s.projects.find((p) => p.templateKey === key) ?? null;
      });
    },

    async insertProject(input: NewProject) {
      return lock(async () => {
        const s = await load();
        const now = new Date();
        const row: ProjectRecord = {
          id: crypto.randomUUID(),
          name: input.name,
          description: input.description ?? "",
          templateKey: input.templateKey ?? null,
          isTemplate: input.isTemplate ?? false,
          data: input.data,
          createdAt: now,
          updatedAt: now,
        };
        s.projects.push(row);
        await persist();
        return { id: row.id };
      });
    },

    async updateProject(id, input) {
      return lock(async () => {
        const s = await load();
        const row = s.projects.find((p) => p.id === id);
        if (!row) return null;
        row.data = { ...input.data, name: input.name };
        row.name = input.name;
        row.description = input.description;
        row.updatedAt = new Date();
        await persist();
        return { id: row.id, updatedAt: row.updatedAt };
      });
    },

    async deleteProject(id) {
      return lock(async () => {
        const s = await load();
        s.projects = s.projects.filter((p) => p.id !== id);
        await persist();
      });
    },

    async listAssets() {
      return lock(async () => {
        const s = await load();
        return [...s.assets].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      });
    },

    async insertAsset(input: NewAsset) {
      return lock(async () => {
        const s = await load();
        const row: AssetRecord = {
          id: crypto.randomUUID(),
          key: input.key,
          category: input.category,
          name: input.name,
          description: input.description ?? "",
          data: input.data,
          builtIn: input.builtIn ?? false,
          createdAt: new Date(),
        };
        s.assets.push(row);
        await persist();
        return row;
      });
    },

    async insertAssets(input: NewAsset[]) {
      return lock(async () => {
        if (!input.length) return;
        const s = await load();
        const now = new Date();
        for (const item of input) {
          s.assets.push({
            id: crypto.randomUUID(),
            key: item.key,
            category: item.category,
            name: item.name,
            description: item.description ?? "",
            data: item.data,
            builtIn: item.builtIn ?? false,
            createdAt: now,
          });
        }
        await persist();
      });
    },

    async ping() {
      await lock(async () => {
        await load();
      });
    },
  };
}
