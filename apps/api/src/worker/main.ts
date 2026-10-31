import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { JsonLogger } from '../common/logging/json-logger';
import { sanitizeForLog } from '../common/logging/sanitize';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { MemoryService } from '../modules/memory/memory.service';
import { PostcardDeliveryService } from '../modules/postcard/postcard-delivery.service';

async function bootstrap(): Promise<void> {
  const logger = new JsonLogger();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const config = app.get<AppConfig>(APP_CONFIG);
  const delivery = app.get(PostcardDeliveryService);
  const memories = app.get(MemoryService);

  let running = false;

  const scan = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      const delivered = await delivery.deliverDue();
      if (delivered > 0) {
        logger.record({ level: 'info', msg: 'postcards_delivered', count: delivered });
      }
      try {
        // 日记生成失败不回滚已完成的投递；下一轮扫描会按唯一键补生成。
        const diaries = await memories.generateDueDiaries();
        if (diaries > 0) {
          logger.record({ level: 'info', msg: 'diary_pages_created', count: diaries });
        }
      } catch (error) {
        const message =
          error instanceof Error ? sanitizeForLog(error.message) : 'unknown error';
        logger.record({ level: 'error', msg: 'diary_generation_failed', detail: message });
      }
    } catch (error) {
      const message = error instanceof Error ? sanitizeForLog(error.message) : 'unknown error';
      logger.record({ level: 'error', msg: 'postcard_delivery_failed', detail: message });
    } finally {
      running = false;
    }
  };

  await scan();
  logger.record({
    level: 'info',
    msg: 'delivery_worker_started',
    pollIntervalMs: config.deliveryPollIntervalMs,
  });
  const timer = setInterval(() => {
    void scan();
  }, config.deliveryPollIntervalMs);

  const shutdown = async (): Promise<void> => {
    clearInterval(timer);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? sanitizeForLog(error.message) : 'unknown error';
  process.stderr.write(
    `${JSON.stringify({ time: new Date().toISOString(), level: 'error', msg: 'worker_bootstrap_failed', detail: message })}\n`,
  );
  process.exitCode = 1;
});
