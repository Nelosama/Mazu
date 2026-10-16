import { buildTheme, contrastRatio, parseHex } from './theme';

describe('buildTheme', () => {
  it.each(['#FFFF00', '#00FF00', '#FFFFFF', '#000000', '#4F46E5', '#F472B6', '#0EA5E9', '#808080'])(
    'garantiza contraste AA para %s',
    (color) => {
      const t = buildTheme(color);
      expect(contrastRatio(parseHex(t.solid)!, parseHex(t.onBrand)!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(parseHex(t.ink)!, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('rechaza valores que no son un color hexadecimal (sin CSS arbitrario)', () => {
    expect(buildTheme('red; background: url(x)').brand).toBe('#4F46E5');
    expect(buildTheme(null).brand).toBe('#4F46E5');
  });

  it('elige texto oscuro sobre colores claros', () => {
    expect(buildTheme('#FFFF00').onBrand).toBe('#111827');
    expect(buildTheme('#1E3A8A').onBrand).toBe('#FFFFFF');
  });
});
