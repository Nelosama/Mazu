import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { TenantGuard } from '../auth/tenant.guard';
import { AuthUser, CurrentUser, Public, Tenant, TenantContext } from '../common/request-context';
import { env } from '../config/env';
import { notFound } from '../common/errors';
import { MEDIA_KINDS, MediaKind, MediaService } from './media.service';
import { STORAGE_ADAPTER, StorageAdapter } from './storage.adapter';
import { LocalStorageAdapter } from './local-storage.adapter';

@UseGuards(TenantGuard)
@Controller('businesses/:businessId/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post(':kind')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: env().UPLOAD_MAX_BYTES, files: 1, fields: 5 } }),
  )
  upload(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthUser,
    @Param('kind', new ParseEnumPipe(Object.fromEntries(MEDIA_KINDS.map((k) => [k, k]))))
    kind: MediaKind,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('targetId', new ParseUUIDPipe({ optional: true })) targetId?: string,
    @Body('caption') caption?: string,
  ) {
    return this.media.upload(
      tenant,
      user.id,
      kind,
      file,
      targetId,
      typeof caption === 'string' ? caption : undefined,
    );
  }

  @Get('portfolio')
  portfolio(@Tenant() tenant: TenantContext) {
    return this.media.listPortfolio(tenant.businessId);
  }

  @Delete('portfolio/:itemId')
  @HttpCode(204)
  async remove(
    @Tenant() tenant: TenantContext,
    @CurrentUser() user: AuthUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    await this.media.deletePortfolioItem(tenant, user.id, itemId);
  }
}

/** Servidor de archivos del adaptador local (solo desarrollo/pruebas). */
@Controller('media')
export class LocalMediaController {
  constructor(@Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter) {}

  @Public()
  @SkipThrottle()
  @Get('*path')
  serve(@Req() req: Request, @Res() res: Response) {
    if (!(this.storage instanceof LocalStorageAdapter)) throw notFound();
    const rel = decodeURIComponent(req.path.replace(/^\/api\/media\//, ''));
    if (!/^businesses\/[0-9a-f-]{36}\/[a-z-]+\/[0-9a-f-]{36}\.webp$/.test(rel)) throw notFound();
    const full = this.storage.resolvePath(rel);
    if (!existsSync(full)) throw notFound();
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(full).pipe(res);
  }
}
