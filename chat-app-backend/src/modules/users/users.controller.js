import { UsersService } from './users.service.js';
import StorageFactory from '../../shared/factories/StorageFactory.js';
import { AppError } from '../../core/errors/AppError.js';

export class UsersController {
  async getMe(req, res, next) {
    try {
      const service = new UsersService();
      const profile = await service.getMe(req.user.id);

      res.status(200).json({
        status: 'success',
        data: { profile },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const service = new UsersService();
      const profile = await service.updateProfile(req.user.id, req.body);

      res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully',
        data: { profile },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateAvatar(req, res, next) {
    try {
      if (!req.file) {
        return next(new AppError('No file uploaded', 400));
      }

      if (!req.file.mimetype.startsWith('image/')) {
        return next(new AppError('Uploaded file must be an image', 400));
      }

      // Enforce 100 KB limit for user profile avatars to balance quality and limits
      if (req.file.size > 100 * 1024) {
        return next(new AppError('Profile picture exceeds size limit of 100 KB', 400));
      }

      const storage = StorageFactory.getAdapter();
      const service = new UsersService(undefined, storage);
      const profile = await service.updateAvatar(req.user.id, req.file.buffer, req.file.mimetype);

      res.status(200).json({
        status: 'success',
        message: 'Avatar updated successfully',
        data: { profile },
      });
    } catch (err) {
      next(err);
    }
  }

  async searchUser(req, res, next) {
    try {
      const { username } = req.params;
      const service = new UsersService();
      const users = await service.searchUser(username, req.user.id);

      res.status(200).json({
        status: 'success',
        data: { users },
      });
    } catch (err) {
      next(err);
    }
  }

  async listAllUsers(req, res, next) {
    try {
      const service = new UsersService();
      const users = await service.getAllUsers(req.user.id);

      res.status(200).json({
        status: 'success',
        data: { users },
      });
    } catch (err) {
      next(err);
    }
  }

  async blockUser(req, res, next) {
    try {
      const { targetUserId } = req.body;
      if (!targetUserId) {
        throw new AppError('targetUserId is required', 400);
      }
      const service = new UsersService();
      await service.blockUser(req.user.id, targetUserId);

      res.status(200).json({
        status: 'success',
        message: 'User blocked successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async unblockUser(req, res, next) {
    try {
      const { targetUserId } = req.body;
      if (!targetUserId) {
        throw new AppError('targetUserId is required', 400);
      }
      const service = new UsersService();
      await service.unblockUser(req.user.id, targetUserId);

      res.status(200).json({
        status: 'success',
        message: 'User unblocked successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async getBlockedUsers(req, res, next) {
    try {
      const service = new UsersService();
      const users = await service.getBlockedUsers(req.user.id);

      res.status(200).json({
        status: 'success',
        data: { users },
      });
    } catch (err) {
      next(err);
    }
  }

  async getUserProfile(req, res, next) {
    try {
      const { userId } = req.params;
      const service = new UsersService();
      const profile = await service.getUserProfile(userId);

      res.status(200).json({
        status: 'success',
        data: { profile },
      });
    } catch (err) {
      next(err);
    }
  }
}
