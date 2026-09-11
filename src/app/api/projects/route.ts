import { getRepo } from "@/db";
import { ensureSeeded } from "@/lib/server/seed";
import { createBlankProject, createWwiTemplate } from "@/lib/templates/wwi";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const rows = await getRepo().listProjectSummaries();
    return Response.json(rows);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeeded();
    const db = getRepo();
    const body = (await req.json().catch(() => ({}))) as { name?: string; from?: "wwi" | "blank"; cloneOf?: string; data?: Project };
    let data: Project;
    let name = body.name;
    if (body.data) {
      data = body.data;
      name = name ?? data.name;
    } else if (body.cloneOf) {
      const src = await db.getProject(body.cloneOf);
      if (!src) return Response.json({ error: "Source project not found" }, { status: 404 });
      data = src.data;
      name = name ?? `${src.name} (copy)`;
    } else if (body.from === "wwi") {
      data = createWwiTemplate();
      name = name ?? "My WWI warfront";
    } else {
      data = createBlankProject(name);
    }
    data = { ...data, name: name ?? data.name };
    const row = await db.insertProject({
      name: data.name,
      description: data.description ?? "",
      data,
      isTemplate: false,
      templateKey: body.from === "wwi" || body.cloneOf ? "wwi-derived" : null,
    });
    return Response.json({ id: row.id }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
