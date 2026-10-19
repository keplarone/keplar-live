import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), hostName: text("host_name").notNull(),
  title: text("title").notNull(), description: text("description").notNull(), category: text("category").notNull(),
  venue: text("venue").notNull(), city: text("city").notNull(), startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(), timezone: text("timezone").notNull(), capacity: integer("capacity").notNull(),
  theme: text("theme").notNull(), status: text("status").notNull().default("published"), createdAt: text("created_at").notNull(),
}, (t) => [index("events_owner").on(t.ownerId)]);
export const rsvps = sqliteTable("rsvps", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull().references(() => events.id),
  userId: text("user_id").notNull(), name: text("name").notNull(), email: text("email").notNull(), createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("rsvps_event_user").on(t.eventId, t.userId), index("rsvps_event").on(t.eventId)]);
