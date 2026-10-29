-- 撤回/下架需要保留历史 published_at，公开可见性由 status + archived_at 决定。
ALTER TABLE "stories" DROP CONSTRAINT "stories_published_requires_approved_check";
ALTER TABLE "stories" ADD CONSTRAINT "stories_published_requires_approved_check"
  CHECK ("published_at" IS NULL OR "review_status" IN ('APPROVED', 'REMOVED'));
