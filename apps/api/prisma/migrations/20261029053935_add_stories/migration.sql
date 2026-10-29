-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "StoryReviewStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "StoryRemovedBy" AS ENUM ('AUTHOR', 'MODERATOR');

-- CreateEnum
CREATE TYPE "StoryReviewDecision" AS ENUM ('APPROVE', 'REJECT', 'REMOVE');

-- CreateEnum
CREATE TYPE "StoryReviewReason" AS ENUM ('PRIVACY', 'CONTACT_INFO', 'HARASSMENT', 'ILLEGAL', 'OTHER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "body" VARCHAR(3000) NOT NULL,
    "topic_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "review_status" "StoryReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "public_consent_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "removed_by" "StoryRemovedBy",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_review_actions" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "moderator_id" UUID NOT NULL,
    "action" "StoryReviewDecision" NOT NULL,
    "reason_code" "StoryReviewReason",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_review_actions_pkey" PRIMARY KEY ("id")
);

-- CheckConstraints
ALTER TABLE "stories" ADD CONSTRAINT "stories_title_length_check"
  CHECK (char_length(btrim("title")) BETWEEN 1 AND 80);
ALTER TABLE "stories" ADD CONSTRAINT "stories_body_length_check"
  CHECK (char_length(btrim("body")) BETWEEN 20 AND 3000);
ALTER TABLE "stories" ADD CONSTRAINT "stories_topic_tags_count_check"
  CHECK (cardinality("topic_tags") <= 3);
ALTER TABLE "stories" ADD CONSTRAINT "stories_published_requires_approved_check"
  CHECK ("published_at" IS NULL OR "review_status" = 'APPROVED');
ALTER TABLE "stories" ADD CONSTRAINT "stories_reviewed_pair_check"
  CHECK (("reviewed_by_id" IS NULL) = ("reviewed_at" IS NULL));

-- CreateIndex
CREATE INDEX "stories_review_status_submitted_at_idx" ON "stories"("review_status", "submitted_at");

-- CreateIndex
CREATE INDEX "stories_review_status_city_id_published_at_idx" ON "stories"("review_status", "city_id", "published_at");
CREATE INDEX "stories_review_status_published_at_id_idx" ON "stories"("review_status", "published_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "stories_author_id_created_at_idx" ON "stories"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "story_review_actions_story_id_created_at_idx" ON "story_review_actions"("story_id", "created_at");

-- CreateIndex
CREATE INDEX "story_review_actions_moderator_id_created_at_idx" ON "story_review_actions"("moderator_id", "created_at");

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_review_actions" ADD CONSTRAINT "story_review_actions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_review_actions" ADD CONSTRAINT "story_review_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
