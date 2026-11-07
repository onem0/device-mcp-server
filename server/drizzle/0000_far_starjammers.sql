CREATE TYPE "public"."job_status" AS ENUM('running', 'exited', 'killed', 'timeout', 'failed', 'lost');--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"hostname" text,
	"os" text,
	"kernel" text,
	"arch" text,
	"username" text,
	"home_dir" text,
	"daemon_version" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"command" text NOT NULL,
	"cwd" text,
	"background" boolean DEFAULT false NOT NULL,
	"timeout_seconds" integer,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"exit_code" integer,
	"signal" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"command" text NOT NULL,
	"job_id" text,
	"status" text NOT NULL,
	"exit_code" integer,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panel_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_name_lower_unique" ON "devices" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_hash_unique" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "jobs_device_started_idx" ON "jobs" USING btree ("device_id","started_at");--> statement-breakpoint
CREATE INDEX "audit_log_device_created_idx" ON "audit_log" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_job_idx" ON "audit_log" USING btree ("job_id");