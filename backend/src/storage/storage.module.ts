import { Global, Module } from '@nestjs/common';
import { env } from '../config/env';
import { STORAGE_ADAPTER, StorageAdapter } from './storage.adapter';
import { SupabaseStorageAdapter } from './supabase-storage.adapter';
import { LocalStorageAdapter } from './local-storage.adapter';
import { MediaService } from './media.service';
import { LocalMediaController, MediaController } from './media.controller';

@Global()
@Module({
  controllers: [MediaController, LocalMediaController],
  providers: [
    {
      provide: STORAGE_ADAPTER,
      useFactory: (): StorageAdapter => {
        const e = env();
        if (e.STORAGE_DRIVER === 'supabase') {
          return new SupabaseStorageAdapter(
            e.SUPABASE_URL!,
            e.SUPABASE_SERVICE_ROLE_KEY!,
            e.SUPABASE_STORAGE_BUCKET,
          );
        }
        return new LocalStorageAdapter(e.LOCAL_STORAGE_DIR);
      },
    },
    MediaService,
  ],
  exports: [MediaService, STORAGE_ADAPTER],
})
export class StorageModule {}
