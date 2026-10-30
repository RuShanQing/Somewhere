-- TASK-010：双向信友的最小单方同意记录。
-- 只新增枚举与表；聚合状态由服务层领域函数派生，不落库为单一关系行。

CREATE TYPE "PenpalConsentState" AS ENUM ('ALLOW', 'REVOKED');

CREATE TABLE "penpal_consents" (
    "owner_id" UUID NOT NULL,
    "counterpart_id" UUID NOT NULL,
    "consent_state" "PenpalConsentState" NOT NULL DEFAULT 'ALLOW',
    "consented_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "penpal_consents_pkey" PRIMARY KEY ("owner_id", "counterpart_id"),
    CONSTRAINT "penpal_consents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "penpal_consents_counterpart_id_fkey" FOREIGN KEY ("counterpart_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "penpal_consents_not_self" CHECK ("owner_id" <> "counterpart_id"),
    CONSTRAINT "penpal_consents_state_time" CHECK (
        ("consent_state" = 'ALLOW' AND "consented_at" IS NOT NULL AND "revoked_at" IS NULL)
        OR ("consent_state" = 'REVOKED' AND "revoked_at" IS NOT NULL)
    )
);

CREATE INDEX "penpal_consents_counterpart_id_consent_state_idx" ON "penpal_consents"("counterpart_id", "consent_state");
