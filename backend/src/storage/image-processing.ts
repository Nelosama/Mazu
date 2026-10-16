import sharp from 'sharp';
import { badRequest } from '../common/errors';

const ALLOWED = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
  contentType: 'image/webp';
}

/**
 * Valida por contenido (no por extensión ni por el Content-Type del cliente), elimina
 * metadatos (EXIF/GPS), corrige orientación, limita dimensiones y recodifica a WebP.
 * Recodificar neutraliza cargas ocultas en archivos poliglotas.
 */
export async function processImage(input: Buffer, maxSide: number): Promise<ProcessedImage> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw badRequest('INVALID_IMAGE', 'El archivo no es una imagen válida');
  }
  if (!meta.format || !ALLOWED.has(meta.format)) {
    throw badRequest('UNSUPPORTED_IMAGE_TYPE', 'Formatos permitidos: JPEG, PNG, WebP, AVIF, HEIC');
  }
  if ((meta.pages ?? 1) > 1)
    throw badRequest('UNSUPPORTED_IMAGE_TYPE', 'No se admiten imágenes animadas');
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, contentType: 'image/webp' };
  } catch {
    throw badRequest('INVALID_IMAGE', 'No se pudo procesar la imagen');
  }
}
