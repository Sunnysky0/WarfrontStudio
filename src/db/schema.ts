import { pgTable, uuid, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * A warfront animation project. The full editable document (nations, events,
 * map settings, camera...) is stored as JSON in `data`.
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  data: jsonb("data").notNull(),
  thumbnail: text("thumbnail"),
  durationSeconds: integer("duration_seconds").notNull().default(60),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * User-uploaded / user-made reusable assets (custom flags, emblems, images).
 * `data` holds a data-URL or a serialized flag spec.
 */
export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // 'flag' | 'image' | 'marker'
  data: text("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
