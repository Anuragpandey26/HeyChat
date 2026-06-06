import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.utils.js';
import eventBus from '../../core/events/eventBus.js';

class SocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> Set of socketIds
  }

  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: [
          'http://localhost:5173',
          'http://127.0.0.1:5173',
        ],
        credentials: true,
      },
      pingTimeout: 60000,
    });

    const parseCookies = (cookieString) => {
      if (!cookieString) return {};
      return cookieString.split(';').reduce((acc, curr) => {
        const parts = curr.split('=');
        const key = parts[0]?.trim();
        const value = parts[1]?.trim();
        if (key) acc[key] = value;
        return acc;
      }, {});
    };

    this.io.use((socket, next) => {
      try {
        let token = socket.handshake.auth?.token || socket.handshake.query?.token;

        if (!token && socket.handshake.headers.cookie) {
          const cookies = parseCookies(socket.handshake.headers.cookie);
          token = cookies.accessToken;
        }

        if (!token) {
          return next(new Error('Authentication error: Token not found'));
        }

        const decoded = verifyAccessToken(token);
        socket.userId = decoded.sub;
        next();
      } catch (err) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.userId;
      
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);

      console.log(`Client connected: Socket ID = ${socket.id}, User ID = ${userId}`);

      this.handlePresence(userId, true);

      // Dynamically load and register message socket events
      // Avoid circular dependency by importing inside connection
      import('../../modules/messages/messages.sockets.js').then(({ registerMessageSockets }) => {
        registerMessageSockets(this, socket);
      }).catch((err) => {
        console.error('Failed to import message socket handlers:', err);
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: Socket ID = ${socket.id}`);
        
        const userSockets = this.userSockets.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            this.userSockets.delete(userId);
            this.handlePresence(userId, false);
          }
        }
      });
    });

    // Register EventBus Observers for Decoupled WebSocket Pushes
    eventBus.on('TICK_UPDATED', (data) => {
      this.emitToRoom(`chat:${data.chatId}`, 'tick_updated', {
        messageId: data.messageId,
        chatId: data.chatId,
        recipientId: data.recipientId,
        status: data.status,
      });
    });

    eventBus.on('MESSAGE_DELETED', (data) => {
      this.emitToRoom(`chat:${data.chatId}`, 'message_deleted', {
        messageId: data.messageId,
        chatId: data.chatId,
      });
    });

    eventBus.on('CHAT_DELETED', (data) => {
      this.emitToRoom(`chat:${data.chatId}`, 'chat_deleted', {
        chatId: data.chatId,
      });
    });

    return this.io;
  }

  async handlePresence(userId, isOnline) {
    try {
      const { default: prisma } = await import('../../core/database/prisma.singleton.js');
      const { default: cacheService } = await import('./cache.service.js');

      const lastSeen = new Date();
      await prisma.user.update({
        where: { id: userId },
        data: { isOnline, lastSeen },
      });

      const activeChats = await prisma.participant.findMany({
        where: {
          userId,
          role: { in: ['MEMBER', 'ADMIN'] },
        },
        select: { chatId: true },
      });

      activeChats.forEach((c) => {
        this.emitToRoom(`chat:${c.chatId}`, 'user_presence', {
          userId,
          isOnline,
          lastSeen,
        });
      });

      await cacheService.delete(`chats:list:${userId}`);
      for (const c of activeChats) {
        const parts = await prisma.participant.findMany({
          where: {
            chatId: c.chatId,
            userId: { not: userId },
            role: { in: ['MEMBER', 'ADMIN'] },
          },
          select: { userId: true },
        });
        for (const p of parts) {
          await cacheService.delete(`chats:list:${p.userId}`);
        }
      }
    } catch (err) {
      console.error(`Failed to handle presence for user ${userId}:`, err);
    }
  }

  emitToRoom(room, event, data) {
    if (!this.io) return;
    this.io.to(room).emit(event, data);
  }

  emitToUser(userId, event, data) {
    const sockets = this.userSockets.get(userId);
    if (sockets && this.io) {
      sockets.forEach((socketId) => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  isUserOnline(userId) {
    return this.userSockets.has(userId);
  }

  close(callback) {
    if (this.io) {
      this.io.close(callback);
    } else {
      callback?.();
    }
  }
}

const socketService = new SocketService();
export default socketService;
