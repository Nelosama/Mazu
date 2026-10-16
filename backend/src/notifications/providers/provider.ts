import { NotificationChannel, NotificationEvent } from '@prisma/client';

export interface OutgoingMessage {
  idempotencyKey: string;
  channel: NotificationChannel;
  event: NotificationEvent;
  recipient: string;
  locale: string;
  subject: string;
  text: string;
  /** Parámetros ordenados para plantillas aprobadas (WhatsApp). */
  templateParams: string[];
}

export type SendResult =
  { ok: true; providerMessageId?: string } | { ok: false; retryable: boolean; error: string };

export interface NotificationProvider {
  readonly name: string;
  readonly channel: NotificationChannel;
  send(message: OutgoingMessage): Promise<SendResult>;
}
