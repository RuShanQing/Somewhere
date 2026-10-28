import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { requestContextMiddleware } from './common/http/request-context.middleware';
import { securityHeadersMiddleware } from './common/http/security-headers.middleware';
import { validationExceptionFactory } from './common/http/validation';
import { JsonLogger } from './common/logging/json-logger';

export interface CreateAppOptions {
  logger?: boolean;
}

/**
 * 生产与测试共用同一套装配，避免“测试应用”和真实应用行为不一致。
 */
export async function createApp(options: CreateAppOptions = {}): Promise<INestApplication> {
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, {
    logger: options.logger === false ? false : logger,
  });

  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use(securityHeadersMiddleware());
  app.use(requestContextMiddleware(logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.enableShutdownHooks();

  return app;
}
