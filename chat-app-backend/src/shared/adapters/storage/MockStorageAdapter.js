import { StorageAdapter } from './StorageAdapter.js';

export class MockStorageAdapter extends StorageAdapter {
  async upload(fileBuffer, mimeType, folder = 'chatapp') {
    const randomId = Math.random().toString(36).substring(7);
    const ext = mimeType.split('/')[1] || 'bin';
    return `https://mockstorage.local/${folder}/mock-${randomId}-${Date.now()}.${ext}`;
  }

  async delete(fileUrl) {
    return { result: 'ok' };
  }
}
