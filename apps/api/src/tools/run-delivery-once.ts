import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PostcardDeliveryService } from '../modules/postcard/postcard-delivery.service';

async function main(): Promise<void> {
  const batchSize = Number.parseInt(process.argv[2] ?? '50', 10);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const delivered = await app.get(PostcardDeliveryService).deliverDue(
      Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 50,
    );
    process.stdout.write(
      `${JSON.stringify({ delivered, at: new Date().toISOString() })}\n`,
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
