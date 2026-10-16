import { Global, Module } from '@nestjs/common';
import { PlansService } from './plans.service';

@Global()
@Module({ providers: [PlansService], exports: [PlansService] })
export class SubscriptionsModule {}
