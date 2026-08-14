import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const multiplayerRooms = sqliteTable("multiplayer_rooms", {
  code: text("code").primaryKey(),
  hostToken: text("host_token").notNull(),
  guestToken: text("guest_token"),
  offer: text("offer"),
  answer: text("answer"),
  fogEnabled: integer("fog_enabled", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("waiting"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
