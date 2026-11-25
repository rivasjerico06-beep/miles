CREATE TYPE "public"."user_role" AS ENUM('student', 'parent', 'teacher');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"school_date" date NOT NULL,
	"status" text NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_in_via" text,
	"check_out_at" timestamp with time zone,
	"check_out_via" text,
	"arrived_home_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_passes" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"school_date" date NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"type" text NOT NULL,
	"detail" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"firmware" text,
	"last_seen_at" timestamp with time zone,
	"last_boot_at" timestamp with time zone,
	"last_reset_reason" text,
	"rssi" integer,
	"uptime_s" integer,
	"free_heap" integer,
	"free_psram" integer,
	"scans" integer,
	"accepted" integer,
	"rejected" integer,
	"decode_fails" integer,
	"http_errors" integer,
	"wifi_reconnects" integer
);
--> statement-breakpoint
CREATE TABLE "location_pings" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy_m" double precision,
	"remaining_km" double precision,
	"eta_minutes" integer,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_user_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"maps_url" text,
	"event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"push_status" text,
	"push_sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"delivered_via" text,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"device_id" text,
	"student_id" integer,
	"action" text,
	"result" text NOT NULL,
	"reason" text,
	"late" boolean,
	"http_status" integer,
	"processing_ms" integer,
	"device_round_trip_ms" integer
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sos_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"accuracy_m" double precision,
	"location_source" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"student_number" text NOT NULL,
	"full_name" text NOT NULL,
	"grade_section" text NOT NULL,
	"parent_user_id" integer,
	"parent_linked_at" timestamp with time zone,
	"link_code_hash" text,
	"link_code_expires_at" timestamp with time zone,
	"home_lat" double precision,
	"home_lng" double precision,
	"home_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"school_date" date NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"start_lat" double precision NOT NULL,
	"start_lng" double precision NOT NULL,
	"initial_remaining_km" double precision NOT NULL,
	"initial_eta_minutes" integer NOT NULL,
	"predicted_arrival_at" timestamp with time zone NOT NULL,
	"last_lat" double precision,
	"last_lng" double precision,
	"last_accuracy_m" double precision,
	"last_fix_at" timestamp with time zone,
	"remaining_km" double precision,
	"eta_minutes" integer,
	"eta_at" timestamp with time zone,
	"speed_kmh" double precision,
	"arrived_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"eta_error_minutes" double precision
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"grade_section" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_passes" ADD CONSTRAINT "daily_passes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_logs" ADD CONSTRAINT "scan_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_student_date_idx" ON "attendance" USING btree ("student_id","school_date");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("school_date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_passes_token_idx" ON "daily_passes" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_passes_student_date_idx" ON "daily_passes" USING btree ("student_id","school_date");--> statement-breakpoint
CREATE INDEX "device_events_idx" ON "device_events" USING btree ("device_id","at");--> statement-breakpoint
CREATE INDEX "location_pings_trip_idx" ON "location_pings" USING btree ("trip_id","recorded_at");--> statement-breakpoint
CREATE INDEX "notifications_parent_idx" ON "notifications" USING btree ("parent_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scan_logs_received_idx" ON "scan_logs" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sos_student_idx" ON "sos_alerts" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "students_user_idx" ON "students" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_number_idx" ON "students" USING btree ("student_number");--> statement-breakpoint
CREATE UNIQUE INDEX "students_parent_idx" ON "students" USING btree ("parent_user_id");--> statement-breakpoint
CREATE INDEX "trips_student_idx" ON "trips" USING btree ("student_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");