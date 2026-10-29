import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PostcardCityDto {
  @ApiProperty({ description: '城市 ID' })
  id!: string;

  @ApiProperty({ description: '城市名', example: '里斯本' })
  name!: string;

  @ApiProperty({ description: '国家代码', example: 'PT' })
  countryCode!: string;
}

export class PostcardParticipantDto {
  @ApiProperty({ description: '用户 ID' })
  id!: string;

  @ApiProperty({ description: '公开昵称' })
  nickname!: string;
}

export class RecipientResponseDto {
  @ApiProperty({ description: '收件人用户 ID' })
  id!: string;

  @ApiProperty({ description: '收件人公开昵称' })
  nickname!: string;

  @ApiProperty({ type: () => PostcardCityDto, description: '城市级信息，不含坐标' })
  city!: PostcardCityDto;
}

export class PostcardDraftResponseDto {
  @ApiProperty({ description: '草稿 ID' })
  id!: string;

  @ApiPropertyOptional({
    type: () => PostcardParticipantDto,
    nullable: true,
    description: '收件人；草稿可以为空',
  })
  recipient!: PostcardParticipantDto | null;

  @ApiProperty({ description: '草稿正文' })
  body!: string;

  @ApiPropertyOptional({
    description: '绑定的共途 ID；未绑定为 null，创建后不可改绑',
    type: String,
    nullable: true,
  })
  passageId!: string | null;

  @ApiProperty({ description: '最后更新时间（UTC ISO 8601）' })
  updatedAt!: string;
}

export class DraftSummaryDto {
  @ApiProperty({ description: '草稿 ID' })
  id!: string;

  @ApiProperty({ description: '最后更新时间（UTC ISO 8601）' })
  updatedAt!: string;
}

export class IncomingSummaryDto {
  @ApiProperty({ description: '明信片 ID' })
  id!: string;

  @ApiProperty({ description: '寄件人公开昵称' })
  senderNickname!: string;

  @ApiProperty({ description: '实际送达时间（UTC ISO 8601）' })
  deliveredAt!: string;
}

export class TransitSummaryDto {
  @ApiProperty({ description: '明信片 ID' })
  id!: string;

  @ApiProperty({ description: '预计送达时间（UTC ISO 8601）' })
  deliverAt!: string;

  @ApiProperty({
    description: '象征性的视觉阶段，不代表真实物流位置',
    example: 'TRAVELING',
  })
  stage!: 'TRAVELING';
}

export class PostOfficeSummaryDto {
  @ApiProperty({ type: () => [IncomingSummaryDto], description: '已送达、本人可读的来信' })
  incoming!: IncomingSummaryDto[];

  @ApiProperty({ type: () => [TransitSummaryDto], description: '本人寄出且尚未送达的信' })
  inTransit!: TransitSummaryDto[];

  @ApiProperty({ type: () => [DraftSummaryDto], description: '本人未寄出的草稿' })
  drafts!: DraftSummaryDto[];
}

export class SendPostcardResponseDto {
  @ApiProperty({ description: '新明信片 ID' })
  postcardId!: string;

  @ApiProperty({
    description: '当前状态；重复发送时可能返回已送达的同一张信',
    enum: ['IN_TRANSIT', 'DELIVERED', 'RESTRICTED'],
    example: 'IN_TRANSIT',
  })
  status!: 'IN_TRANSIT' | 'DELIVERED' | 'RESTRICTED';

  @ApiProperty({ description: '服务端发送时间（UTC ISO 8601）' })
  sentAt!: string;

  @ApiProperty({ description: '服务端计算的预计送达时间（UTC ISO 8601）' })
  deliverAt!: string;
}

export class InboxItemDto {
  @ApiProperty({ description: '明信片 ID' })
  id!: string;

  @ApiProperty({ description: '寄件人公开昵称' })
  senderNickname!: string;

  @ApiProperty({ description: '实际送达时间（UTC ISO 8601）' })
  deliveredAt!: string;
}

export class TransitItemDto {
  @ApiProperty({ description: '明信片 ID' })
  id!: string;

  @ApiProperty({ description: '预计送达时间（UTC ISO 8601）' })
  deliverAt!: string;

  @ApiProperty({ description: '象征性阶段', example: 'TRAVELING' })
  stage!: 'TRAVELING';
}

export class PostcardDetailDto {
  @ApiProperty({ description: '明信片 ID' })
  id!: string;

  @ApiProperty({
    description: '状态；RESTRICTED 为安全处置态',
    enum: ['IN_TRANSIT', 'DELIVERED', 'RESTRICTED'],
  })
  status!: 'IN_TRANSIT' | 'DELIVERED' | 'RESTRICTED';

  @ApiPropertyOptional({
    description: '正文；无权阅读或受限态为 null',
    type: String,
    nullable: true,
  })
  body!: string | null;

  @ApiProperty({ description: '服务端发送时间（UTC ISO 8601）' })
  sentAt!: string;

  @ApiProperty({ description: '预计送达时间（UTC ISO 8601）' })
  deliverAt!: string;

  @ApiPropertyOptional({
    description: '实际送达时间（UTC ISO 8601）；未送达为 null',
    type: String,
    nullable: true,
  })
  deliveredAt!: string | null;

  @ApiProperty({ type: () => PostcardParticipantDto })
  sender!: PostcardParticipantDto;

  @ApiProperty({ type: () => PostcardParticipantDto })
  receiver!: PostcardParticipantDto;

  @ApiProperty({ type: () => PostcardCityDto })
  originCity!: PostcardCityDto;

  @ApiProperty({ type: () => PostcardCityDto })
  destinationCity!: PostcardCityDto;
}
