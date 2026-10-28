import 'dotenv/config';
import 'reflect-metadata';
import { createApp } from './app.factory';
import { sanitizeForLog } from './common/logging/sanitize';
import { loadConfig } from './config/app-config';
import { setupOpenApi } from './openapi';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await createApp();

  if (!config.isProduction) {
    setupOpenApi(app, config);
  }

  await app.listen(config.port);
  process.stdout.write(
    `${JSON.stringify({
      time: new Date().toISOString(),
      level: 'info',
      msg: 'api_listening',
      port: config.port,
      nodeEnv: config.nodeEnv,
    })}\n`,
  );
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${sanitizeForLog(error.message)}` : 'unknown error';
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', msg: 'api_bootstrap_failed', detail: message })}\n`);
  process.exitCode = 1;
});
