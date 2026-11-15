ALTER TABLE "cyborgs" ADD COLUMN "look_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cyborgs" ALTER COLUMN "appearance" DROP NOT NULL;