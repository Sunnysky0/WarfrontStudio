import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(assets).orderBy(desc(assets.createdAt));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name: string; kind: string; data: string };
    if (!body?.name || !body?.kind || !body?.data) return NextResponse.json({ error: "name, kind and data are required" }, { status: 400 });
    if (body.data.length > 2_000_000) return NextResponse.json({ error: "Asset too large (max 2MB)" }, { status: 413 });
    const [row] = await db.insert(assets).values({ name: body.name, kind: body.kind, data: body.data }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await db.delete(assets).where(eq(assets.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
