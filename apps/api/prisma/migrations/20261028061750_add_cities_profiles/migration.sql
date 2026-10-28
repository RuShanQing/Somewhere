-- CreateEnum
CREATE TYPE "ReceptionMode" AS ENUM ('OPEN', 'RESTING', 'CLOSED');

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "centroid_lat" DOUBLE PRECISION NOT NULL,
    "centroid_lon" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "city_id" UUID,
    "reception_mode" "ReceptionMode" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "cities_country_code_idx" ON "cities"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_country_code_key" ON "cities"("name", "country_code");

-- CreateIndex
CREATE INDEX "profiles_city_id_idx" ON "profiles"("city_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
