ALTER TABLE "audit_log" ALTER COLUMN "device_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "read_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "args" jsonb;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");