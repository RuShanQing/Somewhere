-- AlterTable
ALTER TABLE "postcard_drafts" ADD COLUMN "passage_id" UUID;

-- AlterTable
ALTER TABLE "postcards" ADD COLUMN "passage_id" UUID;

-- CreateIndex
CREATE INDEX "postcard_drafts_passage_id_idx" ON "postcard_drafts"("passage_id");

-- CreateIndex
CREATE INDEX "postcards_passage_id_idx" ON "postcards"("passage_id");

-- AddForeignKey
ALTER TABLE "postcard_drafts" ADD CONSTRAINT "postcard_drafts_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postcards" ADD CONSTRAINT "postcards_passage_id_fkey" FOREIGN KEY ("passage_id") REFERENCES "passages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
