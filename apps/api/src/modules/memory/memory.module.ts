import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MemoriesController } from './memories.controller';
import { MemoryService } from './memory.service';
import { MemoryRepository } from './repositories/memory.repository';

@Module({
  imports: [AuthModule],
  controllers: [MemoriesController],
  providers: [MemoryService, MemoryRepository],
})
export class MemoryModule {}
