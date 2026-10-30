import { ApiProperty } from '@nestjs/swagger';

export class BlockedUserDto {
  @ApiProperty({ description: '被封锁用户 ID' })
  userId!: string;

  @ApiProperty({ description: '被封锁用户公开昵称' })
  nickname!: string;

  @ApiProperty({ description: '封锁时间（UTC ISO 8601）' })
  blockedAt!: string;
}

export class BlockListDto {
  @ApiProperty({ type: () => [BlockedUserDto], description: '本人发起的封锁' })
  items!: BlockedUserDto[];
}
