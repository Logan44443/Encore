CREATE TABLE "catalog_imports" (
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"error" text,
	"counts" jsonb NOT NULL,
	"unmatched" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"not_rated" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "catalog_imports_user_id_source_pk" PRIMARY KEY("user_id","source")
);
--> statement-breakpoint
ALTER TABLE "catalog_imports" ADD CONSTRAINT "catalog_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "catalog_imports" ("user_id", "source", "status", "done", "total", "error", "counts", "unmatched", "not_rated", "started_at", "finished_at")
SELECT "user_id", 'letterboxd', "status", "done", "total", "error", "counts", "unmatched", "not_rated", "started_at", "finished_at" FROM "letterboxd_imports";
