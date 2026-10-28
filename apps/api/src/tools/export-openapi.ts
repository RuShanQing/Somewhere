import 'dotenv/config';
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../app.factory';
import { loadConfig } from '../config/app-config';
import { createOpenApiDocument } from '../openapi';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await createApp({ logger: false });
  try {
    const document = createOpenApiDocument(app, config);
    const target = resolve(process.argv[2] ?? 'openapi.json');
    writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    process.stdout.write(`openapi written to ${target}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
  process.stderr.write(`export-openapi failed: ${message}\n`);
  process.exitCode = 1;
});
