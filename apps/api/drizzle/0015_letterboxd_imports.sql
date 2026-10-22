CREATE TABLE "letterboxd_imports" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"error" text,
	"counts" jsonb NOT NULL,
	"unmatched" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"not_rated" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "letterboxd_imports" ADD CONSTRAINT "letterboxd_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;