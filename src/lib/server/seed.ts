import { getRepo } from "@/db";
import { BUILTIN_ASSETS } from "@/lib/assets";
import { createWwiTemplate } from "@/lib/templates/wwi";

let seeded = false;

/** Idempotently seed the WWI template project and the built-in asset library. */
export async function ensureSeeded() {
  if (seeded) return;
  const db = getRepo();
  const existing = await db.findProjectByTemplateKey("wwi");
  if (!existing) {
    const tpl = createWwiTemplate();
    await db.insertProject({
      name: tpl.name,
      description: tpl.description,
      templateKey: "wwi",
      isTemplate: true,
      data: tpl,
    });
  }
  const have = await db.listAssets();
  const haveKeys = new Set(have.map((a) => a.key));
  const missing = BUILTIN_ASSETS.filter((a) => !haveKeys.has(a.key));
  if (missing.length) {
    await db.insertAssets(
      missing.map((a) => ({
        key: a.key,
        category: a.category,
        name: a.name,
        description: a.description,
        data: a.data,
        builtIn: true,
      })),
    );
  }
  seeded = true;
}
