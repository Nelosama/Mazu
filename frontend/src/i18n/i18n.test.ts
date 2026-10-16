import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import es from './locales/es.json';
import en from './locales/en.json';
import pt from './locales/pt.json';

type Tree = { [k: string]: string | Tree };
const flatten = (o: Tree, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${p}${k}`] : flatten(v, `${p}${k}.`),
  );
const base = (k: string) => k.replace(/_(one|other|zero|few|many)$/, '');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|ts)$/.test(f) && !f.includes('.test.') ? [full] : [];
  });
}

describe('traducciones', () => {
  const esKeys = new Set(flatten(es as Tree));
  const enKeys = new Set(flatten(en as Tree));

  it('español e inglés tienen exactamente las mismas claves', () => {
    expect([...esKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !esKeys.has(k))).toEqual([]);
  });

  it('portugués no contiene claves inexistentes', () => {
    expect(flatten(pt as Tree).filter((k) => !esKeys.has(k))).toEqual([]);
  });

  it('todas las claves literales usadas en el código existen', () => {
    const esBase = new Set([...esKeys].map(base));
    const missing: string[] = [];
    for (const file of sourceFiles(join(__dirname, '..'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
        if (!esBase.has(m[1]) && !esKeys.has(m[1]))
          missing.push(`${m[1]} (${file.split('src/')[1]})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('las variables de interpolación coinciden entre idiomas', () => {
    const get = (o: Tree, k: string) =>
      k.split('.').reduce<string | Tree>((acc, part) => (acc as Tree)[part], o) as string;
    const vars = (s: string) =>
      [...s.matchAll(/\{\{(\w+)\}\}/g)]
        .map((m) => m[1])
        .sort()
        .join(',');
    const diff = [...esKeys].filter((k) => vars(get(es as Tree, k)) !== vars(get(en as Tree, k)));
    expect(diff).toEqual([]);
  });
});
