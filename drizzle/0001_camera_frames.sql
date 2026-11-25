CREATE TABLE "camera_frames" (
	"device_id" text PRIMARY KEY NOT NULL,
	"jpeg_base64" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"seq" integer NOT NULL,
	"stats" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
