import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const violations = [];
const passed = [];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

// 跨模块只允许依赖对方公开的 Module / Guard / Service；不得导入 Repository、DTO 或 Controller。
const PUBLIC_MODULE_API = [
  /\/[a-z-]+\.module$/,
  /\/guards\/session\.guard$/,
  /\/account\.service$/,
  /\/session\.service$/,
  /\/city\.service$/,
  /\/profile-reader\.service$/,
  /\/delivery-policy\.service$/,
  /\/approved-story-reader\.service$/,
  /\/passage-policy\.service$/,
  /\/passage-reader\.service$/,
  /\/block-policy\.service$/,
  /\/penpal-policy\.service$/,
  /\/penpal-reader\.service$/,
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      walk(fullPath, files);
    } else if (/\.(ts|vue|mjs)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function readImports(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const specifiers = [];
  const importPattern = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
  let match = importPattern.exec(source);
  while (match) {
    if (match[1]) {
      specifiers.push({ specifier: match[1], source });
    }
    match = importPattern.exec(source);
  }
  return { specifiers, source };
}

function report(rule, filePath, detail) {
  violations.push(`${rule} :: ${relative(root, filePath)} :: ${detail}`);
}

const webFiles = walk(resolve(root, 'apps/web/src'));
const apiFiles = walk(resolve(root, 'apps/api/src'));
const clientFiles = walk(resolve(root, 'packages/api-client/src'));

for (const file of webFiles) {
  const { specifiers, source } = readImports(file);
  for (const { specifier } of specifiers) {
    if (specifier.includes('apps/api') || specifier === '@somewhere/api') {
      report('WEB_MUST_NOT_IMPORT_SERVER', file, specifier);
    }
  }
  if (/\b(localStorage|sessionStorage)\b/.test(source)) {
    report('WEB_NO_SESSION_IN_BROWSER_STORAGE', file, '使用 localStorage/sessionStorage');
  }
}

for (const file of apiFiles) {
  const { specifiers } = readImports(file);
  for (const { specifier } of specifiers) {
    if (specifier.includes('apps/web') || specifier === '@somewhere/web') {
      report('API_MUST_NOT_IMPORT_WEB', file, specifier);
    }
    if (specifier.includes('prisma.service') && !file.includes('/src/prisma/') && !file.endsWith('.repository.ts')) {
      report('PRISMA_ONLY_IN_REPOSITORY', file, specifier);
    }
  }

  const source = readFileSync(file, 'utf8');
  if (/console\.(log|info|warn|error|debug)\(/.test(source)) {
    report('API_USE_STRUCTURED_LOGGER', file, '禁止 console.*，请使用 JsonLogger');
  }

  const moduleMatch = file.match(/\/src\/modules\/([^/]+)\//);
  if (moduleMatch) {
    const ownModule = moduleMatch[1];
    for (const { specifier } of readImports(file).specifiers) {
      if (!specifier.startsWith('.')) {
        continue;
      }
      const resolvedImport = resolve(dirname(file), specifier);
      const otherModuleMatch = resolvedImport.match(/\/src\/modules\/([^/]+)\//);
      const isPublicApi = PUBLIC_MODULE_API.some((pattern) => pattern.test(specifier));
      if (otherModuleMatch && otherModuleMatch[1] !== ownModule && !isPublicApi) {
        report('CROSS_MODULE_IMPORT', file, `${ownModule} -> ${otherModuleMatch[1]} (${specifier})`);
      }
    }
  }
}

for (const file of webFiles) {
  const featureMatch = file.match(/\/src\/features\/([^/]+)\//);
  if (!featureMatch) {
    continue;
  }
  const ownFeature = featureMatch[1];
  for (const { specifier } of readImports(file).specifiers) {
    if (!specifier.startsWith('.')) {
      continue;
    }
    const resolvedImport = resolve(dirname(file), specifier);
    const otherFeatureMatch = resolvedImport.match(/\/src\/features\/([^/]+)\//);
    if (otherFeatureMatch && otherFeatureMatch[1] !== ownFeature) {
      report('WEB_FEATURE_ISOLATION', file, `${ownFeature} -> ${otherFeatureMatch[1]} (${specifier})`);
    }
  }
}

for (const file of clientFiles) {
  const { specifiers } = readImports(file);
  for (const { specifier } of specifiers) {
    if (/^(@nestjs|express|@prisma|node:)/.test(specifier)) {
      report('API_CLIENT_BROWSER_SAFE', file, specifier);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`[architecture] FAIL: ${violations.length} 处依赖违规\n`);
  for (const violation of violations) {
    process.stderr.write(`  - ${violation}\n`);
  }
  process.exit(1);
}

passed.push(
  `[architecture] PASS: Web 不导入服务端代码（检查 ${webFiles.length} 个文件）`,
  `[architecture] PASS: API 不导入 Web 代码，且 Prisma 仅在 repository / src/prisma 中使用（检查 ${apiFiles.length} 个文件）`,
  '[architecture] PASS: 不存在跨模块深层导入与前端功能互相引用',
  '[architecture] PASS: Web 源码不使用 localStorage/sessionStorage 保存会话',
  `[architecture] PASS: api-client 保持浏览器安全（检查 ${clientFiles.length} 个文件）`,
  '',
);

process.stdout.write(passed.join('\n'));
