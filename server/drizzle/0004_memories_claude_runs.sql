CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"path" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'claude' NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claude_runs" (
	"job_id" text PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"resumed" boolean DEFAULT false NOT NULL,
	"prompt" text NOT NULL,
	"cwd" text,
	"model" text,
	"permission_mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_runs" ADD CONSTRAINT "claude_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claude_runs" ADD CONSTRAINT "claude_runs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memories_device_idx" ON "memories" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "memories_title_idx" ON "memories" USING btree (lower("title"));--> statement-breakpoint
CREATE INDEX "claude_runs_device_created_idx" ON "claude_runs" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE INDEX "claude_runs_session_idx" ON "claude_runs" USING btree ("session_id");