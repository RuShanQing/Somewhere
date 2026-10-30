import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlockPolicy } from './block-policy.service';
import { BlockRepository } from './repositories/block.repository';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';

@Module({
  imports: [AuthModule],
  controllers: [SafetyController],
  providers: [SafetyService, BlockRepository, BlockPolicy],
  exports: [BlockPolicy],
})
export class SafetyModule {}
