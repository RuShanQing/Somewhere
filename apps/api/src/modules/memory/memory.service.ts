import { Injectable } from '@nestjs/common';
import type { PersonalMemory } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/http/request.types';
import {
  validatePersonalMemoryCreate,
  validatePersonalMemoryUpdate,
} from './domain/personal-memory';
import type {
  CreatePersonalMemoryDto,
  UpdatePersonalMemoryDto,
} from './dto/personal-memory.dto';
import type {
  PersonalMemoryDto,
  PersonalMemoryListDto,
  PersonalMemoryListQueryDto,
} from './dto/personal-memory-response.dto';
import { MemoryRepository } from './repositories/memory.repository';

const DEFAULT_LIMIT = 20;

@Injectable()
export class MemoryService {
  constructor(private readonly memories: MemoryRepository) {}

  async list(
    user: AuthenticatedUser,
    query: PersonalMemoryListQueryDto,
  ): Promise<PersonalMemoryListDto> {
    const rows = await this.memories.listByOwner(
      user.id,
      query.limit ?? DEFAULT_LIMIT,
      query.offset ?? 0,
    );
    return { items: rows.map((row) => this.toDto(row)) };
  }

  async create(
    user: AuthenticatedUser,
    input: CreatePersonalMemoryDto,
  ): Promise<PersonalMemoryDto> {
    const result = validatePersonalMemoryCreate(input);
    if (!result.ok) {
      throw AppError.validation(result.details);
    }
    const row = await this.memories.create(user.id, result.value);
    return this.toDto(row);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    input: UpdatePersonalMemoryDto,
  ): Promise<PersonalMemoryDto> {
    const result = validatePersonalMemoryUpdate(input);
    if (!result.ok) {
      throw AppError.validation(result.details);
    }
    const row = await this.memories.update(user.id, id, result.value);
    if (!row) {
      throw AppError.resourceNotAccessible();
    }
    return this.toDto(row);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const deleted = await this.memories.delete(user.id, id);
    if (!deleted) {
      throw AppError.resourceNotAccessible();
    }
  }

  private toDto(row: PersonalMemory): PersonalMemoryDto {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
