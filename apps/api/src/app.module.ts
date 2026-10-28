import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OriginGuard } from './common/http/origin.guard';
import { JsonLogger } from './common/logging/json-logger';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { PostcardModule } from './modules/postcard/postcard.module';
import { ProfileModule } from './modules/profile/profile.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    ProfileModule,
    PostcardModule,
    HealthModule,
  ],
  providers: [JsonLogger, { provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}
