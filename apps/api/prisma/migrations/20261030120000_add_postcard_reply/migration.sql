-- TASK-012：共途内回信与回复引用。
-- 只新增可空列、外键、检查约束与索引；既有行保持 reply_to_postcard_id = NULL。

ALTER TABLE "postcard_drafts" ADD COLUMN "reply_to_postcard_id" UUID;
ALTER TABLE "postcards" ADD COLUMN "reply_to_postcard_id" UUID;

ALTER TABLE "postcard_drafts"
    ADD CONSTRAINT "postcard_drafts_reply_to_postcard_id_fkey"
    FOREIGN KEY ("reply_to_postcard_id") REFERENCES "postcards"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "postcards"
    ADD CONSTRAINT "postcards_reply_to_postcard_id_fkey"
    FOREIGN KEY ("reply_to_postcard_id") REFERENCES "postcards"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "postcards"
    ADD CONSTRAINT "postcards_reply_not_self"
    CHECK ("reply_to_postcard_id" <> "id");

-- PostgreSQL 的唯一索引允许任意多个 NULL，因此非空值最多只出现一次。
CREATE UNIQUE INDEX "postcards_reply_to_postcard_id_key"
    ON "postcards"("reply_to_postcard_id");

CREATE INDEX "postcard_drafts_reply_to_postcard_id_idx"
    ON "postcard_drafts"("reply_to_postcard_id");
