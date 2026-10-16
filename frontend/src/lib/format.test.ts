import { formatMoney, formatTime, hhmmToMinutes, minutesToHHMM } from './format';
import { buildIcs } from './ics';

describe('formatos regionales', () => {
  it('formatea monedas ISO 4217 según idioma', () => {
    expect(formatMoney('250.00', 'HNL', 'es-HN')).toMatch(/250/);
    expect(formatMoney('1234.5', 'USD', 'en-US')).toBe('$1,234.50');
    expect(formatMoney('1000', 'BRL', 'pt-BR')).toMatch(/R\$\s?1\.000/);
  });
  it('muestra la hora en la zona del negocio, no la del navegador', () => {
    const iso = '2026-10-19T15:00:00.000Z';
    expect(formatTime(iso, 'America/Mexico_City', 'en-US')).toBe('9:00 AM');
    expect(formatTime(iso, 'Europe/Madrid', 'es')).toBe('17:00');
  });
  it('convierte minutos', () => {
    expect(minutesToHHMM(570)).toBe('09:30');
    expect(hhmmToMinutes('18:15')).toBe(1095);
  });
  it('genera un archivo de calendario válido', () => {
    const ics = buildIcs({
      uid: 'x@y',
      title: 'Corte, barba',
      start: '2026-10-19T15:00:00Z',
      end: '2026-10-19T15:30:00Z',
    });
    expect(ics).toContain('DTSTART:20261019T150000Z');
    expect(ics).toContain('SUMMARY:Corte\\, barba');
  });
});
