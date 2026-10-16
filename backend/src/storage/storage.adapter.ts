export interface StorageAdapter {
  readonly name: string;
  readonly bucket: string;
  put(path: string, data: Buffer, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');
