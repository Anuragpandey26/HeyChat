import { MessagesService } from './messages.service.js';
import StorageFactory from '../../shared/factories/StorageFactory.js';
import { AppError } from '../../core/errors/AppError.js';

export class MessagesController {
  async getHistory(req, res, next) {
    try {
      const { chatId } = req.params;
      const { page, limit } = req.query;

      const service = new MessagesService();
      const result = await service.getHistory(req.user.id, chatId, page, limit);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async getMediaGallery(req, res, next) {
    try {
      const { chatId } = req.params;

      const service = new MessagesService();
      const gallery = await service.getMediaGallery(req.user.id, chatId);

      res.status(200).json({
        status: 'success',
        data: { gallery },
      });
    } catch (err) {
      next(err);
    }
  }

  async uploadMedia(req, res, next) {
    try {
      if (!req.file) {
        return next(new AppError('No file uploaded', 400));
      }

      const storage = StorageFactory.getAdapter();
      const service = new MessagesService(undefined, storage);
      
      const fileUrl = await service.uploadMedia(req.file.buffer, req.file.mimetype);

      res.status(201).json({
        status: 'success',
        message: 'Media uploaded successfully',
        data: { fileUrl },
      });
    } catch (err) {
      next(err);
    }
  }
}
