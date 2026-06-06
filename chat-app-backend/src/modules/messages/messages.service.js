import prisma from '../../core/database/prisma.singleton.js';
import { AppError } from '../../core/errors/AppError.js';
import cacheService from '../../shared/services/cache.service.js';
import eventBus from '../../core/events/eventBus.js';
import { env } from '../../core/config/env.config.js';

export class MessagesService {
  constructor(db = prisma, storage = null) {
    this.db = db;
    this.storage = storage;
  }

  async getHistory(userId, chatId, page = 1, limit = 30) {
    // 1. Verify user is active participant
    const participant = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant || !['MEMBER', 'ADMIN'].includes(participant.role)) {
      throw new AppError('You are not a member of this chat conversation', 403);
    }

    const skip = (page - 1) * limit;

    // 2. Fetch messages ordered by sentAt desc
    const filterConditions = {
      chatId,
      sentAt: {
        gt: participant.clearedAt || new Date(0),
      },
    };

    const [messages, totalCount] = await Promise.all([
      this.db.message.findMany({
        where: filterConditions,
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              fullName: true,
              profilePictureUrl: true,
              publicKey: true,
            },
          },
          reactions: {
            select: {
              id: true,
              userId: true,
              emoji: true,
            },
          },
          polls: {
            include: {
              options: {
                include: {
                  votes: {
                    include: {
                      user: {
                        select: {
                          id: true,
                          username: true,
                          fullName: true,
                          profilePictureUrl: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.db.message.count({ where: filterConditions }),
    ]);

    // Format output
    const formattedMessages = messages.map((m) => {
      const msgObj = {
        id: m.id,
        senderId: m.senderId,
        sender: m.sender,
        sentAt: m.sentAt,
        editedAt: m.editedAt,
        mediaType: m.mediaType,
        isDeletedEveryone: m.isDeletedEveryone,
        reactions: m.reactions,
      };

      if (m.isDeletedEveryone) {
        msgObj.encryptedContent = null;
        msgObj.mediaUrl = null;
      } else {
        msgObj.encryptedContent = m.encryptedContent;
        msgObj.mediaUrl = m.mediaUrl;
      }

      if (m.mediaType === 'POLL' && m.polls.length > 0) {
        const poll = m.polls[0];
        msgObj.poll = {
          id: poll.id,
          encryptedQuestion: m.isDeletedEveryone ? null : poll.encryptedQuestion,
          options: poll.options.map((o) => ({
            id: o.id,
            encryptedText: m.isDeletedEveryone ? null : o.encryptedText,
            votes: o.votes.map((v) => ({
              userId: v.userId,
              user: {
                id: v.user.id,
                username: v.user.username,
                fullName: v.user.fullName,
                profilePictureUrl: v.user.profilePictureUrl,
              },
            })),
          })),
        };
      }

      return msgObj;
    });

    return {
      messages: formattedMessages.reverse(), // Return in chronological order
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
    };
  }

  async getMediaGallery(userId, chatId) {
    const participant = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant || !['MEMBER', 'ADMIN'].includes(participant.role)) {
      throw new AppError('You are not a member of this chat conversation', 403);
    }

    // Fetch messages with media
    const mediaMessages = await this.db.message.findMany({
      where: {
        chatId,
        mediaType: {
          in: ['IMAGE', 'VIDEO', 'PDF', 'LINK', 'TEXT'],
        },
        isDeletedEveryone: false,
      },
      orderBy: {
        sentAt: 'desc',
      },
      select: {
        id: true,
        mediaType: true,
        mediaUrl: true,
        encryptedContent: true,
        sentAt: true,
        senderId: true,
      },
    });

    // Group by mediaType
    const gallery = {
      images: [],
      videos: [],
      docs: [],
      links: [],
    };

    mediaMessages.forEach((m) => {
      const item = {
        messageId: m.id,
        url: m.mediaUrl,
        sentAt: m.sentAt,
        senderId: m.senderId,
        encryptedContent: m.encryptedContent, // ciphertext containing links, sizes, durations, filenames
      };

      if (m.mediaType === 'IMAGE') gallery.images.push(item);
      else if (m.mediaType === 'VIDEO') gallery.videos.push(item);
      else if (m.mediaType === 'PDF') gallery.docs.push(item);
      else if (m.mediaType === 'LINK') gallery.links.push(item);
      else if (m.mediaType === 'TEXT' && m.encryptedContent) {
        // Scrape links from text message content
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const matches = m.encryptedContent.match(urlRegex);
        if (matches) {
          matches.forEach((url) => {
            gallery.links.push({
              messageId: m.id,
              url: url,
              sentAt: m.sentAt,
              senderId: m.senderId,
              encryptedContent: m.encryptedContent,
            });
          });
        }
      }
    });

    return gallery;
  }

  async uploadMedia(fileBuffer, mimeType) {
    if (!this.storage) {
      throw new AppError('Storage adapter not configured', 500);
    }

    // Enforce size limits at application layer
    if (mimeType.startsWith('image/')) {
      if (fileBuffer.length > env.MAX_IMAGE_SIZE_BYTES) {
        const kb = Math.round((env.MAX_IMAGE_SIZE_BYTES / 1024) * 10) / 10;
        throw new AppError(`Encrypted image exceeds size limit of ${kb} KB`, 400);
      }
    } else if (mimeType === 'application/pdf') {
      if (fileBuffer.length > env.MAX_PDF_SIZE_BYTES) {
        const mb = Math.round((env.MAX_PDF_SIZE_BYTES / (1024 * 1024)) * 10) / 10;
        throw new AppError(`Encrypted document exceeds size limit of ${mb} MB`, 400);
      }
    } else if (mimeType.startsWith('video/')) {
      if (fileBuffer.length > env.MAX_VIDEO_SIZE_BYTES) {
        const mb = Math.round((env.MAX_VIDEO_SIZE_BYTES / (1024 * 1024)) * 10) / 10;
        throw new AppError(`Encrypted video exceeds safe size limit of ${mb} MB`, 400);
      }
    }

    const folder = mimeType.startsWith('image/')
      ? 'images'
      : mimeType.startsWith('video/')
      ? 'videos'
      : 'docs';

    const fileUrl = await this.storage.upload(fileBuffer, mimeType, folder);
    return fileUrl;
  }

  async deleteForEveryone(userId, messageId) {
    const message = await this.db.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!message) {
      throw new AppError('Message not found', 404);
    }

    // Verify permission: Sender OR Group Admin
    const isSender = message.senderId === userId;
    let isAdmin = false;

    if (message.conversation.chatType === 'GROUP') {
      const userPart = message.conversation.participants.find((p) => p.userId === userId);
      isAdmin = userPart && userPart.role === 'ADMIN';
    }

    if (!isSender && !isAdmin) {
      throw new AppError('You do not have permission to delete this message', 403);
    }

    const timeDiffMs = Date.now() - new Date(message.sentAt).getTime();
    const isWithin30Mins = timeDiffMs <= 30 * 60 * 1000;

    if (isSender && !isAdmin && !isWithin30Mins) {
      throw new AppError('Messages can only be deleted for everyone within 30 minutes of sending', 400);
    }

    // Update message status and purge encrypted contents
    await this.db.message.update({
      where: { id: messageId },
      data: {
        isDeletedEveryone: true,
        encryptedContent: 'This message was deleted',
        mediaUrl: null,
      },
    });

    // Delete media from storage if it was a file upload
    if (message.mediaUrl && this.storage) {
      this.storage.delete(message.mediaUrl).catch((err) => {
        console.error('Failed to delete media file from storage on message delete:', err);
      });
    }

    // Invalidate cached chat lists for all participants in the conversation
    for (const p of message.conversation.participants) {
      await cacheService.delete(`chats:list:${p.userId}`);
    }

    // Notify sockets
    eventBus.emit('MESSAGE_DELETED', {
      messageId,
      chatId: message.chatId,
      participants: message.conversation.participants.map((p) => p.userId),
    });

    return true;
  }
}
