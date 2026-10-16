import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { IncidentsService } from '../admin/incidents.service';

/** Normaliza todas las respuestas de error a `{ error: { code, message, details? } }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly incidents: IncidentsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof ThrottlerException) {
      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Inténtalo más tarde.' },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      let code = HttpStatus[status] ?? 'ERROR';
      let message = exception.message;
      let details: unknown;
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (typeof b.code === 'string') code = b.code;
        if (Array.isArray(b.message)) {
          code = 'VALIDATION_ERROR';
          details = { fields: b.message };
          message = 'Datos inválidos';
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
        if (b.details) details = b.details;
      }
      res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
      return;
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`${req.method} ${req.path}: ${err.message}`, err.stack);
    void this.incidents.record('http', err.message, {
      method: req.method,
      route: req.route?.path ?? req.path,
    });
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno. Ya registramos la incidencia.' },
    });
  }
}
