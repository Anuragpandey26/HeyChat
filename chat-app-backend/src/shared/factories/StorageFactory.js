import { CloudinaryAdapter } from '../adapters/storage/CloudinaryAdapter.js';
import { MockStorageAdapter } from '../adapters/storage/MockStorageAdapter.js';
import { env } from '../../core/config/env.config.js';

class StorageFactory {
  static getAdapter() {
    const useCloudinary =
      env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET;

    if (!useCloudinary) {
      return new MockStorageAdapter();
    }

    return new CloudinaryAdapter();
  }
}

export default StorageFactory;
