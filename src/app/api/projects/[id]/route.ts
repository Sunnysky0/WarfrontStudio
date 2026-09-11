import { getRepo } from "@/db";
import { ensureSeeded } from "@/lib/server/seed";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await ensureSeeded();
    const { id } = await ctx.params;
    const row = await getRepo().getProject(id);
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(row);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { data: Project; name?: string };
    if (!body?.data) return Response.json({ error: "Missing data" }, { status: 400 });
    const name = body.name ?? body.data.name ?? "Untitled";
    const row = await getRepo().updateProject(id, {
      data: { ...body.data, name },
      name,
      description: body.data.description ?? "",
    });
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(row);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const db = getRepo();
    const row = await db.getProject(id);
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    if (row.isTemplate) return Response.json({ error: "The built-in template cannot be deleted" }, { status: 400 });
    await db.deleteProject(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
