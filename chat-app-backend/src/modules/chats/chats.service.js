import prisma from '../../core/database/prisma.singleton.js';
import { AppError } from '../../core/errors/AppError.js';
import eventBus from '../../core/events/eventBus.js';
import cacheService from '../../shared/services/cache.service.js';
import socketService from '../../shared/services/socket.service.js';

export class ChatsService {
  constructor(db = prisma) {
    this.db = db;
  }

  async listChats(userId) {
    const cacheKey = `chats:list:${userId}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    // 1. Fetch conversations where user is an active participant (role = MEMBER or ADMIN)
    const participants = await this.db.participant.findMany({
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
            participants: {
              where: {
                role: {
                  in: ['MEMBER', 'ADMIN'],
                },
              },
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    fullName: true,
                    bio: true,
                    profilePictureUrl: true,
                    publicKey: true,
                    isOnline: true,
                    lastSeen: true,
                  },
                },
              },
            },
            messages: {
              orderBy: {
                sentAt: 'desc',
              },
              take: 1,
            },
          },
        },
      },
    });

    // 2. Map conversations to standard output schema
    const chats = await Promise.all(
      participants.map(async (p) => {
        const conv = p.conversation;
        const lastMsg = conv.messages[0] || null;
        
        // Filter lastMsg by user's clearedAt timestamp
        const filteredLastMsg = (lastMsg && (!p.clearedAt || new Date(lastMsg.sentAt) > new Date(p.clearedAt))) ? lastMsg : null;

        // Hide private chats that have been cleared and have no new messages since, AND the user hasn't re-opened it (i.e. joinedAt is not after clearedAt)
        if (conv.chatType === 'PRIVATE' && p.clearedAt && !filteredLastMsg && new Date(p.joinedAt) < new Date(p.clearedAt)) {
          return null;
        }

        // Calculate unread count since clearedAt
        const unreadCount = await this.db.message.count({
          where: {
            chatId: conv.id,
            senderId: { not: userId },
            sentAt: {
              gt: p.clearedAt || new Date(0),
            },
            receipts: {
              none: {
                recipientId: userId,
                status: 'SEEN',
              },
            },
          },
        });

        const chatObj = {
          chatId: conv.id,
          chatType: conv.chatType,
          isPinned: p.isPinned,
          joinedAt: p.joinedAt,
          unreadCount,
          lastMessage: filteredLastMsg
            ? {
                id: filteredLastMsg.id,
                senderId: filteredLastMsg.senderId,
                encryptedContent: filteredLastMsg.isDeletedEveryone ? null : filteredLastMsg.encryptedContent,
                mediaType: filteredLastMsg.mediaType,
                mediaUrl: filteredLastMsg.isDeletedEveryone ? null : filteredLastMsg.mediaUrl,
                sentAt: filteredLastMsg.sentAt,
                editedAt: filteredLastMsg.editedAt,
                isDeletedEveryone: filteredLastMsg.isDeletedEveryone,
              }
            : null,
        };

        if (conv.chatType === 'GROUP') {
          chatObj.groupDetails = {
            groupName: conv.groupDetails.groupName,
            description: conv.groupDetails.description,
            groupPhotoUrl: conv.groupDetails.groupPhotoUrl,
            onlyAdminsCanSend: conv.groupDetails.onlyAdminsCanSend,
            role: p.role,
          };
          chatObj.participantsCount = conv.participants.length;
        } else {
          // 1-on-1 private chat
          // Find the other participant
          const otherPart = conv.participants.find((part) => part.userId !== userId);
          if (otherPart) {
            chatObj.recipient = {
              id: otherPart.user.id,
              username: otherPart.user.username,
              fullName: otherPart.user.fullName,
              bio: otherPart.user.bio,
              profilePictureUrl: otherPart.user.profilePictureUrl,
              publicKey: otherPart.user.publicKey,
              isOnline: otherPart.user.isOnline,
              lastSeen: otherPart.user.lastSeen,
            };
            
            const blocks = await this.db.blockList.findMany({
              where: {
                OR: [
                  { blockerId: userId, blockedId: otherPart.user.id },
                  { blockerId: otherPart.user.id, blockedId: userId },
                ],
              },
            });
            chatObj.blockedBySelf = blocks.some((b) => b.blockerId === userId);
            chatObj.blockedByRecipient = blocks.some((b) => b.blockerId === otherPart.user.id);
          } else {
            // Self-chat fallback
            const selfPart = conv.participants.find((part) => part.userId === userId);
            chatObj.recipient = {
              id: selfPart.user.id,
              username: selfPart.user.username,
              fullName: selfPart.user.fullName,
              bio: selfPart.user.bio,
              profilePictureUrl: selfPart.user.profilePictureUrl,
              publicKey: selfPart.user.publicKey,
              isOnline: selfPart.user.isOnline,
              lastSeen: selfPart.user.lastSeen,
            };
          }
        }

        return chatObj;
      })
    );

    const filteredChats = chats.filter(Boolean);

    // Sort pinned conversations to the top, then sort by lastMessage.sentAt or conversation.createdAt
    const sortedChats = filteredChats.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      const timeA = a.lastMessage ? new Date(a.lastMessage.sentAt).getTime() : new Date(a.joinedAt).getTime();
      const timeB = b.lastMessage ? new Date(b.lastMessage.sentAt).getTime() : new Date(b.joinedAt).getTime();
      return timeB - timeA;
    });

    await cacheService.set(cacheKey, sortedChats, 3600);

    return sortedChats;
  }

  async createPrivateChat(userId, targetUserId) {
    if (userId === targetUserId) {
      throw new AppError('Cannot start a chat with yourself', 400);
    }

    // Check if target user exists
    const targetUser = await this.db.user.findUnique({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw new AppError('Target user does not exist', 404);
    }

    // Check if an active private chat already exists between these two users
    const existingChat = await this.db.conversation.findFirst({
      where: {
        chatType: 'PRIVATE',
        participants: {
          every: {
            userId: {
              in: [userId, targetUserId],
            },
          },
        },
      },
      include: {
        participants: true,
      },
    });

    if (existingChat && existingChat.participants.length === 2) {
      // Re-activate if left/removed (though normally not possible in PRIVATE, let's keep it safe)
      await this.db.participant.updateMany({
        where: {
          chatId: existingChat.id,
          userId: { in: [userId, targetUserId] },
        },
        data: {
          role: 'MEMBER',
        },
      });

      // Update joinedAt to now so the chat shows up in the sidebar list (since joinedAt > clearedAt)
      await this.db.participant.update({
        where: {
          chatId_userId: {
            chatId: existingChat.id,
            userId: userId,
          },
        },
        data: {
          joinedAt: new Date(),
        },
      });

      // Invalidate cache for the initiating user
      await cacheService.delete(`chats:list:${userId}`);

      return { chatId: existingChat.id, isNew: false };
    }

    // Create a transaction
    const newChat = await this.db.$transaction(async (tx) => {
      const conv = await tx.conversation.create({
        data: {
          chatType: 'PRIVATE',
        },
      });

      await tx.participant.createMany({
        data: [
          { chatId: conv.id, userId: userId, role: 'MEMBER' },
          { chatId: conv.id, userId: targetUserId, role: 'MEMBER' },
        ],
      });

      return conv;
    });

    // Notify listeners
    eventBus.emit('CHAT_CREATED', { chatId: newChat.id, chatType: 'PRIVATE', creatorId: userId, recipientId: targetUserId });

    return { chatId: newChat.id, isNew: true };
  }

  async createGroupChat(userId, groupName, participantIds, description = null) {
    // Check if participants are registered
    const totalUsers = await this.db.user.count({
      where: {
        id: {
          in: participantIds,
        },
      },
    });

    if (totalUsers !== participantIds.length) {
      throw new AppError('One or more participant IDs are not registered users', 400);
    }

    // Initialize group creation
    const newGroup = await this.db.$transaction(async (tx) => {
      const conv = await tx.conversation.create({
        data: {
          chatType: 'GROUP',
        },
      });

      await tx.groupDetails.create({
        data: {
          chatId: conv.id,
          groupName,
          description,
        },
      });

      // Creator is ADMIN, others are MEMBERs
      const participantsData = [
        { chatId: conv.id, userId, role: 'ADMIN' },
        ...participantIds.map((pId) => ({
          chatId: conv.id,
          userId: pId,
          role: 'MEMBER',
        })),
      ];

      // Clean duplicates if any
      const uniqueParticipants = Array.from(new Map(participantsData.map(item => [item.userId, item])).values());

      await tx.participant.createMany({
        data: uniqueParticipants,
      });

      // Retrieve creator user details for system message
      const creator = await tx.user.findUnique({
        where: { id: userId },
      });

      await tx.message.create({
        data: {
          chatId: conv.id,
          senderId: userId,
          encryptedContent: `[SYSTEM]:${creator.fullName} created group "${groupName}"`,
          mediaType: 'TEXT',
        },
      });

      return conv;
    });

    eventBus.emit('CHAT_CREATED', { chatId: newGroup.id, chatType: 'GROUP', creatorId: userId, participantIds });

    return { chatId: newGroup.id };
  }

  async updateGroup(userId, chatId, data) {
    // Verify user is group admin
    const participant = await this.db.participant.findUnique({
      where: {
        chatId_userId: { chatId, userId },
      },
    });

    if (!participant || participant.role !== 'ADMIN') {
      throw new AppError('Only administrators can edit group profile', 403);
    }

    await this.db.groupDetails.update({
      where: { chatId },
      data: {
        groupName: data.groupName,
        description: data.description,
        onlyAdminsCanSend: data.onlyAdminsCanSend,
        groupPhotoUrl: data.groupPhotoUrl,
      },
    });

    eventBus.emit('GROUP_UPDATED', {
      chatId,
      groupName: data.groupName,
      description: data.description,
      onlyAdminsCanSend: data.onlyAdminsCanSend,
      groupPhotoUrl: data.groupPhotoUrl,
    });

    return true;
  }

  async addMember(adminId, chatId, userIdToAdd) {
    const adminPart = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId: adminId } },
    });

    if (!adminPart || adminPart.role !== 'ADMIN') {
      throw new AppError('Only administrators can add members to the group', 403);
    }

    const userToAdd = await this.db.user.findUnique({
      where: { id: userIdToAdd },
    });
    if (!userToAdd) {
      throw new AppError('User to add does not exist', 404);
    }

    const existingPart = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId: userIdToAdd } },
    });

    if (existingPart) {
      if (existingPart.role === 'MEMBER' || existingPart.role === 'ADMIN') {
        throw new AppError('User is already a member of this group', 400);
      }
      // Re-add former member
      await this.db.participant.update({
        where: { chatId_userId: { chatId, userId: userIdToAdd } },
        data: {
          role: 'MEMBER',
          leftAt: null,
        },
      });
    } else {
      await this.db.participant.create({
        data: {
          chatId,
          userId: userIdToAdd,
          role: 'MEMBER',
        },
      });
    }

    const adminUser = await this.db.user.findUnique({ where: { id: adminId } });
    await this.createSystemMessage(chatId, adminId, `[SYSTEM]:${userToAdd.fullName} was added by ${adminUser.fullName}`);

    eventBus.emit('GROUP_MEMBER_ADDED', { chatId, userId: userIdToAdd });

    return true;
  }

  async removeMemberOrLeave(userId, chatId, targetUserId) {
    const targetIsSelf = userId === targetUserId;

    const requesterPart = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!requesterPart || requesterPart.role === 'LEFT' || requesterPart.role === 'REMOVED') {
      throw new AppError('You are not a participant in this group', 400);
    }

    const targetPart = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId: targetUserId } },
    });

    if (!targetPart || targetPart.role === 'LEFT' || targetPart.role === 'REMOVED') {
      throw new AppError('Target user is not an active participant in this group', 400);
    }

    // Fetch user details for system message
    const targetUser = await this.db.user.findUnique({ where: { id: targetUserId } });
    const actorUser = await this.db.user.findUnique({ where: { id: userId } });

    if (!targetIsSelf) {
      // Removing member - verify requester is admin
      if (requesterPart.role !== 'ADMIN') {
        throw new AppError('Only administrators can remove group members', 403);
      }

      await this.db.participant.update({
        where: { chatId_userId: { chatId, userId: targetUserId } },
        data: {
          role: 'REMOVED',
          leftAt: new Date(),
        },
      });

      await this.createSystemMessage(chatId, userId, `[SYSTEM]:${targetUser.fullName} was removed by ${actorUser.fullName}`);

      eventBus.emit('GROUP_MEMBER_REMOVED', { chatId, userId: targetUserId, removedBy: userId });
    } else {
      // Leaving group
      await this.db.participant.update({
        where: { chatId_userId: { chatId, userId } },
        data: {
          role: 'LEFT',
          leftAt: new Date(),
        },
      });

      await this.createSystemMessage(chatId, userId, `[SYSTEM]:${actorUser.fullName} left the group`);

      eventBus.emit('GROUP_MEMBER_REMOVED', { chatId, userId, removedBy: userId });
    }

    return true;
  }

  async getGroupMembers(userId, chatId) {
    // Verify user is a participant
    const participant = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant) {
      throw new AppError('You are not a member of this chat conversation', 403);
    }

    const participants = await this.db.participant.findMany({
      where: { chatId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            bio: true,
            profilePictureUrl: true,
            isOnline: true,
            lastSeen: true,
          },
        },
      },
    });

    return participants.map((p) => ({
      userId: p.userId,
      role: p.role,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      user: p.user,
    }));
  }

  async createSystemMessage(chatId, actorId, content) {
    const msg = await this.db.message.create({
      data: {
        chatId,
        senderId: actorId,
        encryptedContent: content,
        mediaType: 'TEXT',
      },
      include: {
        sender: {
          select: { id: true, username: true, fullName: true, profilePictureUrl: true, publicKey: true },
        },
      },
    });

    const responseMsg = {
      id: msg.id,
      chatId: msg.chatId,
      senderId: msg.senderId,
      sender: msg.sender,
      sentAt: msg.sentAt,
      mediaType: msg.mediaType,
      mediaUrl: msg.mediaUrl,
      encryptedContent: msg.encryptedContent,
      isDeletedEveryone: false,
      reactions: [],
    };

    socketService.emitToRoom(`chat:${chatId}`, 'receive_message', responseMsg);
  }

  async togglePinChat(userId, chatId) {
    const participant = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant) {
      throw new AppError('Chat conversation not found', 404);
    }

    const updated = await this.db.participant.update({
      where: { chatId_userId: { chatId, userId } },
      data: {
        isPinned: !participant.isPinned,
      },
    });

    return updated.isPinned;
  }

  async deleteChat(userId, chatId, deleteType) {
    const participant = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId } },
      include: {
        conversation: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!participant || !['MEMBER', 'ADMIN'].includes(participant.role)) {
      throw new AppError('Chat conversation not found or you are not a member', 404);
    }

    const conv = participant.conversation;

    if (deleteType === 'EVERYONE') {
      // 1. Delete for Everyone
      if (conv.chatType === 'GROUP' && participant.role !== 'ADMIN') {
        throw new AppError('Only administrators can delete the group for everyone', 403);
      }

      // Invalidate cache for all participants
      for (const p of conv.participants) {
        await cacheService.delete(`chats:list:${p.userId}`);
      }

      // Delete the conversation (cascades to all messages, participants, etc.)
      await this.db.conversation.delete({
        where: { id: chatId },
      });

      // Emit event
      eventBus.emit('CHAT_DELETED', { chatId, participants: conv.participants.map((p) => p.userId) });

      return { status: 'deleted_everyone' };
    } else {
      // 2. Delete for Me
      await this.db.participant.update({
        where: { chatId_userId: { chatId, userId } },
        data: {
          clearedAt: new Date(),
        },
      });

      // Invalidate cache for this user
      await cacheService.delete(`chats:list:${userId}`);

      return { status: 'deleted_me' };
    }
  }

  async getGroupPreview(chatId) {
    const group = await this.db.conversation.findUnique({
      where: { id: chatId },
      include: {
        groupDetails: true,
        participants: {
          where: {
            role: { in: ['MEMBER', 'ADMIN'] }
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                profilePictureUrl: true,
              }
            }
          }
        }
      }
    });

    if (!group || group.chatType !== 'GROUP') {
      throw new AppError('Group not found or is not a group chat', 404);
    }

    return {
      chatId: group.id,
      groupName: group.groupDetails.groupName,
      description: group.groupDetails.description,
      groupPhotoUrl: group.groupDetails.groupPhotoUrl,
      participantsCount: group.participants.length,
      members: group.participants.map(p => ({
        userId: p.userId,
        role: p.role,
        joinedAt: p.joinedAt,
        user: p.user
      }))
    };
  }

  async joinGroup(userId, chatId) {
    const group = await this.db.conversation.findUnique({
      where: { id: chatId },
      include: {
        groupDetails: true,
      }
    });

    if (!group || group.chatType !== 'GROUP') {
      throw new AppError('Group not found or is not a group chat', 404);
    }

    const existingPart = await this.db.participant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (existingPart) {
      if (existingPart.role === 'MEMBER' || existingPart.role === 'ADMIN') {
        return true;
      }
      await this.db.participant.update({
        where: { chatId_userId: { chatId, userId } },
        data: {
          role: 'MEMBER',
          leftAt: null,
          joinedAt: new Date(),
        },
      });
    } else {
      await this.db.participant.create({
        data: {
          chatId,
          userId,
          role: 'MEMBER',
        },
      });
    }

    // Invalidate joiner's chat list cache
    await cacheService.delete(`chats:list:${userId}`);

    // Invalidate other active group members' list cache
    const activeMembers = await this.db.participant.findMany({
      where: {
        chatId,
        role: { in: ['MEMBER', 'ADMIN'] },
      },
      select: { userId: true },
    });

    for (const member of activeMembers) {
      await cacheService.delete(`chats:list:${member.userId}`);
    }

    const user = await this.db.user.findUnique({
      where: { id: userId },
    });

    await this.createSystemMessage(chatId, userId, `[SYSTEM]:${user.fullName} joined via invite link`);

    eventBus.emit('GROUP_MEMBER_ADDED', { chatId, userId });

    return true;
  }
}
