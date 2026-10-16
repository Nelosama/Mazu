import { expect, test } from '@playwright/test';
import { login, SUPER_ADMIN } from './helpers';

test.describe('Panel del negocio', () => {
  // Cada proyecto (móvil/escritorio) usa un profesional distinto porque comparten base de datos.
  const staffFor = (project: string) => (project === 'mobile' ? 'Carlos Mejía' : 'Andrea López');

  test('bloqueo rápido en tres interacciones', async ({ page }, info) => {
    await login(page);
    await expect(page.getByRole('tab', { name: 'Día' })).toBeVisible();
    // 1) abrir acción rápida  2) elegir motivo  3) confirmar
    await page.getByRole('button', { name: 'Nuevo' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Profesional').selectOption({ label: staffFor(info.project.name) });
    await dialog.getByRole('button', { name: 'Ausencia', exact: true }).click();
    await dialog.getByRole('button', { name: 'Bloquear horario' }).click();
    await expect(page.getByText('Horario bloqueado')).toBeVisible();
    await page.getByRole('tab', { name: 'Profesional' }).click();
    await expect(page.getByText('Ausencia').first()).toBeVisible();
  });

  test('walk-in → completar → encuesta → dashboard de satisfacción', async ({
    page,
    context,
  }, info) => {
    await login(page);
    await page.getByRole('button', { name: 'Nuevo' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Cliente presencial' }).click();
    await dialog.getByLabel('Profesional').selectOption({ label: 'Luis Ramos' });
    // Inicio en el pasado (distinto por proyecto) para poder completarla de inmediato.
    const start = new Date(Date.now() - (info.project.name === 'mobile' ? 2 : 4) * 3_600_000);
    const local = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Tegucigalpa',
      dateStyle: 'short',
      timeStyle: 'short',
    })
      .format(start)
      .replace(' ', 'T');
    await dialog.getByLabel('Inicio').fill(local);
    const client = `Pedro ${info.project.name}`;
    await dialog.getByLabel('Nombre del cliente').fill(client);
    await dialog.getByRole('button', { name: 'Registrar cliente' }).click();
    await expect(page.getByText('Cliente registrado')).toBeVisible();

    await page.getByRole('tab', { name: 'Profesional' }).click();
    await page.getByLabel('Elegir fecha').fill(local.slice(0, 10));
    await page.getByLabel('Profesional').selectOption({ label: 'Luis Ramos' });
    await page
      .getByRole('button', { name: new RegExp(client) })
      .first()
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Completar' }).click();
    await expect(page.getByText('Enlace de encuesta listo para compartir')).toBeVisible();
    const waHref = await page
      .getByRole('link', { name: 'Enviar por WhatsApp' })
      .getAttribute('href');
    const url = decodeURIComponent(waHref!).match(/https?:\/\/\S+\/f\/[A-Za-z0-9_-]{43}/)![0];

    const survey = await context.newPage();
    await survey.goto(url);
    await expect(survey.getByText('¿Cómo estuvo tu experiencia?')).toBeVisible();
    await survey.getByRole('radio', { name: '4 estrellas' }).click();
    await survey.getByRole('radio', { name: 'Sí' }).click();
    await survey
      .getByLabel('¿Qué podríamos mejorar?')
      .fill(`Todo excelente (${info.project.name}), la espera fue corta`);
    await survey.getByRole('button', { name: 'Enviar' }).click();
    await expect(survey.getByText('¡Gracias por tu opinión!')).toBeVisible();
    // Un segundo intento muestra que ya fue respondida.
    await survey.reload();
    await expect(survey.getByText('¡Gracias por tu opinión!')).toBeVisible();

    await page.goto(page.url().replace(/\/agenda.*$/, '/feedback'));
    await expect(page.getByRole('heading', { name: 'Satisfacción' })).toBeVisible();
    await expect(
      page.getByText(`Todo excelente (${info.project.name}), la espera fue corta`),
    ).toBeVisible();
    await expect(page.getByText(/resultados son orientativos/)).toBeVisible();
  });

  test('el Super Admin ve métricas agregadas', async ({ page }) => {
    await login(page, SUPER_ADMIN);
    await page.goto('/admin');
    await expect(page.getByText('Panel de plataforma')).toBeVisible();
    await expect(page.getByText('Negocios activos')).toBeVisible();
    await page.getByRole('tab', { name: 'Negocios' }).click();
    await expect(page.getByText('Barbería Nova')).toBeVisible();
  });
});
