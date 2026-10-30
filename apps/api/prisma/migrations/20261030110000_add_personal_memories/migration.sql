-- CreateTable
CREATE TABLE "personal_memories" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "body" VARCHAR(3000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "personal_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_memories_owner_id_updated_at_id_idx" ON "personal_memories"("owner_id", "updated_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "personal_memories" ADD CONSTRAINT "personal_memories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 私人内容完整性：长度按字符计，空白字符串在数据库层也拒绝。
ALTER TABLE "personal_memories"
    ADD CONSTRAINT "personal_memories_title_length_check" CHECK (char_length("title") BETWEEN 1 AND 80),
    ADD CONSTRAINT "personal_memories_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 3000),
    ADD CONSTRAINT "personal_memories_title_not_blank_check" CHECK ("title" ~ '[^[:space:]]'),
    ADD CONSTRAINT "personal_memories_body_not_blank_check" CHECK ("body" ~ '[^[:space:]]');
