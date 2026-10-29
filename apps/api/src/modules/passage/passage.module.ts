import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { PassagePolicy } from './passage-policy.service';
import { PassageReader } from './passage-reader.service';
import { PassageRepository } from './repositories/passage.repository';
import { PassageService } from './passage.service';
import { PassagesController } from './passages.controller';

@Module({
  imports: [AuthModule, ProfileModule],
  controllers: [PassagesController],
  providers: [PassageService, PassageRepository, PassagePolicy, PassageReader],
  exports: [PassagePolicy, PassageReader],
})
export class PassageModule {}
