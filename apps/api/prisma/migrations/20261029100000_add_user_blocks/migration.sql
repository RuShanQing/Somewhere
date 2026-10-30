-- TASK-009：用户级最小封锁。
-- 只新增表；封锁是单向记录，但通信拦截由服务层对双方生效。

CREATE TABLE "user_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id"),
    CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_blocks_not_self" CHECK ("blocker_id" <> "blocked_id")
);

CREATE INDEX "user_blocks_blocked_id_created_at_idx" ON "user_blocks"("blocked_id", "created_at");
