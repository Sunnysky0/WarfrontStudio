import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import type { ProjectDoc } from "@/lib/studio/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = (await req.json()) as { name?: string; data?: ProjectDoc; thumbnail?: string | null };
    const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
    if (body.data) {
      patch.data = body.data;
      patch.name = body.data.name;
      patch.description = body.data.description ?? "";
      patch.durationSeconds = Math.round(body.data.duration);
    }
    if (body.name) patch.name = body.name;
    if (body.thumbnail !== undefined) patch.thumbnail = body.thumbnail;
    const [row] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
