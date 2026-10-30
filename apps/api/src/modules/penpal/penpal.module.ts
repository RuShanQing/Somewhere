import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PassageModule } from '../passage/passage.module';
import { ProfileModule } from '../profile/profile.module';
import { SafetyModule } from '../safety/safety.module';
import { PenpalPolicy } from './penpal-policy.service';
import { PenpalReader } from './penpal-reader.service';
import { PenpalService } from './penpal.service';
import { PenpalsController } from './penpals.controller';
import { PenpalRepository } from './repositories/penpal.repository';

@Module({
  imports: [AuthModule, ProfileModule, PassageModule, SafetyModule],
  controllers: [PenpalsController],
  providers: [PenpalService, PenpalRepository, PenpalPolicy, PenpalReader],
  exports: [PenpalPolicy, PenpalReader],
})
export class PenpalModule {}
