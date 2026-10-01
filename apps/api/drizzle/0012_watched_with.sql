CREATE TABLE "watch_companions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title_entry_id" uuid,
	"live_show_id" uuid,
	"friend_id" uuid,
	"name" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companions_one_target" CHECK (num_nonnulls("watch_companions"."title_entry_id", "watch_companions"."live_show_id") = 1),
	CONSTRAINT "companions_one_person" CHECK (num_nonnulls("watch_companions"."friend_id", "watch_companions"."name") = 1)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "allow_tags" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "watch_companions" ADD CONSTRAINT "watch_companions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_companions" ADD CONSTRAINT "watch_companions_title_entry_id_title_entries_id_fk" FOREIGN KEY ("title_entry_id") REFERENCES "public"."title_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_companions" ADD CONSTRAINT "watch_companions_live_show_id_live_shows_id_fk" FOREIGN KEY ("live_show_id") REFERENCES "public"."live_shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_companions" ADD CONSTRAINT "watch_companions_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companions_entry_idx" ON "watch_companions" USING btree ("title_entry_id");--> statement-breakpoint
CREATE INDEX "companions_show_idx" ON "watch_companions" USING btree ("live_show_id");--> statement-breakpoint
CREATE INDEX "companions_friend_idx" ON "watch_companions" USING btree ("friend_id","confirmed");--> statement-breakpoint
CREATE UNIQUE INDEX "companions_entry_friend_idx" ON "watch_companions" USING btree ("title_entry_id","friend_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companions_show_friend_idx" ON "watch_companions" USING btree ("live_show_id","friend_id");