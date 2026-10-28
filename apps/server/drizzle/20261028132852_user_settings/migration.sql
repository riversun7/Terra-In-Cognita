CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY,
	"theme" text,
	"follow_system" boolean DEFAULT false NOT NULL,
	"locale" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_theme_format" CHECK ("theme" ~ '^[a-z][a-z0-9_]{0,31}$'),
	CONSTRAINT "user_settings_locale_format" CHECK ("locale" ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$')
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;