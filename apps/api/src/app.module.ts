import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OriginGuard } from './common/http/origin.guard';
import { JsonLogger } from './common/logging/json-logger';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { HealthModule } from './modules/health/health.module';
import { PassageModule } from './modules/passage/passage.module';
import { PostcardModule } from './modules/postcard/postcard.module';
import { ProfileModule } from './modules/profile/profile.module';
import { StoryModule } from './modules/story/story.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    ProfileModule,
    PostcardModule,
    StoryModule,
    DiscoveryModule,
    PassageModule,
    HealthModule,
  ],
  providers: [JsonLogger, { provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}
