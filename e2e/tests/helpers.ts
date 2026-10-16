import { expect, type Page } from '@playwright/test';

export const OWNER = { email: 'demo.owner@example.com', password: 'demo-password-123' };
export const SUPER_ADMIN = { email: 'demo.superadmin@example.com', password: 'demo-password-123' };

let phoneSeq = Date.now() % 1_000_000;
/** Número móvil hondureño válido (8 dígitos) distinto en cada llamada. */
export const nextLocalPhone = () => `9${String(phoneSeq++ % 10_000_000).padStart(7, '0')}`;

export async function login(page: Page, who = OWNER) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(who.email);
  await page.getByLabel('Contraseña').fill(who.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/.+\/agenda|\/app$/);
}
