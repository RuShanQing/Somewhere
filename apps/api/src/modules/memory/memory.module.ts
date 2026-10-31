import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PassageModule } from '../passage/passage.module';
import { PostcardModule } from '../postcard/postcard.module';
import { DiariesController } from './diaries.controller';
import { MemoriesController } from './memories.controller';
import { MemoryService } from './memory.service';
import { MemoryRepository } from './repositories/memory.repository';

@Module({
  imports: [AuthModule, PostcardModule, PassageModule],
  controllers: [MemoriesController, DiariesController],
  providers: [MemoryService, MemoryRepository],
  exports: [MemoryService],
})
export class MemoryModule {}
