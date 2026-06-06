import { v2 as cloudinary } from 'cloudinary';
import { StorageAdapter } from './StorageAdapter.js';
import { env } from '../../../core/config/env.config.js';

export class CloudinaryAdapter extends StorageAdapter {
  constructor() {
    super();
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
  }

  async upload(fileBuffer, mimeType, folder = 'chatapp') {
    return new Promise((resolve, reject) => {
      let resourceType = 'auto';
      let publicId = undefined;

      if (mimeType.startsWith('image/')) {
        resourceType = 'image';
      } else if (mimeType.startsWith('video/')) {
        resourceType = 'video';
      } else {
        resourceType = 'raw';
        const randomId = Math.random().toString(36).substring(7);
        const ext = mimeType.split('/')[1] || 'bin';
        publicId = `file-${randomId}-${Date.now()}.${ext}`;
      }

      const options = {
        folder,
        resource_type: resourceType,
      };

      if (publicId) {
        options.public_id = publicId;
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(fileBuffer);
    });
  }

  async delete(fileUrl) {
    if (!fileUrl) return;
    try {
      // Extract public ID from Cloudinary URL
      // Format: https://res.cloudinary.com/cloud_name/image/upload/v1234567/folder/public_id.ext
      const parts = fileUrl.split('/');
      const uploadIndex = parts.indexOf('upload');
      const resourceType = uploadIndex !== -1 ? parts[uploadIndex - 1] : 'image';

      const lastPart = parts.pop();
      const folderPart = parts.pop();
      
      // Raw files require the file extension in public_id during deletion
      const publicId = resourceType === 'raw'
        ? lastPart
        : lastPart.substring(0, lastPart.lastIndexOf('.'));
        
      const fullPublicId = folderPart && folderPart !== 'upload' ? `${folderPart}/${publicId}` : publicId;

      return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(fullPublicId, { resource_type: resourceType }, (error, result) => {
          if (error) return reject(error);
          resolve(result);
        });
      });
    } catch (err) {
      console.error('Failed to parse Cloudinary URL for deletion:', err);
      return { result: 'not_found' };
    }
  }
}
