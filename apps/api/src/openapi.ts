import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { AppConfig } from './config/app-config';

export function createOpenApiDocument(app: INestApplication, config: AppConfig): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Somewhere API')
    .setDescription('Somewhere 慢社交 Web · 账号、会话与健康检查接口（/api/v1）')
    .setVersion('0.1.0')
    .addCookieAuth(config.sessionCookieName, {
      type: 'apiKey',
      in: 'cookie',
      description: 'HttpOnly 会话 Cookie，仅由服务端下发',
    })
    .addServer(`http://localhost:${config.port}`, '本地开发');

  return SwaggerModule.createDocument(app, builder.build());
}

export function setupOpenApi(app: INestApplication, config: AppConfig): void {
  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app, config), {
    jsonDocumentUrl: 'api/docs-json',
  });
}
