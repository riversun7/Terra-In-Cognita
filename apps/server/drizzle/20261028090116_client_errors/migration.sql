CREATE TABLE "client_errors" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "client_errors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_build" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"page" text,
	"user_agent" text
);
