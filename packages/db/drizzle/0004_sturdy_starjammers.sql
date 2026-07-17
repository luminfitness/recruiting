CREATE TABLE "interview_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_booking_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"offset_hours" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tm_outreach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "threshold_settings" ADD COLUMN "reminder_offsets_hours" jsonb DEFAULT '[24, 1]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_reminders" ADD CONSTRAINT "interview_reminders_session_booking_id_session_bookings_id_fk" FOREIGN KEY ("session_booking_id") REFERENCES "public"."session_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_reminders" ADD CONSTRAINT "interview_reminders_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_outreach" ADD CONSTRAINT "tm_outreach_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tm_outreach" ADD CONSTRAINT "tm_outreach_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_reminders_once_idx" ON "interview_reminders" USING btree ("session_booking_id","offset_hours");