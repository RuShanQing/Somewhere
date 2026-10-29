import { Inject, Injectable } from '@nestjs/common';
import type { City, Story } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { AppError } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/http/request.types';
import { AccountService } from '../auth/account.service';
import { CityService } from '../profile/city.service';
import { ApprovedStoryReader } from './approved-story-reader.service';
import {
  excerptOf,
  validateStoryBody,
  validateStoryTags,
  validateStoryTitle,
} from './domain/story-content';
import { decodeStoryCursor, encodeStoryCursor, type StoryCursor } from './domain/story-cursor';
import type {
  CreateStoryDto,
  ModerationQueueQueryDto,
  PublicStoryListQueryDto,
  StoryDecisionDto,
  UpdateStoryDto,
} from './dto/story.dto';
import type {
  ModerationQueueDto,
  ModerationStoryItemDto,
  OwnStoryDto,
  PublicStoryDetailDto,
  PublicStoryItemDto,
  PublicStoryListDto,
  StoryCityDto,
  StoryDecisionResponseDto,
} from './dto/story-response.dto';
import { StoryRepository } from './repositories/story.repository';

const MINE_LIMIT = 50;
const DEFAULT_PUBLIC_LIMIT = 12;
const DEFAULT_QUEUE_LIMIT = 20;

@Injectable()
export class StoryService {
  constructor(
    private readonly stories: StoryRepository,
    private readonly publicStories: ApprovedStoryReader,
    private readonly cities: CityService,
    private readonly accounts: AccountService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createStory(user: AuthenticatedUser, input: CreateStoryDto): Promise<OwnStoryDto> {
    const title = this.requireTitle(input.title);
    const body = this.requireBody(input.body);
    const tags = this.requireTags(input.topicTags ?? []);
    const city = await this.requireCity(input.cityId);

    const story = await this.stories.create({
      authorId: user.id,
      cityId: city.id,
      title,
      body,
      topicTags: tags,
    });
    return this.toOwnStory(story, city);
  }

  async listMine(user: AuthenticatedUser): Promise<OwnStoryDto[]> {
    const rows = await this.stories.listMine(user.id, MINE_LIMIT, 0);
    const cityById = await this.loadCities(rows);
    return rows.map((story) => this.toOwnStory(story, this.cityFor(story, cityById)));
  }

  async getMine(user: AuthenticatedUser, id: string): Promise<OwnStoryDto> {
    const story = await this.requireOwned(user, id);
    const city = await this.requireCity(story.cityId, false);
    return this.toOwnStory(story, city);
  }

  async updateStory(
    user: AuthenticatedUser,
    id: string,
    input: UpdateStoryDto,
  ): Promise<OwnStoryDto> {
    if (
      input.title === undefined &&
      input.body === undefined &&
      input.topicTags === undefined &&
      input.cityId === undefined
    ) {
      throw AppError.validation(['body:empty']);
    }

    const data: {
      title?: string;
      body?: string;
      topicTags?: string[];
      cityId?: string;
    } = {};
    if (input.title !== undefined) {
      data.title = this.requireTitle(input.title);
    }
    if (input.body !== undefined) {
      data.body = this.requireBody(input.body);
    }
    if (input.topicTags !== undefined) {
      data.topicTags = this.requireTags(input.topicTags);
    }
    if (input.cityId !== undefined) {
      data.cityId = (await this.requireCity(input.cityId)).id;
    }

    const updated = await this.stories.updateOwned(id, user.id, data);
    if (!updated) {
      throw AppError.resourceNotAccessible();
    }
    const city = await this.requireCity(updated.cityId, false);
    return this.toOwnStory(updated, city);
  }

  async submitStory(user: AuthenticatedUser, id: string): Promise<OwnStoryDto> {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - this.config.storySubmissionWindowDays * 24 * 60 * 60 * 1000,
    );
    const story = await this.stories.submitOwned(
      id,
      user.id,
      now,
      windowStart,
      this.config.storyMaxSubmissionsPerWindow,
    );
    const city = await this.requireCity(story.cityId, false);
    return this.toOwnStory(story, city);
  }

  async deleteStory(user: AuthenticatedUser, id: string): Promise<void> {
    const deleted = await this.stories.deleteDraft(id, user.id);
    if (!deleted) {
      throw AppError.resourceNotAccessible();
    }
  }

  async withdrawStory(user: AuthenticatedUser, id: string): Promise<OwnStoryDto> {
    const story = await this.stories.withdrawOwned(id, user.id, new Date());
    const city = await this.requireCity(story.cityId, false);
    return this.toOwnStory(story, city);
  }

  async listPublic(query: PublicStoryListQueryDto): Promise<PublicStoryListDto> {
    const limit = query.limit ?? DEFAULT_PUBLIC_LIMIT;
    const cursor = this.parseCursor(query.cursor);
    const rows = await this.publicStories.listPublic({
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.topic?.trim() ? { topic: query.topic.trim() } : {}),
      cursor,
      limit,
    });

    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const [cityById, nicknameById] = await Promise.all([
      this.loadCities(visible),
      this.loadNicknames(visible),
    ]);

