import { NotificationEvent } from '@prisma/client';
import { NotificationProvider, OutgoingMessage, SendResult } from './provider';

/**
 * WhatsApp Business Platform (Cloud API de Meta). Los mensajes iniciados por el negocio
 * requieren plantillas aprobadas y tienen coste por conversación según el país del
 * destinatario: no se asume gratuidad. Los nombres de plantilla deben existir en la cuenta.
 */
export const WHATSAPP_TEMPLATES: Record<NotificationEvent, string> = {
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_CANCELED: 'booking_canceled',
  BOOKING_RESCHEDULED: 'booking_rescheduled',
  REMINDER: 'appointment_reminder',
  FEEDBACK_INVITATION: 'feedback_invitation',
};

export class WhatsAppCloudProvider implements NotificationProvider {
  readonly name = 'whatsapp-cloud';
  readonly channel = 'WHATSAPP' as const;

  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly apiVersion: string,
  ) {}

  async send(m: OutgoingMessage): Promise<SendResult> {
    const res = await fetch(
      `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: m.recipient.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: WHATSAPP_TEMPLATES[m.event],
            language: { code: m.locale },
            components: [
              {
                type: 'body',
                parameters: m.templateParams.map((text) => ({ type: 'text', text })),
              },
            ],
          },
        }),
      },
    ).catch(
      (err: Error) =>
        ({ ok: false, status: 0, text: async () => err.message }) as unknown as Response,
    );

    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[] };
      return { ok: true, providerMessageId: body.messages?.[0]?.id };
    }
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      retryable: res.status === 0 || res.status === 429 || res.status >= 500,
      error: `${res.status} ${text.slice(0, 300)}`,
    };
  }
}
