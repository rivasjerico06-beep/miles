ALTER TABLE "daily_passes" ADD COLUMN "token_issued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_passes" ADD COLUMN "previous_token" text;--> statement-breakpoint
CREATE INDEX "daily_passes_previous_token_idx" ON "daily_passes" USING btree ("previous_token");--> statement-breakpoint
-- Codes made before this change count from when their pass was created, so they are already expired.
UPDATE "daily_passes" SET "token_issued_at" = "created_at";
