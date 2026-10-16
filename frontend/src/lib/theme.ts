/**
 * Tema dinámico a partir del color principal del negocio.
 * Solo se acepta un color hexadecimal (#RRGGBB): nunca CSS arbitrario.
 * Se derivan variantes que garantizan contraste WCAG AA (4.5:1) para texto.
 */

export const DEFAULT_BRAND = '#4F46E5';
const HEX = /^#[0-9a-fA-F]{6}$/;

type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  if (!HEX.test(hex)) return null;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}

export function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

export function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const WHITE: RGB = [255, 255, 255];
const INK: RGB = [17, 24, 39]; // gray-900

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;
}

/** Oscurece (o aclara) hasta alcanzar el contraste mínimo contra `against`. */
function ensureContrast(color: RGB, against: RGB, min: number): RGB {
  let c = color;
  const target = luminance(against) > 0.5 ? INK : WHITE;
  for (let t = 0.05; contrastRatio(c, against) < min && t <= 1; t += 0.05)
    c = mix(color, target, t);
  return c;
}

export interface BrandTheme {
  brand: string;
  /** Texto sobre fondo de marca (blanco o casi negro, el de mayor contraste). */
  onBrand: string;
  /** Variante de la marca para texto/enlaces sobre fondo blanco (≥ 4.5:1). */
  ink: string;
  /** Fondo suave para chips y estados seleccionados. */
  soft: string;
  /** Color de botón con contraste ≥ 4.5:1 respecto a su texto. */
  solid: string;
}

export function buildTheme(input: string | null | undefined): BrandTheme {
  const rgb = parseHex(input ?? '') ?? parseHex(DEFAULT_BRAND)!;
  const whiteContrast = contrastRatio(rgb, WHITE);
  const inkContrast = contrastRatio(rgb, INK);
  const onBrandRgb = whiteContrast >= inkContrast ? WHITE : INK;
  const solid = ensureContrast(rgb, onBrandRgb, 4.5);
  return {
    brand: toHex(rgb),
    onBrand: toHex(onBrandRgb),
    ink: toHex(ensureContrast(rgb, WHITE, 4.5)),
    soft: toHex(mix(rgb, WHITE, 0.88)),
    solid: toHex(solid),
  };
}

export function applyTheme(theme: BrandTheme, el: HTMLElement = document.documentElement) {
  el.style.setProperty('--brand', theme.solid);
  el.style.setProperty('--brand-fg', theme.onBrand);
  el.style.setProperty('--brand-ink', theme.ink);
  el.style.setProperty('--brand-soft', theme.soft);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.solid);
}
