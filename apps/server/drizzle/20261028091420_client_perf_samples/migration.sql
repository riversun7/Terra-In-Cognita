CREATE TABLE "client_perf_samples" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "client_perf_samples_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_build" text NOT NULL,
	"page" text,
	"user_agent" text,
	"window_sec" real NOT NULL,
	"frames" integer NOT NULL,
	"fps" real NOT NULL,
	"frame_p50_ms" real NOT NULL,
	"frame_p95_ms" real NOT NULL,
	"frame_max_ms" real NOT NULL,
	"long_frames" integer NOT NULL,
	"memory_mb" real,
	"device" jsonb NOT NULL
);
