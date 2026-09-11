import type { Project } from "@/lib/types";

export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  templateKey: string | null;
  isTemplate: boolean;
  data: Project;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectSummaryRecord = Omit<ProjectRecord, "data">;

export type AssetRecord = {
  id: string;
  key: string;
  category: string;
  name: string;
  description: string;
  data: Record<string, unknown>;
  builtIn: boolean;
  createdAt: Date;
};

export type NewProject = {
  name: string;
  description?: string;
  templateKey?: string | null;
  isTemplate?: boolean;
  data: Project;
};

export type NewAsset = {
  key: string;
  category: string;
  name: string;
  description?: string;
  data: Record<string, unknown>;
  builtIn?: boolean;
};

export type Repo = {
  listProjectSummaries(): Promise<ProjectSummaryRecord[]>;
  getProject(id: string): Promise<ProjectRecord | null>;
  findProjectByTemplateKey(key: string): Promise<ProjectRecord | null>;
  insertProject(input: NewProject): Promise<{ id: string }>;
  updateProject(
    id: string,
    input: { data: Project; name: string; description: string },
  ): Promise<{ id: string; updatedAt: Date } | null>;
  deleteProject(id: string): Promise<void>;
  listAssets(): Promise<AssetRecord[]>;
  insertAsset(input: NewAsset): Promise<AssetRecord>;
  insertAssets(input: NewAsset[]): Promise<void>;
  ping(): Promise<void>;
};
