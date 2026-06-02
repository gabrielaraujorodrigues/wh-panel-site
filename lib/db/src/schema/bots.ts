import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botsTable = pgTable("bots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  gitUrl: text("git_url").notNull(),
  command: text("command").notNull().default("npm start"),
  status: text("status").notNull().default("stopped"),
  pid: integer("pid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBotSchema = createInsertSchema(botsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBot = z.infer<typeof insertBotSchema>;
export type Bot = typeof botsTable.$inferSelect;
