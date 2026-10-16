import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Error de dominio con código estable. El frontend traduce el código;
 * el mensaje es solo una ayuda para desarrolladores.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    status: HttpStatus,
    message?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message: message ?? code, details }, status);
  }
}

export const notFound = (code = 'NOT_FOUND', message?: string) =>
  new AppError(code, HttpStatus.NOT_FOUND, message);
export const forbidden = (code = 'FORBIDDEN', message?: string) =>
  new AppError(code, HttpStatus.FORBIDDEN, message);
export const conflict = (code: string, message?: string, details?: Record<string, unknown>) =>
  new AppError(code, HttpStatus.CONFLICT, message, details);
export const badRequest = (code: string, message?: string, details?: Record<string, unknown>) =>
  new AppError(code, HttpStatus.BAD_REQUEST, message, details);
export const unauthorized = (code = 'UNAUTHORIZED', message?: string) =>
  new AppError(code, HttpStatus.UNAUTHORIZED, message);
export const gone = (code: string, message?: string) =>
  new AppError(code, HttpStatus.GONE, message);
