import prisma from '../../core/database/prisma.singleton.js';
import { AppError } from '../../core/errors/AppError.js';
import queueService from '../../shared/services/queue.service.js';
import StorageFactory from '../../shared/factories/StorageFactory.js';

export class StatusService {
  constructor(db = prisma) {
    this.db = db;
  }

  async createStatus(userId, data, file) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    let mediaUrl = null;
    let statusType = data.statusType;
    let encryptedContent = data.encryptedContent || '';
    let backgroundColor = data.backgroundColor || null;

    if (file) {
      if (!file.mimetype.startsWith('image/')) {
        throw new AppError('Only image uploads are allowed for statuses currently.', 400);
      }
      if (file.buffer.length > 5 * 1024 * 1024) {
        throw new AppError('Status image exceeds 5 MB size limit', 400);
      }

      const storage = StorageFactory.getAdapter();
      mediaUrl = await storage.upload(file.buffer, file.mimetype, 'status_images');
      statusType = 'IMAGE';
      backgroundColor = null;
    } else {
      if (statusType === 'IMAGE') {
        throw new AppError('Image file is required for IMAGE status updates.', 400);
      }
      if (!encryptedContent.trim()) {
        throw new AppError('Status text is required', 400);
      }
    }

    const status = await this.db.status.create({
      data: {
        userId,
        statusType,
        encryptedContent,
        mediaUrl,
        backgroundColor,
        expiresAt,
      },
    });

    // Schedule a queue job to delete the status after 24 hours (for permanent purging)
    await queueService.addJob(
      'purge_status',
      { statusId: status.id },
      expiresAt
    );

    return status;
  }

  async listStatuses(userId) {
    // 1. Get user IDs of mutual contacts (sharing an active 1-on-1 private chat)
    const privateChatParticipants = await this.db.participant.findMany({
      where: {
        userId,
        conversation: {
          chatType: 'PRIVATE',
        },
        role: { in: ['MEMBER', 'ADMIN'] },
      },
      select: {
        chatId: true,
      },
    });

    const chatIds = privateChatParticipants.map((p) => p.chatId);

    const mutualContactIds = await this.db.participant.findMany({
      where: {
        chatId: { in: chatIds },
        userId: { not: userId },
        role: { in: ['MEMBER', 'ADMIN'] },
      },
      select: {
        userId: true,
      },
    });

    const contactIds = mutualContactIds.map((c) => c.userId);

    // 2. Fetch active statuses (self + mutual contacts)
    const statuses = await this.db.status.findMany({
      where: {
        userId: {
          in: [userId, ...contactIds],
        },
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profilePictureUrl: true,
          },
        },
        views: {
          select: {
            viewerId: true,
            isLiked: true,
            emoji: true,
            viewedAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc', // Chronological order per user status stream
      },
    });

    // 3. Group statuses by user
    const groupedFeed = new Map();

    statuses.forEach((s) => {
      const uId = s.user.id;
      if (!groupedFeed.has(uId)) {
        groupedFeed.set(uId, {
          user: s.user,
          statuses: [],
        });
      }

      const viewed = s.views.some((v) => v.viewerId === userId);
      const viewerViews = s.views.find((v) => v.viewerId === userId);
      const isOwner = s.userId === userId;

      groupedFeed.get(uId).statuses.push({
        id: s.id,
        statusType: s.statusType,
        encryptedContent: s.encryptedContent,
        mediaUrl: s.mediaUrl,
        backgroundColor: s.backgroundColor,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        viewed,
        isLiked: viewerViews ? viewerViews.isLiked : false,
        emoji: viewerViews ? viewerViews.emoji : null,
        ...(isOwner ? { viewCount: s.views.length } : {}),
      });
    });

    // Separate self feed from contact feeds for clean rendering
    const selfFeed = groupedFeed.get(userId) || { user: null, statuses: [] };
    if (s => s.user.id === userId) {
      groupedFeed.delete(userId);
    }
    groupedFeed.delete(userId); // remove from contacts map

    return {
      self: selfFeed.statuses,
      contacts: Array.from(groupedFeed.values()),
    };
  }

  async viewStatus(userId, statusId, isLiked = false, emoji = null) {
    const status = await this.db.status.findUnique({
      where: { id: statusId },
      include: {
        user: {
          select: { id: true },
        },
      },
    });

    if (!status) {
      throw new AppError('Status update not found', 404);
    }

    if (status.expiresAt < new Date()) {
      throw new AppError('This status update has expired', 400);
    }

    // Upsert status view
    const view = await this.db.statusView.upsert({
      where: {
        statusId_viewerId: { statusId, viewerId: userId },
      },
      update: {
        isLiked,
        emoji,
      },
      create: {
        statusId,
        viewerId: userId,
        isLiked,
        emoji,
      },
    });

    return view;
  }

  async getStatusViewerList(userId, statusId) {
    const status = await this.db.status.findUnique({
      where: { id: statusId },
    });

    if (!status) {
      throw new AppError('Status update not found', 404);
    }

    // Only status owner can view the viewer list
    if (status.userId !== userId) {
      throw new AppError('Only the status poster can view its viewers list', 403);
    }

    const views = await this.db.statusView.findMany({
      where: { statusId },
      include: {
        viewer: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profilePictureUrl: true,
          },
        },
      },
      orderBy: {
        viewedAt: 'desc',
      },
    });

    return views.map((v) => ({
      viewer: v.viewer,
      isLiked: v.isLiked,
      emoji: v.emoji,
      viewedAt: v.viewedAt,
    }));
  }

  async deleteStatus(userId, statusId) {
    const status = await this.db.status.findUnique({
      where: { id: statusId },
    });

    if (!status) {
      throw new AppError('Status update not found', 404);
    }

    if (status.userId !== userId) {
      throw new AppError('You can only delete your own status updates', 403);
    }

    await this.db.status.delete({
      where: { id: statusId },
    });

    return true;
  }
}
