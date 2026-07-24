ALTER TABLE "decisions" ADD COLUMN "suggested_outcome" "decision_outcome";--> statement-breakpoint
ALTER TABLE "threshold_settings" ADD COLUMN "min_pass_pct" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "threshold_settings" ADD COLUMN "backup_floor_pct" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "threshold_settings" ADD COLUMN "quiz_pass_score" integer DEFAULT 70 NOT NULL;