import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { greatAsianWarTemplate } from "@/lib/studio/template";
import { emptyProject } from "@/lib/studio/presets";
import type { ProjectDoc } from "@/lib/studio/types";

export const dynamic = "force-dynamic";

async function ensureSeed() {
  const rows = await db.select({ id: projects.id }).from(projects).limit(1);
  if (rows.length === 0) {
    const doc = greatAsianWarTemplate();
    await db.insert(projects).values({
      name: doc.name,
      description: doc.description,
      data: doc,
      durationSeconds: Math.round(doc.duration),
    });
  }
}

export async function GET() {
  try {
    await ensureSeed();
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        durationSeconds: projects.durationSeconds,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        thumbnail: projects.thumbnail,
      })
      .from(projects)
      .orderBy(desc(projects.updatedAt));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { name?: string; template?: string; data?: ProjectDoc };
    let doc: ProjectDoc;
    if (body.data) doc = body.data;
    else if (body.template === "great-asian-war") doc = greatAsianWarTemplate();
    else doc = emptyProject(body.name ?? "Untitled warfront");
    if (body.name) doc.name = body.name;
    const [row] = await db
      .insert(projects)
      .values({ name: doc.name, description: doc.description ?? "", data: doc, durationSeconds: Math.round(doc.duration) })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
