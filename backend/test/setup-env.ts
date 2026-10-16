import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env.test'), override: true, quiet: true });
process.env.LOCAL_STORAGE_DIR = resolve(__dirname, '../.local-storage-test');
process.env.NOTIFICATIONS_WORKER_ENABLED = 'false';
process.env.JOBS_ENABLED = 'false';
