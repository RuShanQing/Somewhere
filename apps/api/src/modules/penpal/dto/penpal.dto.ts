import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class PenpalConsentDto {
  @ApiProperty({
    description: '希望继续保持通信的用户 ID；必须是已完成共途的对方，不能是本人',
    example: '9f1d5f6e-6a1d-4e8f-9f7f-5c9b8a7d6e5f',
  })
  @IsUUID('4', { message: '用户 ID 不合法' })
  counterpartId!: string;
}
