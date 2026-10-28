-- CreateEnum
CREATE TYPE "PostcardStatus" AS ENUM ('IN_TRANSIT', 'DELIVERED', 'RESTRICTED');

-- CreateTable
CREATE TABLE "postcard_drafts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "recipient_id" UUID,
    "body" VARCHAR(2000) NOT NULL,
    "sent_postcard_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "postcard_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postcards" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "status" "PostcardStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "origin_city_id" UUID NOT NULL,
    "destination_city_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL,
    "deliver_at" TIMESTAMPTZ(3) NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),
    "idempotency_key" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "postcards_pkey" PRIMARY KEY ("id")
);

-- 业务约束：正文不能为空白；寄件人与收件人不能相同；时间顺序不可倒置。
ALTER TABLE "postcard_drafts"
    ADD CONSTRAINT "postcard_drafts_body_length_check"
    CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);

ALTER TABLE "postcards"
    ADD CONSTRAINT "postcards_body_length_check"
    CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);

ALTER TABLE "postcards"
    ADD CONSTRAINT "postcards_distinct_participants_check"
    CHECK ("sender_id" <> "receiver_id");

ALTER TABLE "postcards"
    ADD CONSTRAINT "postcards_delivery_time_order_check"
    CHECK ("deliver_at" >= "sent_at");

ALTER TABLE "postcards"
    ADD CONSTRAINT "postcards_delivered_time_order_check"
    CHECK ("delivered_at" IS NULL OR "delivered_at" >= "deliver_at");

-- CreateIndex
CREATE UNIQUE INDEX "postcard_drafts_sent_postcard_id_key" ON "postcard_drafts"("sent_postcard_id");

-- CreateIndex
CREATE INDEX "postcard_drafts_owner_id_updated_at_idx" ON "postcard_drafts"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "postcard_drafts_recipient_id_idx" ON "postcard_drafts"("recipient_id");

-- CreateIndex
CREATE INDEX "postcards_receiver_id_status_deliver_at_idx" ON "postcards"("receiver_id", "status", "deliver_at");

-- CreateIndex
CREATE INDEX "postcards_status_deliver_at_idx" ON "postcards"("status", "deliver_at");

-- CreateIndex
CREATE INDEX "postcards_sender_id_status_idx" ON "postcards"("sender_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "postcards_sender_id_idempotency_key_key" ON "postcards"("sender_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "postcard_drafts" ADD CONSTRAINT "postcard_drafts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postcard_drafts" ADD CONSTRAINT "postcard_drafts_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postcard_drafts" ADD CONSTRAINT "postcard_drafts_sent_postcard_id_fkey" FOREIGN KEY ("sent_postcard_id") REFERENCES "postcards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postcards" ADD CONSTRAINT "postcards_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postcards" ADD CONSTRAINT "postcards_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postcards" ADD CONSTRAINT "postcards_origin_city_id_fkey" FOREIGN KEY ("origin_city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postcards" ADD CONSTRAINT "postcards_destination_city_id_fkey" FOREIGN KEY ("destination_city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
