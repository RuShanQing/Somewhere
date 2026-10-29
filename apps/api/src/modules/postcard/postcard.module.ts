import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { PassageModule } from '../passage/passage.module';
import { ProfileModule } from '../profile/profile.module';
import { PostOfficeController } from './post-office.controller';
import { PostcardDeliveryService } from './postcard-delivery.service';
import { PostcardService } from './postcard.service';
import { PostcardsController } from './postcards.controller';
import { DraftRepository } from './repositories/draft.repository';
import { PostcardRepository } from './repositories/postcard.repository';

@Module({
  imports: [AuthModule, ProfileModule, DeliveryModule, PassageModule],
  controllers: [PostOfficeController, PostcardsController],
  providers: [
    PostcardService,
    PostcardDeliveryService,
    DraftRepository,
    PostcardRepository,
  ],
  exports: [PostcardService, PostcardDeliveryService],
})
export class PostcardModule {}
