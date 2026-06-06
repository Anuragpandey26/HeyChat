import prisma from '../../core/database/prisma.singleton.js';
import { AppError } from '../../core/errors/AppError.js';
import eventBus from '../../core/events/eventBus.js';
import ftsService from '../../shared/services/fts.service.js';
import cacheService from '../../shared/services/cache.service.js';

export class UsersService {
  constructor(db = prisma, storage = null) {
    this.db = db;
    this.storage = storage;
  }

  async getMe(userId) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        bio: true,
        phoneNumber: true,
        profilePictureUrl: true,
        publicKey: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const groupMemberships = await this.db.participant.findMany({
      where: {
        userId,
        role: {
          in: ['MEMBER', 'ADMIN'],
        },
      },
      include: {
        conversation: {
          include: {
            groupDetails: true,
          },
        },
      },
    });

    const groups = groupMemberships.map((m) => ({
      chatId: m.chatId,
      groupName: m.conversation.groupDetails?.groupName,
      groupPhotoUrl: m.conversation.groupDetails?.groupPhotoUrl,
      description: m.conversation.groupDetails?.description,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    return { ...user, groups };
  }

  async updateProfile(userId, data) {
    if (data.username) {
      const existing = await this.db.user.findUnique({
        where: { username: data.username },
      });
      if (existing && existing.id !== userId) {
        throw new AppError('Username is already taken', 400);
      }
    }

    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName,
        bio: data.bio,
        phoneNumber: data.phoneNumber,
        username: data.username,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        bio: true,
        phoneNumber: true,
        profilePictureUrl: true,
      },
    });

    eventBus.emit('USER_PROFILE_UPDATED', updatedUser);

    return updatedUser;
  }

  async updateAvatar(userId, fileBuffer, mimeType) {
    if (!this.storage) {
      throw new AppError('Storage adapter not configured', 500);
    }

    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { profilePictureUrl: true },
    });

    const secureUrl = await this.storage.upload(fileBuffer, mimeType, 'avatars');

    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: { profilePictureUrl: secureUrl },
      select: { id: true, profilePictureUrl: true },
    });

    if (user && user.profilePictureUrl) {
      this.storage.delete(user.profilePictureUrl).catch((err) => {
        console.error('Failed to delete old avatar from storage:', err);
      });
    }

    eventBus.emit('USER_PROFILE_UPDATED', { id: userId, profilePictureUrl: secureUrl });

    return updatedUser;
  }

  async searchUser(query, currentUserId) {
    return ftsService.searchUsers(query, currentUserId);
  }

  async getAllUsers(currentUserId) {
    const users = await this.db.user.findMany({
      where: {
        id: { not: currentUserId },
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        profilePictureUrl: true,
        isOnline: true,
        lastSeen: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    });
    return users;
  }

  async getUserProfile(userId) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        bio: true,
        phoneNumber: true,
        profilePictureUrl: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }

  async blockUser(userId, targetUserId) {
    if (userId === targetUserId) {
      throw new AppError('You cannot block yourself', 400);
    }
    const targetUser = await this.db.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw new AppError('Target user not found', 404);
    }

    const existingBlock = await this.db.blockList.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: userId,
          blockedId: targetUserId,
        },
      },
    });

    if (existingBlock) {
      throw new AppError('User is already blocked', 400);
    }

    const res = await this.db.blockList.create({
      data: {
        blockerId: userId,
        blockedId: targetUserId,
      },
    });

    // Invalidate chat list caches for both users
    await cacheService.delete(`chats:list:${userId}`);
    await cacheService.delete(`chats:list:${targetUserId}`);

    return res;
  }

  async unblockUser(userId, targetUserId) {
    const existingBlock = await this.db.blockList.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: userId,
          blockedId: targetUserId,
        },
      },
    });

    if (!existingBlock) {
      throw new AppError('User is not blocked', 400);
    }

    const res = await this.db.blockList.delete({
      where: {
        blockerId_blockedId: {
          blockerId: userId,
          blockedId: targetUserId,
        },
      },
    });

    // Invalidate chat list caches for both users
    await cacheService.delete(`chats:list:${userId}`);
    await cacheService.delete(`chats:list:${targetUserId}`);

    return res;
  }

  async getBlockedUsers(userId) {
    const blockedList = await this.db.blockList.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profilePictureUrl: true,
          },
        },
      },
    });
    return blockedList.map((b) => b.blocked);
  }
}
