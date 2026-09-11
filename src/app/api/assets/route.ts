import { getRepo } from "@/db";
import { ensureSeeded } from "@/lib/server/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const rows = await getRepo().listAssets();
    return Response.json(rows);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { category: string; name: string; description?: string; data: Record<string, unknown> };
    if (!body?.category || !body?.name || !body?.data) return Response.json({ error: "category, name and data are required" }, { status: 400 });
    const key = `${body.category}-${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
    const row = await getRepo().insertAsset({
      key,
      category: body.category,
      name: body.name,
      description: body.description ?? "",
      data: body.data,
      builtIn: false,
    });
    return Response.json(row, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
