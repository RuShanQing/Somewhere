import { Module } from '@nestjs/common';
import { DeliveryPolicy } from './delivery-policy.service';

@Module({
  providers: [DeliveryPolicy],
  exports: [DeliveryPolicy],
})
export class DeliveryModule {}
