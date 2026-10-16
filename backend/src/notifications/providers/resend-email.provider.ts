import { NotificationProvider, OutgoingMessage, SendResult } from './provider';

/** Correo transaccional vía API HTTP de Resend (soporta Idempotency-Key). */
export class ResendEmailProvider implements NotificationProvider {
  readonly name = 'resend';
  readonly channel = 'EMAIL' as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(m: OutgoingMessage): Promise<SendResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': m.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: this.from, to: [m.recipient], subject: m.subject, text: m.text }),
    }).catch((err: Error) => ({ ok: false, status: 0, text: async () => err.message }) as unknown as Response);
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, providerMessageId: body.id };
    }
    const text = await res.text().catch(() => '');
    return { ok: false, retryable: res.status === 0 || res.status === 429 || res.status >= 500, error: `${res.status} ${text.slice(0, 300)}` };
  }
}
