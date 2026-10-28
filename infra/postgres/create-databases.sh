#!/usr/bin/env bash
# 本地开发 / 测试数据库初始化（幂等）。全部为虚构的开发凭据，禁止用于生产。
set -euo pipefail

ROLE_NAME="${SOMEWHERE_DB_ROLE:-somewhere}"
ROLE_PASSWORD="${SOMEWHERE_DB_PASSWORD:-somewhere_dev_pw}"
DEV_DB="${SOMEWHERE_DEV_DB:-somewhere_dev}"
TEST_DB="${SOMEWHERE_TEST_DB:-somewhere_test}"

if ! command -v psql >/dev/null 2>&1; then
  echo "未找到 psql。请先安装 PostgreSQL 17（例如 brew install postgresql@17）并把 bin 加入 PATH。" >&2
  exit 1
fi

psql -d postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE_NAME}') THEN
    CREATE ROLE ${ROLE_NAME} LOGIN PASSWORD '${ROLE_PASSWORD}' CREATEDB;
  END IF;
END
\$\$;
SQL

for database in "${DEV_DB}" "${TEST_DB}"; do
  if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${database}'" | grep -q 1; then
    createdb -O "${ROLE_NAME}" "${database}"
    echo "created database ${database}"
  else
    echo "database ${database} already exists"
  fi
done

echo "数据库准备完成：${DEV_DB}（开发） / ${TEST_DB}（测试）"
