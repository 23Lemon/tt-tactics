import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

type Target = { zone: string; point?: { lateral: number; depth: number } };
type Step = Target & (
  { family: string; spin: string; strength: string; position?: number; distance?: number; pace?: string } |
  { tech: string; label?: string }
);

export const routines = sqliteTable("routines", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  title: text("title").notNull(),
  mode: text("mode", { enum: ["serve", "receive"] }).notNull(),
  hand: text("hand", { enum: ["right", "left"] }).notNull(),
  myHand: text("my_hand", { enum: ["right", "left"] }).notNull().default("right"),
  steps: text("steps", { mode: "json" }).$type<Step[]>().notNull(),
  category: text("category").notNull().default(""),
  note: text("note").notNull(),
  status: text("status", { enum: ["using", "practice"] }).notNull(),
  revision: integer("revision").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("routines_owner_updated").on(table.owner, table.updatedAt),
]);

export const playerPreferences = sqliteTable("player_preferences", {
  owner: text("owner").primaryKey(),
  groups: text("receive_groups", { mode: "json" }).$type<string[]>().notNull(),
  revision: integer("revision").notNull(),
});
