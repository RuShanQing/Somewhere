import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OriginGuard } from './common/http/origin.guard';
import { JsonLogger } from './common/logging/json-logger';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { HealthModule } from './modules/health/health.module';
import { MemoryModule } from './modules/memory/memory.module';
import { PassageModule } from './modules/passage/passage.module';
import { PenpalModule } from './modules/penpal/penpal.module';
import { PostcardModule } from './modules/postcard/postcard.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SafetyModule } from './modules/safety/safety.module';
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
    SafetyModule,
    PassageModule,
    PenpalModule,
    MemoryModule,
    HealthModule,
  ],
  providers: [JsonLogger, { provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}
