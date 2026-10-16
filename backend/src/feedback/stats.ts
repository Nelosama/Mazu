/** Utilidades estadísticas simples y honestas para muestras pequeñas. */

export const MIN_RELIABLE_SAMPLE = 10;

/** Intervalo de Wilson al 95 % para una proporción. */
export function wilsonInterval(
  successes: number,
  n: number,
  z = 1.96,
): { low: number; high: number } | null {
  if (n === 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** Media con intervalo aproximado al 95 % (t≈2 para n pequeño, conservador). */
export function meanWithInterval(values: number[]) {
  const n = values.length;
  if (n === 0) return { mean: null, low: null, high: null, n, reliable: false };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean, low: null, high: null, n, reliable: false };
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
  const t = n < 30 ? 2.1 : 1.96;
  const half = t * Math.sqrt(variance / n);
  return {
    mean: round(mean),
    low: round(Math.max(1, mean - half)),
    high: round(Math.min(5, mean + half)),
    n,
    reliable: n >= MIN_RELIABLE_SAMPLE,
  };
}

export function round(v: number, d = 2) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** Categorías simples de comentarios por palabras clave (sin IA de pago). */
const CATEGORIES: Record<string, string[]> = {
  waiting_time: [
    'espera',
    'esperar',
    'tarde',
    'retraso',
    'demora',
    'wait',
    'late',
    'delay',
    'atraso',
  ],
  price: ['precio', 'caro', 'costoso', 'price', 'expensive', 'cost', 'preço', 'caro'],
  cleanliness: ['limpio', 'limpieza', 'sucio', 'clean', 'dirty', 'higiene', 'hygiene', 'limpeza'],
  attention: [
    'atención',
    'atencion',
    'amable',
    'trato',
    'grosero',
    'friendly',
    'rude',
    'service',
    'atendimento',
  ],
  result: ['corte', 'resultado', 'quedó', 'quedo', 'result', 'haircut', 'uñas', 'nails', 'color'],
  booking: ['reserva', 'cita', 'agenda', 'booking', 'appointment', 'horario', 'agendamento'],
};

export function categorize(comment: string | null | undefined): string[] {
  if (!comment) return [];
  const text = comment.toLowerCase();
  return Object.entries(CATEGORIES)
    .filter(([, words]) => words.some((w) => text.includes(w)))
    .map(([k]) => k);
}
