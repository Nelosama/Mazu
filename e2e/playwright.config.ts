import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 4173;
const DB =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/booking_e2e?schema=public';

const apiEnv = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  DATABASE_URL: DB,
  DIRECT_DATABASE_URL: DB,
  JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef0123456789',
  FRONTEND_URL: `http://127.0.0.1:${WEB_PORT}`,
  PUBLIC_APP_URL: `http://127.0.0.1:${WEB_PORT}`,
  STORAGE_DRIVER: 'local',
  LOCAL_STORAGE_DIR: '.local-storage-e2e',
  NOTIFICATIONS_DEV_LOG: 'true',
  JOBS_ENABLED: 'false',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-HN',
    timezoneId: 'America/Tegucigalpa',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile-only/ },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../backend',
      port: API_PORT,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: '../frontend',
      port: WEB_PORT,
      env: { VITE_DEV_API_TARGET: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
