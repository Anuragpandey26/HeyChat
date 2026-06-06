export class StorageAdapter {
  async upload(fileBuffer, mimeType, folder = 'chatapp') {
    throw new Error('Method "upload" must be implemented');
  }

  async delete(fileUrl) {
    throw new Error('Method "delete" must be implemented');
  }
}
