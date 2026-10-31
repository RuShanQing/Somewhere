-- TASK-013：双城日记。只新增表；正文仍只存于 postcards，本表只保存引用。
CREATE TABLE "diary_pages" (
    "id" UUID NOT NULL,
    "passage_id" UUID NOT NULL,
    "postcard_left_id" UUID NOT NULL,
    "postcard_right_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diary_pages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "diary_pages_passage_id_fkey" FOREIGN KEY ("passage_id")
        REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "diary_pages_postcard_left_id_fkey" FOREIGN KEY ("postcard_left_id")
        REFERENCES "postcards"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "diary_pages_postcard_right_id_fkey" FOREIGN KEY ("postcard_right_id")
        REFERENCES "postcards"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "diary_pages_not_self" CHECK ("postcard_left_id" <> "postcard_right_id")
);

CREATE UNIQUE INDEX "diary_pages_postcard_left_id_postcard_right_id_key"
    ON "diary_pages"("postcard_left_id", "postcard_right_id");

CREATE INDEX "diary_pages_passage_id_created_at_idx"
    ON "diary_pages"("passage_id", "created_at" DESC);
