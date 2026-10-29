-- CreateEnum
CREATE TYPE "PassageKind" AS ENUM ('ONE_OFF', 'ONGOING', 'SEASONAL');

-- CreateEnum
CREATE TYPE "PassageProgressStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PassageConsentState" AS ENUM ('ALLOW', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PassageEventType" AS ENUM ('CREATED', 'PAUSED', 'RESUMED', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "passages" (
    "id" UUID NOT NULL,
    "topic" VARCHAR(80) NOT NULL,
    "kind" "PassageKind" NOT NULL,
    "progress_status" "PassageProgressStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passage_participants" (
    "passage_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "consent_state" "PassageConsentState" NOT NULL DEFAULT 'ALLOW',
    "paused_at" TIMESTAMPTZ(3),
    "last_confirmed_at" TIMESTAMPTZ(3),

    CONSTRAINT "passage_participants_pkey" PRIMARY KEY ("passage_id","user_id")
);

-- CreateTable
CREATE TABLE "passage_events" (
    "id" UUID NOT NULL,
    "passage_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "event_type" "PassageEventType" NOT NULL,
    "metadata_redacted" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passage_events_pkey" PRIMARY KEY ("id")
);

-- CheckConstraints
ALTER TABLE "passages" ADD CONSTRAINT "passages_topic_length_check"
  CHECK (char_length(btrim("topic")) BETWEEN 1 AND 80);
ALTER TABLE "passages" ADD CONSTRAINT "passages_completed_at_check"
  CHECK ("progress_status" <> 'COMPLETED' OR "completed_at" IS NOT NULL);
ALTER TABLE "passages" ADD CONSTRAINT "passages_archived_at_check"
  CHECK ("progress_status" <> 'ARCHIVED' OR "archived_at" IS NOT NULL);
ALTER TABLE "passage_participants" ADD CONSTRAINT "passage_participants_paused_check"
  CHECK (("consent_state" = 'PAUSED') = ("paused_at" IS NOT NULL));

-- CreateIndex
CREATE INDEX "passages_progress_status_updated_at_idx" ON "passages"("progress_status", "updated_at");

-- CreateIndex
CREATE INDEX "passage_participants_user_id_passage_id_idx" ON "passage_participants"("user_id", "passage_id");

-- CreateIndex
CREATE INDEX "passage_events_passage_id_created_at_idx" ON "passage_events"("passage_id", "created_at");

-- AddForeignKey
ALTER TABLE "passage_participants" ADD CONSTRAINT "passage_participants_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passage_participants" ADD CONSTRAINT "passage_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passage_events" ADD CONSTRAINT "passage_events_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passage_events" ADD CONSTRAINT "passage_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
