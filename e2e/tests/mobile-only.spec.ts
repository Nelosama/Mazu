import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('navegación móvil del panel con barra inferior', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: 'Servicios' }).click();
  await expect(page.getByRole('heading', { name: 'Servicios' })).toBeVisible();
  await nav.getByRole('link', { name: 'Equipo' }).click();
  await expect(page.getByText('Carlos Mejía')).toBeVisible();
  await nav.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Tu página de reservas' })).toBeVisible();
  // Sin desbordamiento horizontal.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
