import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = join(root, 'apps/api');
const exporter = join(apiRoot, 'dist/tools/export-openapi.js');

if (!existsSync(exporter)) {
  process.stdout.write('[api-client] 未找到编译产物，先构建 API\n');
  execFileSync('pnpm', ['--filter', '@somewhere/api', 'build'], { cwd: root, stdio: 'inherit' });
}

const tmpDir = mkdtempSync(join(tmpdir(), 'somewhere-openapi-'));
const openapiJson = join(tmpDir, 'openapi.json');

try {
  execFileSync(process.execPath, [exporter, openapiJson], { cwd: apiRoot, stdio: 'inherit' });
  execFileSync(
    'pnpm',
    ['exec', 'openapi-typescript', openapiJson, '--output', join(root, 'packages/api-client/src/generated.ts')],
    { cwd: root, stdio: 'inherit' },
  );
  process.stdout.write('[api-client] 已生成 packages/api-client/src/generated.ts\n');
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
