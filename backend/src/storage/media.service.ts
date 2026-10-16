import { Inject, Injectable, Logger } from '@nestjs/common';
import { StoredFileKind } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { badRequest, forbidden, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { STORAGE_ADAPTER, StorageAdapter } from './storage.adapter';
import { processImage } from './image-processing';
import { publicFileUrl } from './public-url';
import type { TenantContext } from '../common/request-context';

export const MEDIA_KINDS = ['logo', 'cover', 'staff-photo', 'service-photo', 'portfolio'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const KIND_CONFIG: Record<MediaKind, { stored: StoredFileKind; maxSide: number }> = {
  logo: { stored: 'BUSINESS_LOGO', maxSide: 512 },
  cover: { stored: 'BUSINESS_COVER', maxSide: 1920 },
  'staff-photo': { stored: 'STAFF_PHOTO', maxSide: 800 },
  'service-photo': { stored: 'SERVICE_PHOTO', maxSide: 1200 },
  portfolio: { stored: 'STAFF_PORTFOLIO', maxSide: 1600 },
};

const MAX_PORTFOLIO_ITEMS = 60;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  async upload(
    tenant: TenantContext,
    actorUserId: string,
    kind: MediaKind,
    file: Express.Multer.File | undefined,
    targetId?: string,
    caption?: string,
  ) {
    if (!file) throw badRequest('FILE_REQUIRED');
    const cfg = KIND_CONFIG[kind];
    const { businessId } = tenant;

    // STAFF solo puede gestionar su propia foto y portafolio.
    if (tenant.role === 'STAFF') {
      const ownStaff =
        (kind === 'staff-photo' || kind === 'portfolio') && targetId && targetId === tenant.staffId;
      if (!ownStaff) throw forbidden('INSUFFICIENT_ROLE');
    }

    // Verificar que el destino pertenece al tenant ANTES de subir nada.
    let previousPath: string | null = null;
    if (kind === 'logo' || kind === 'cover') {
      const b = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
      previousPath = kind === 'logo' ? b.logoPath : b.coverPath;
    } else if (kind === 'staff-photo') {
      const s = await this.prisma.staff.findFirst({ where: { id: targetId, businessId } });
      if (!s) throw notFound('STAFF_NOT_FOUND');
      previousPath = s.photoPath;
    } else if (kind === 'service-photo') {
      const s = await this.prisma.service.findFirst({ where: { id: targetId, businessId } });
      if (!s) throw notFound('SERVICE_NOT_FOUND');
      previousPath = s.photoPath;
    } else if (kind === 'portfolio') {
      if (targetId) {
        const s = await this.prisma.staff.findFirst({ where: { id: targetId, businessId } });
        if (!s) throw notFound('STAFF_NOT_FOUND');
      }
      const count = await this.prisma.portfolioItem.count({ where: { businessId } });
      if (count >= MAX_PORTFOLIO_ITEMS) throw forbidden('PORTFOLIO_LIMIT');
    }

    const image = await processImage(file.buffer, cfg.maxSide);
    const path = `businesses/${businessId}/${kind}/${randomUUID()}.webp`;
    await this.storage.put(path, image.data, image.contentType);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.storedFile.create({
          data: {
            businessId,
            kind: cfg.stored,
            bucket: this.storage.bucket,
            path,
            mimeType: image.contentType,
            sizeBytes: image.data.length,
            width: image.width,
            height: image.height,
            uploadedById: actorUserId,
          },
        });
        if (kind === 'logo')
          await tx.business.update({ where: { id: businessId }, data: { logoPath: path } });
        if (kind === 'cover')
          await tx.business.update({ where: { id: businessId }, data: { coverPath: path } });
        if (kind === 'staff-photo')
          await tx.staff.update({ where: { id: targetId }, data: { photoPath: path } });
        if (kind === 'service-photo')
          await tx.service.update({ where: { id: targetId }, data: { photoPath: path } });
        if (kind === 'portfolio') {
          return tx.portfolioItem.create({
            data: { businessId, staffId: targetId ?? null, path, caption: caption?.slice(0, 200) },
          });
        }
        return null;
      });
      if (previousPath) await this.deleteStored(businessId, previousPath);
      await this.audit.log({
        actorUserId,
        businessId,
        action: 'media.upload',
        targetType: kind,
        targetId: targetId ?? businessId,
      });
      return {
        path,
        url: publicFileUrl(path),
        width: image.width,
        height: image.height,
        sizeBytes: image.data.length,
        portfolioItem: result,
      };
    } catch (err) {
      await this.storage.remove([path]).catch(() => undefined);
      throw err;
    }
  }

  async deletePortfolioItem(tenant: TenantContext, actorUserId: string, itemId: string) {
    const item = await this.prisma.portfolioItem.findFirst({
      where: { id: itemId, businessId: tenant.businessId },
    });
    if (!item) throw notFound('PORTFOLIO_ITEM_NOT_FOUND');
    if (tenant.role === 'STAFF' && item.staffId !== tenant.staffId)
      throw forbidden('INSUFFICIENT_ROLE');
    await this.prisma.portfolioItem.delete({ where: { id: item.id } });
    await this.deleteStored(tenant.businessId, item.path);
    await this.audit.log({
      actorUserId,
      businessId: tenant.businessId,
      action: 'media.delete',
      targetType: 'portfolio',
      targetId: itemId,
    });
  }

  async listPortfolio(businessId: string) {
    const items = await this.prisma.portfolioItem.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return items.map((i) => ({ ...i, url: publicFileUrl(i.path) }));
  }

  async usage(businessId: string) {
    const agg = await this.prisma.storedFile.aggregate({
      where: { businessId },
      _sum: { sizeBytes: true },
      _count: true,
    });
    return { files: agg._count, bytes: agg._sum.sizeBytes ?? 0 };
  }

  private async deleteStored(businessId: string, path: string) {
    try {
      await this.prisma.storedFile.deleteMany({ where: { businessId, path } });
      await this.storage.remove([path]);
    } catch (err) {
      this.logger.warn(`No se pudo eliminar ${path}: ${(err as Error).message}`);
    }
  }
}
