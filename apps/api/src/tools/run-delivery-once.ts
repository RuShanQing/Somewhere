import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MemoryService } from '../modules/memory/memory.service';
import { PostcardDeliveryService } from '../modules/postcard/postcard-delivery.service';

async function main(): Promise<void> {
  const batchSize = Number.parseInt(process.argv[2] ?? '50', 10);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const size = Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 50;
    const delivered = await app.get(PostcardDeliveryService).deliverDue(size);
    const diaries = await app.get(MemoryService).generateDueDiaries(size);
    process.stdout.write(
      `${JSON.stringify({ delivered, diaries, at: new Date().toISOString() })}\n`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`delivery run failed: ${message}\n`);
  process.exitCode = 1;
});
