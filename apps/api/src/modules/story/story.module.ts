import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/http/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { ApprovedStoryReader } from './approved-story-reader.service';
import { ModerationController } from './moderation.controller';
import { MyStoriesController } from './my-stories.controller';
import { StoryRepository } from './repositories/story.repository';
import { StoriesController } from './stories.controller';
import { StoryActionsController } from './story-actions.controller';
import { StoryService } from './story.service';

@Module({
  imports: [AuthModule, ProfileModule],
  controllers: [
    MyStoriesController,
    StoryActionsController,
    StoriesController,
    ModerationController,
  ],
  providers: [StoryService, StoryRepository, ApprovedStoryReader, RolesGuard],
  exports: [StoryService, ApprovedStoryReader],
})
export class StoryModule {}
