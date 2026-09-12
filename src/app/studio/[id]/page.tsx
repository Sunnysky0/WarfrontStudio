import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import Studio from "@/components/studio/Studio";
import type { ProjectDoc } from "@/lib/studio/types";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let row: typeof projects.$inferSelect | undefined;
  try {
    [row] = await db.select().from(projects).where(eq(projects.id, id));
  } catch {
    row = undefined;
  }
  if (!row) notFound();
  return <Studio projectId={row.id} initial={row.data as ProjectDoc} />;
}
