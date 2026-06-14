import prisma from '../../core/database/prisma.singleton.js';
import { MessagesService } from './messages.service.js';
import cacheService from '../../shared/services/cache.service.js';
import StorageFactory from '../../shared/factories/StorageFactory.js';
import eventBus from '../../core/events/eventBus.js';

const messagesService = new MessagesService(prisma, StorageFactory.getAdapter());

export const registerMessageSockets = (io, socket) => {
  const userId = socket.userId;

  // 1. Join Chat Rooms
  socket.on('join_chats', async (chatIds) => {
    try {
      if (!Array.isArray(chatIds)) return;

      // Verify the user is an active participant in these chats before joining rooms
      const activeMemberships = await prisma.participant.findMany({
        where: {
          userId,
          chatId: { in: chatIds },
          role: { in: ['MEMBER', 'ADMIN'] },
        },
        select: { chatId: true },
      });

      const verifiedChatIds = activeMemberships.map((m) => m.chatId);

      verifiedChatIds.forEach((chatId) => {
        socket.join(`chat:${chatId}`);
        console.log(`Socket ${socket.id} joined room chat:${chatId}`);
      });
    } catch (err) {
      console.error('Error joining chat rooms:', err);
    }
  });

  // 2. Send Message
  socket.on('send_message', async (payload, callback) => {
    try {
      const { chatId, encryptedContent, mediaType = 'TEXT', mediaUrl = null, poll = null } = payload;

      // A. Verify sender is active participant
      const senderPart = await prisma.participant.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });

      if (!senderPart || !['MEMBER', 'ADMIN'].includes(senderPart.role)) {
        return callback?.({ status: 'error', message: 'You are not an active member of this chat' });
      }

      // B. Fetch conversation details
      const conv = await prisma.conversation.findUnique({
        where: { id: chatId },
        include: {
          groupDetails: true,
          participants: {
            where: {
              role: { in: ['MEMBER', 'ADMIN'] },
            },
          },
        },
      });

      if (!conv) {
        return callback?.({ status: 'error', message: 'Chat conversation not found' });
      }

      // C. If group, check restrict messaging
      if (conv.chatType === 'GROUP' && conv.groupDetails?.onlyAdminsCanSend) {
        if (senderPart.role !== 'ADMIN') {
          return callback?.({ status: 'error', message: 'Only administrators can send messages in this group' });
        }
      }

      // D. If private, check blocklist in both directions
      let isBlocked = false;
      let recipientId = null;

      if (conv.chatType === 'PRIVATE') {
        const otherPart = conv.participants.find((p) => p.userId !== userId);
        if (otherPart) {
          recipientId = otherPart.userId;
          // Check if either user has blocked the other
          const block = await prisma.blockList.findFirst({
            where: {
              OR: [
                { blockerId: recipientId, blockedId: userId },
                { blockerId: userId, blockedId: recipientId },
              ],
            },
          });
          if (block) {
            isBlocked = true;
          }
        }
      }

      if (isBlocked) {
        return callback?.({ status: 'error', message: 'This chat is blocked. You cannot send messages.' });
      }

      // E. Save message in DB inside a transaction
      const message = await prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            chatId,
            senderId: userId,
            encryptedContent,
            mediaType,
            mediaUrl,
          },
        });

        // If it's a poll, create the poll and options
        if (mediaType === 'POLL' && poll) {
          const newPoll = await tx.poll.create({
            data: {
              messageId: msg.id,
              encryptedQuestion: poll.encryptedQuestion,
            },
          });

          await tx.pollOption.createMany({
            data: poll.options.map((opt) => ({
              pollId: newPoll.id,
              encryptedText: opt.encryptedText,
            })),
          });
        }

        // F. Create SENT receipt for all other participants (except the sender)
        const otherParticipants = conv.participants.filter((p) => p.userId !== userId);
        
        if (otherParticipants.length > 0) {
          await tx.receipt.createMany({
            data: otherParticipants.map((p) => ({
              messageId: msg.id,
              recipientId: p.userId,
              status: 'SENT',
            })),
          });
        }

        return msg;
      });

      // G. Fetch saved message with details
      const savedMsg = await prisma.message.findUnique({
        where: { id: message.id },
        include: {
          sender: {
            select: { id: true, username: true, fullName: true, profilePictureUrl: true, publicKey: true },
          },
          polls: {
            include: {
              options: true,
            },
          },
        },
      });

      // Format response message
      const responseMsg = {
        id: savedMsg.id,
        chatId: savedMsg.chatId,
        senderId: savedMsg.senderId,
        sender: savedMsg.sender,
        sentAt: savedMsg.sentAt,
        mediaType: savedMsg.mediaType,
        mediaUrl: savedMsg.mediaUrl,
        encryptedContent: savedMsg.encryptedContent,
        isDeletedEveryone: false,
        reactions: [],
      };

      if (savedMsg.mediaType === 'POLL' && savedMsg.polls.length > 0) {
        const p = savedMsg.polls[0];
        responseMsg.poll = {
          id: p.id,
          encryptedQuestion: p.encryptedQuestion,
          options: p.options.map((o) => ({
            id: o.id,
            encryptedText: o.encryptedText,
            votes: [],
          })),
        };
      }

      // H. Invalidate cached chat lists
      for (const p of conv.participants) {
        await cacheService.delete(`chats:list:${p.userId}`);
      }

      // I. If blocked in private chat, only emit message back to the sender
      if (isBlocked) {
        socket.emit('receive_message', responseMsg);
        callback?.({ status: 'success', data: responseMsg });
        return;
      }

      // J. Broadcast message to all active users in the room
      io.emitToRoom(`chat:${chatId}`, 'receive_message', responseMsg);
      callback?.({ status: 'success', data: responseMsg });

      // K. Emit Real-time In-App Notifications
      try {
        if (conv.chatType === 'PRIVATE') {
          if (recipientId && recipientId !== userId) {
            io.emitToUser(recipientId, 'receive_notification', {
              id: savedMsg.id,
              type: 'MESSAGE',
              title: savedMsg.sender.fullName,
              message: 'Sent you an encrypted message',
              encryptedContent: savedMsg.encryptedContent,
              sender: savedMsg.sender,
              chatId: savedMsg.chatId,
              createdAt: new Date().toISOString(),
            });
          }
        } else if (conv.chatType === 'GROUP') {
          // Parse mentions from the plaintext message in group chats
          const contentText = savedMsg.encryptedContent || '';
          const isMentionAll = contentText.includes('@all');
          
          const mentionedUsernames = [];
          if (!isMentionAll) {
            const mentionRegex = /@([a-zA-Z0-9_.-]+)/g;
            let match;
            while ((match = mentionRegex.exec(contentText)) !== null) {
              const username = match[1].toLowerCase();
              if (username !== 'all' && !mentionedUsernames.includes(username)) {
                mentionedUsernames.push(username);
              }
            }
          }

          // Notify participants
          const otherParticipants = conv.participants.filter((p) => p.userId !== userId);
          for (const p of otherParticipants) {
            let shouldNotify = false;
            let notificationMessage = '';

            if (isMentionAll) {
              shouldNotify = true;
              notificationMessage = `mentioned everyone in "${conv.groupDetails?.groupName}"`;
            } else if (mentionedUsernames.length > 0) {
              // Fetch participant's username and fullName for smart mention matching
              const memberUser = await prisma.user.findUnique({
                where: { id: p.userId },
                select: { username: true, fullName: true },
              });
              if (memberUser) {
                const dbUsername = memberUser.username.toLowerCase();
                const dbFullName = memberUser.fullName.toLowerCase().trim();
                const firstName = dbFullName.split(' ')[0];

                const matchesMention = mentionedUsernames.some(mention => {
                  return dbUsername === mention || 
                         firstName === mention || 
                         dbUsername.startsWith(mention) ||
                         dbFullName.includes(mention);
                });

                if (matchesMention) {
                  shouldNotify = true;
                  notificationMessage = `mentioned you in "${conv.groupDetails?.groupName}"`;
                }
              }
            }

            if (shouldNotify) {
              io.emitToUser(p.userId, 'receive_notification', {
                id: `${savedMsg.id}-mention-${p.userId}`,
                type: 'MENTION',
                title: savedMsg.sender.fullName,
                message: notificationMessage,
                sender: savedMsg.sender,
                chatId: savedMsg.chatId,
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
      } catch (err) {
        console.error('Error sending in-app message notifications:', err);
      }

    } catch (err) {
      console.error('Socket send_message error:', err);
      callback?.({ status: 'error', message: 'Failed to process message' });
    }
  });

  // 3. Update Delivery / Seen Ticks
  socket.on('update_tick', async (payload, callback) => {
    try {
      const { messageId, status } = payload; // status is DELIVERED or SEEN

      if (!['DELIVERED', 'SEEN'].includes(status)) {
        return callback?.({ status: 'error', message: 'Invalid status' });
      }

      const receipt = await prisma.receipt.findUnique({
        where: { messageId_recipientId: { messageId, recipientId: userId } },
        include: {
          message: {
            include: {
              conversation: {
                include: {
                  participants: true,
                },
              },
            },
          },
        },
      });

      if (!receipt) {
        return callback?.({ status: 'error', message: 'Receipt not found' });
      }

      // If already SEEN, don't downgrade or duplicate
      if (receipt.status === 'SEEN') {
        return callback?.({ status: 'success' });
      }

      // Update receipt in DB
      await prisma.receipt.update({
        where: { messageId_recipientId: { messageId, recipientId: userId } },
        data: {
          status,
        },
      });

      const messageSenderId = receipt.message.senderId;

      // Broadcast receipt update back to the sender of the message
      eventBus.emit('TICK_UPDATED', {
        messageId,
        chatId: receipt.message.chatId,
        recipientId: userId,
        senderId: messageSenderId,
        status,
      });

      callback?.({ status: 'success' });
    } catch (err) {
      console.error('Socket update_tick error:', err);
      callback?.({ status: 'error', message: 'Failed to update receipt status' });
    }
  });

  // 3b. Mark entire conversation as read/seen
  socket.on('read_conversation', async (payload, callback) => {
    try {
      const { chatId } = payload;

      const messages = await prisma.message.findMany({
        where: {
          chatId,
          senderId: { not: userId },
        },
        include: {
          receipts: {
            where: { recipientId: userId },
          },
        },
      });

      for (const msg of messages) {
        const userReceipt = msg.receipts[0];
        if (!userReceipt || userReceipt.status !== 'SEEN') {
          await prisma.receipt.upsert({
            where: { messageId_recipientId: { messageId: msg.id, recipientId: userId } },
            update: { status: 'SEEN' },
            create: { messageId: msg.id, recipientId: userId, status: 'SEEN' },
          });

          eventBus.emit('TICK_UPDATED', {
            messageId: msg.id,
            chatId,
            recipientId: userId,
            senderId: msg.senderId,
            status: 'SEEN',
          });
        }
      }

      callback?.({ status: 'success' });
    } catch (err) {
      console.error('Socket read_conversation error:', err);
      callback?.({ status: 'error', message: 'Failed to mark conversation as read' });
    }
  });

  // 4. Typing Indicators
  socket.on('typing_start', (payload) => {
    const chatId = typeof payload === 'string' ? payload : payload?.chatId;
    const username = payload?.username || '';
    const fullName = payload?.fullName || '';
    socket.to(`chat:${chatId}`).emit('user_typing', { chatId, userId, isTyping: true, username, fullName });
  });

  socket.on('typing_stop', (chatId) => {
    socket.to(`chat:${chatId}`).emit('user_typing', { chatId, userId, isTyping: false });
  });

  // 4b. Edit Message
  socket.on('edit_message', async (payload, callback) => {
    try {
      const { messageId, encryptedContent } = payload;
      if (!messageId || !encryptedContent) {
        return callback?.({ status: 'error', message: 'Message ID and content are required' });
      }

      const updatedMsg = await messagesService.editMessage(userId, messageId, encryptedContent);

      // Broadcast update to the chat room
      io.emitToRoom(`chat:${updatedMsg.chatId}`, 'message_edited', {
        messageId,
        chatId: updatedMsg.chatId,
        encryptedContent: updatedMsg.encryptedContent,
        editedAt: updatedMsg.editedAt,
      });

      callback?.({ status: 'success', data: updatedMsg });
    } catch (err) {
      console.error('Socket edit_message error:', err);
      callback?.({ status: 'error', message: err.message || 'Failed to edit message' });
    }
  });

  // 5. Delete Message for Everyone
  socket.on('delete_message', async (messageId, callback) => {
    try {
      await messagesService.deleteForEveryone(userId, messageId);
      callback?.({ status: 'success' });
    } catch (err) {
      console.error('Socket delete_message error:', err);
      callback?.({ status: 'error', message: err.message || 'Failed to delete message' });
    }
  });

  // 6. Message Reactions
  socket.on('send_reaction', async (payload, callback) => {
    try {
      const { messageId, emoji } = payload;

      const message = await prisma.message.findUnique({
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
        return callback?.({ status: 'error', message: 'Message not found' });
      }

      const isMember = message.conversation.participants.some(
        (p) => p.userId === userId && ['MEMBER', 'ADMIN'].includes(p.role)
      );

      if (!isMember) {
        return callback?.({ status: 'error', message: 'You are not a member of this conversation' });
      }

      // Upsert reaction (a user has exactly one reaction per message)
      const existingReaction = await prisma.messageReaction.findFirst({
        where: { messageId, userId },
      });

      let reaction;
      if (existingReaction) {
        if (emoji === '') {
          // Remove reaction
          await prisma.messageReaction.delete({ where: { id: existingReaction.id } });
          reaction = null;
        } else {
          reaction = await prisma.messageReaction.update({
            where: { id: existingReaction.id },
            data: { emoji },
          });
        }
      } else if (emoji !== '') {
        reaction = await prisma.messageReaction.create({
          data: { messageId, userId, emoji },
        });
      }

      // Broadcast reaction to room
      io.emitToRoom(`chat:${message.chatId}`, 'receive_reaction', {
        messageId,
        chatId: message.chatId,
        userId,
        emoji: reaction ? reaction.emoji : null,
      });

      // Emit reaction notification to original message sender
      try {
        if (reaction && userId !== message.senderId) {
          const reactor = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, fullName: true, profilePictureUrl: true },
          });

          if (reactor) {
            let groupTitle = null;
            if (message.conversation.chatType === 'GROUP') {
              const groupDetail = await prisma.groupDetails.findUnique({
                where: { chatId: message.chatId },
              });
              groupTitle = groupDetail?.groupName;
            }

            io.emitToUser(message.senderId, 'receive_notification', {
              id: `${messageId}-reaction-${Date.now()}`,
              type: 'REACTION',
              title: reactor.fullName,
              message: `reacted ${reaction.emoji} to your message${groupTitle ? ` in "${groupTitle}"` : ''}`,
              sender: reactor,
              chatId: message.chatId,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error('Error emitting reaction notification:', err);
      }

      callback?.({ status: 'success' });
    } catch (err) {
      console.error('Socket send_reaction error:', err);
      callback?.({ status: 'error', message: 'Failed to process reaction' });
    }
  });

  // 7. Poll Votes
  socket.on('cast_vote', async (payload, callback) => {
    try {
      const { optionId } = payload;

      const option = await prisma.pollOption.findUnique({
        where: { id: optionId },
        include: {
          poll: {
            include: {
              message: true,
            },
          },
        },
      });

      if (!option) {
        return callback?.({ status: 'error', message: 'Poll option not found' });
      }

      const chatId = option.poll.message.chatId;

      // Verify membership
      const isMember = await prisma.participant.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });

      if (!isMember || !['MEMBER', 'ADMIN'].includes(isMember.role)) {
        return callback?.({ status: 'error', message: 'You are not a member of this chat' });
      }

      // Check if user already voted for this option
      const existingVote = await prisma.pollVote.findUnique({
        where: { optionId_userId: { optionId, userId } },
      });

      if (existingVote) {
        // Toggle off (remove vote)
        await prisma.pollVote.delete({
          where: { optionId_userId: { optionId, userId } },
        });
      } else {
        // Cast vote
        await prisma.pollVote.create({
          data: { optionId, userId },
        });
      }

      // Fetch all options and votes for this poll to broadcast live updates
      const poll = await prisma.poll.findUnique({
        where: { id: option.pollId },
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
      });

      const livePoll = {
        messageId: option.poll.messageId,
        pollId: poll.id,
        options: poll.options.map((o) => ({
          id: o.id,
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

      // Broadcast poll vote updates to room
      io.emitToRoom(`chat:${chatId}`, 'poll_updated', livePoll);

      callback?.({ status: 'success' });
    } catch (err) {
      console.error('Socket cast_vote error:', err);
      callback?.({ status: 'error', message: 'Failed to process vote' });
    }
  });
};
