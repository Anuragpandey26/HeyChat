import eventBus from '../../core/events/eventBus.js';
import cacheService from '../../shared/services/cache.service.js';
import prisma from '../../core/database/prisma.singleton.js';
import socketService from '../../shared/services/socket.service.js';

export const initChatsListeners = () => {
  eventBus.on('USER_PROFILE_UPDATED', async (user) => {
    try {
      await cacheService.delete(`chats:list:${user.id}`);

      const privateChats = await prisma.participant.findMany({
        where: {
          userId: user.id,
          conversation: {
            chatType: 'PRIVATE',
          },
        },
        select: {
          chatId: true,
        },
      });

      const chatIds = privateChats.map((c) => c.chatId);

      const otherParticipants = await prisma.participant.findMany({
        where: {
          chatId: { in: chatIds },
          userId: { not: user.id },
        },
        select: {
          userId: true,
        },
      });

      for (const p of otherParticipants) {
        await cacheService.delete(`chats:list:${p.userId}`);
      }
    } catch (err) {
      console.error('Error in USER_PROFILE_UPDATED chat listener:', err);
    }
  });

  eventBus.on('CHAT_CREATED', async (data) => {
    try {
      if (data.chatType === 'PRIVATE') {
        await cacheService.delete(`chats:list:${data.creatorId}`);
        await cacheService.delete(`chats:list:${data.recipientId}`);
      } else {
        await cacheService.delete(`chats:list:${data.creatorId}`);
        for (const pId of data.participantIds) {
          await cacheService.delete(`chats:list:${pId}`);
        }
      }
    } catch (err) {
      console.error('Error in CHAT_CREATED chat listener:', err);
    }
  });

  eventBus.on('GROUP_UPDATED', async (data) => {
    try {
      const members = await prisma.participant.findMany({
        where: {
          chatId: data.chatId,
          role: { in: ['MEMBER', 'ADMIN'] },
        },
        select: { userId: true },
      });

      for (const m of members) {
        await cacheService.delete(`chats:list:${m.userId}`);
      }
    } catch (err) {
      console.error('Error in GROUP_UPDATED chat listener:', err);
    }
  });

  eventBus.on('GROUP_MEMBER_ADDED', async (data) => {
    try {
      await cacheService.delete(`chats:list:${data.userId}`);
      
      const members = await prisma.participant.findMany({
        where: {
          chatId: data.chatId,
          role: { in: ['MEMBER', 'ADMIN'] },
        },
        select: { userId: true },
      });

      for (const m of members) {
        await cacheService.delete(`chats:list:${m.userId}`);
      }

      // Emit real-time notification to the added user
      const chat = await prisma.conversation.findUnique({
        where: { id: data.chatId },
        include: { groupDetails: true },
      });

      if (chat && chat.groupDetails) {
        socketService.emitToUser(data.userId, 'receive_notification', {
          id: `${data.chatId}-add-${Date.now()}`,
          type: 'GROUP_ADD',
          title: chat.groupDetails.groupName || 'Added to Group',
          message: `You were added to the group "${chat.groupDetails.groupName}"`,
          chatId: data.chatId,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Error in GROUP_MEMBER_ADDED chat listener:', err);
    }
  });

  eventBus.on('GROUP_MEMBER_REMOVED', async (data) => {
    try {
      await cacheService.delete(`chats:list:${data.userId}`);
      
      const members = await prisma.participant.findMany({
        where: {
          chatId: data.chatId,
          role: { in: ['MEMBER', 'ADMIN'] },
        },
        select: { userId: true },
      });

      for (const m of members) {
        await cacheService.delete(`chats:list:${m.userId}`);
      }
    } catch (err) {
      console.error('Error in GROUP_MEMBER_REMOVED chat listener:', err);
    }
  });
};
