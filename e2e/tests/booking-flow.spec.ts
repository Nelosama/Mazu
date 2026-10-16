import { expect, test } from '@playwright/test';
import { nextLocalPhone } from './helpers';

test.describe('Flujo público de reserva', () => {
  test('un cliente reserva sin cuenta, gestiona y cancela su cita', async ({ page }) => {
    await page.goto('/b/barberia-nova');
    await expect(page.getByRole('heading', { level: 1, name: 'Barbería Nova' })).toBeVisible();
    await expect(page.getByText('Corte clásico')).toBeVisible();

    await page.getByRole('button', { name: 'Reservar cita' }).click();
    await page.getByRole('button', { name: /Corte \+ barba/ }).click();
    await page.getByRole('button', { name: /Cualquier profesional/ }).click();

    // Primer horario disponible.
    const firstSlot = page.locator('button[aria-pressed]').first();
    await expect(firstSlot).toBeVisible();
    await firstSlot.click();

    await page.getByLabel('Nombre').fill('María Prueba');
    await page.getByRole('textbox', { name: 'WhatsApp' }).fill('123'); // inválido
    await page.getByRole('button', { name: 'Confirmar reserva' }).click();
    await expect(page.getByText(/no parece válido/)).toBeVisible();

    await page.getByRole('textbox', { name: 'WhatsApp' }).fill(nextLocalPhone());
    await page.getByRole('button', { name: 'Confirmar reserva' }).click();
    await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible();
    await expect(page.getByText('El pago se realiza directamente en el negocio.')).toBeVisible();

    const manageHref = await page
      .getByRole('link', { name: 'Ver o modificar mi cita' })
      .getAttribute('href');
    expect(manageHref).toMatch(/\/m\/[A-Za-z0-9_-]{43}$/);
    await page.goto(manageHref!);
    await expect(page.getByRole('heading', { name: 'Tu cita' })).toBeVisible();
    await expect(page.getByText('Confirmada')).toBeVisible();

    await page.getByRole('button', { name: 'Cancelar cita' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar' }).click();
    await expect(page.getByText('Tu cita fue cancelada.')).toBeVisible();
    await expect(page.getByText('Cancelada', { exact: true })).toBeVisible();
  });

  test('el enlace de gestión inválido no revela información', async ({ page }) => {
    await page.goto(`/m/${'x'.repeat(43)}`);
    await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toBeVisible();
  });

  test('la página pública cambia de idioma', async ({ page }) => {
    await page.goto('/b/barberia-nova');
    await page.getByLabel('Idioma').selectOption('en');
    await expect(page.getByRole('button', { name: 'Book an appointment' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();
    await page.getByLabel('Language').selectOption('es');
  });

  test('negocio inexistente muestra 404', async ({ page }) => {
    await page.goto('/b/no-existe-este-negocio');
    await expect(page.getByText('Página no encontrada')).toBeVisible();
  });
});
