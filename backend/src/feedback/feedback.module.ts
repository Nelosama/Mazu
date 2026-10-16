import {
  Body,
  Controller,
  Get,
  Global,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard } from '../auth/tenant.guard';
import { AuthUser, CurrentUser, Roles, Tenant, TenantContext } from '../common/request-context';
import { FeedbackService } from './feedback.service';
import { FeedbackListQueryDto, FeedbackQueryDto, UpdateFollowUpDto } from './dto';

// Comentarios privados: solo OWNER y ADMIN del propio negocio.
@UseGuards(TenantGuard)
@Roles('OWNER', 'ADMIN')
@Controller('businesses/:businessId/feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get('dashboard')
  dashboard(@Tenant() t: TenantContext, @Query() q: FeedbackQueryDto) {
    return this.feedback.dashboard(t, q);
  }

  @Get()
  list(@Tenant() t: TenantContext, @Query() q: FeedbackListQueryDto) {
    return this.feedback.list(t, q);
  }

  @Patch(':id')
  update(
    @Tenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFollowUpDto,
  ) {
    return this.feedback.updateFollowUp(t, u.id, id, dto);
  }
}

@Global()
@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
