import { countryOptions, toE164 } from './phone';

describe('teléfonos internacionales', () => {
  it('normaliza a E.164 según el país', () => {
    expect(toE164('9988-7766', 'HN')).toBe('+50499887766');
    expect(toE164('55 1234 5678', 'MX')).toBe('+525512345678');
    expect(toE164('+34 612 34 56 78', 'HN')).toBe('+34612345678');
  });
  it('rechaza números inválidos', () => {
    expect(toE164('123', 'HN')).toBeNull();
    expect(toE164('abc', 'MX')).toBeNull();
  });
  it('lista países con prefijo', () => {
    const list = countryOptions('es');
    expect(list.find((c) => c.code === 'BR')?.dial).toBe('+55');
    expect(list.length).toBeGreaterThan(200);
  });
});