    const items = visible.map((story) =>
      this.toPublicItem(story, this.cityFor(story, cityById), nicknameById),
    );
    const last = visible.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last?.publishedAt
          ? encodeStoryCursor({ at: last.publishedAt, id: last.id })
          : null,
    };
  }

  async getPublicStory(id: string): Promise<PublicStoryDetailDto> {
    const story = await this.publicStories.findPublicById(id);
    if (!story || !story.publishedAt) {
      throw AppError.resourceNotAccessible();
    }
    const [city, nicknameById] = await Promise.all([
      this.requireCity(story.cityId, false),
      this.loadNicknames([story]),
    ]);
    return {
      id: story.id,
      title: story.title,
      body: story.body,
      topicTags: story.topicTags,
      authorNickname: nicknameById.get(story.authorId) ?? '远方作者',
      city: this.toCity(city),
      publishedAt: story.publishedAt.toISOString(),
    };
  }

  async listModerationQueue(query: ModerationQueueQueryDto): Promise<ModerationQueueDto> {
    const limit = query.limit ?? DEFAULT_QUEUE_LIMIT;
    const cursor = this.parseCursor(query.cursor);
    const rows = await this.stories.listModerationQueue(cursor, limit);
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const [cityById, nicknameById] = await Promise.all([
      this.loadCities(visible),
      this.loadNicknames(visible),
    ]);

    const items: ModerationStoryItemDto[] = visible.flatMap((story) => {
      if (!story.submittedAt) {
        return [];
      }
      return [
        {
          id: story.id,
          title: story.title,
          body: story.body,
          topicTags: story.topicTags,
          authorNickname: nicknameById.get(story.authorId) ?? '远方作者',
          city: this.toCity(this.cityFor(story, cityById)),
          submittedAt: story.submittedAt.toISOString(),
        },
      ];
    });
    const last = visible.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last?.submittedAt
          ? encodeStoryCursor({ at: last.submittedAt, id: last.id })
          : null,
    };
  }

  async decideStory(
    user: AuthenticatedUser,
    id: string,
    input: StoryDecisionDto,
  ): Promise<StoryDecisionResponseDto> {
    if (input.action === 'APPROVE' && input.reasonCode !== undefined) {
      throw AppError.validation(['reasonCode:notAllowedForApprove']);
    }
    const story = await this.stories.decideStory({
      storyId: id,
      moderatorId: user.id,
      decision: input.action,
      reasonCode: input.reasonCode ?? null,
      now: new Date(),
      maxActivePerCity: this.config.storyMaxActivePerCity,
    });
    return {
      id: story.id,
      reviewStatus: story.reviewStatus,
      publishedAt: story.publishedAt?.toISOString() ?? null,
    };
  }

  private async requireOwned(user: AuthenticatedUser, id: string): Promise<Story> {
    const story = await this.stories.findOwned(id, user.id);
    if (!story) {
      throw AppError.resourceNotAccessible();
    }
    return story;
  }

  private async requireCity(id: string, validate = true): Promise<City> {
    const city = await this.cities.findById(id);
    if (!city) {
      if (validate) {
        throw AppError.validation(['cityId:notFound']);
      }
      throw AppError.resourceNotAccessible();
    }
    return city;
  }

  private requireTitle(raw: string): string {
    const result = validateStoryTitle(raw);
    if (result.ok) {
      return result.value;
    }
    throw AppError.validation([
      result.reason === 'blank' ? 'title:blank' : 'title:length',
    ]);
  }

  private requireBody(raw: string): string {
    const result = validateStoryBody(raw);
    if (result.ok) {
      return result.value;
    }
    throw AppError.validation([
      result.reason === 'blank' ? 'body:blank' : 'body:length',
    ]);
  }

  private requireTags(raw: string[]): string[] {
    const result = validateStoryTags(raw);
    if (result.ok) {
      return result.value;
    }
    throw AppError.validation([`topicTags:${result.reason}`]);
  }

  private parseCursor(raw: string | undefined): StoryCursor | null {
    if (raw === undefined) {
      return null;
    }
    const cursor = decodeStoryCursor(raw);
    if (!cursor) {
      throw AppError.validation(['cursor:invalid']);
    }
    return cursor;
  }

  private async loadCities(rows: Story[]): Promise<Map<string, City>> {
    const cities = await this.cities.findManyByIds(rows.map((story) => story.cityId));
    return new Map(cities.map((city) => [city.id, city]));
  }

  private async loadNicknames(rows: Story[]): Promise<Map<string, string>> {
    const accounts = await this.accounts.findPublicByIds(
      Array.from(new Set(rows.map((story) => story.authorId))),
    );
    return new Map(accounts.map((account) => [account.id, account.nickname]));
  }

  private cityFor(story: Story, cityById: Map<string, City>): City {
    const city = cityById.get(story.cityId);
    if (!city) {
      throw AppError.resourceNotAccessible();
    }
    return city;
  }

  private toCity(city: City): StoryCityDto {
    return { id: city.id, name: city.name, countryCode: city.countryCode };
  }

  private toOwnStory(story: Story, city: City): OwnStoryDto {
    return {
      id: story.id,
      title: story.title,
      body: story.body,
      topicTags: story.topicTags,
      city: this.toCity(city),
      reviewStatus: story.reviewStatus,
      submittedAt: story.submittedAt?.toISOString() ?? null,
      reviewedAt: story.reviewedAt?.toISOString() ?? null,
      publishedAt: story.publishedAt?.toISOString() ?? null,
      removedBy: story.removedBy,
      createdAt: story.createdAt.toISOString(),
      updatedAt: story.updatedAt.toISOString(),
    };
  }

  private toPublicItem(
    story: Story,
    city: City,
    nicknameById: Map<string, string>,
  ): PublicStoryItemDto {
    if (!story.publishedAt) {
      throw AppError.resourceNotAccessible();
    }
    return {
      id: story.id,
      title: story.title,
      excerpt: excerptOf(story.body),
      topicTags: story.topicTags,
      authorNickname: nicknameById.get(story.authorId) ?? '远方作者',
      city: this.toCity(city),
      publishedAt: story.publishedAt.toISOString(),
    };
  }
}
