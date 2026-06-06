import { create } from 'zustand';
import apiClient from '../../../shared/lib/apiClient.js';
import { decryptMessage } from '../../../shared/lib/crypto.js';
import socket from '../../../app/socket.js';

export const useMessageStore = create((set, get) => ({
  messagesByChatId: {}, // chatId -> Array of Messages
  typingUsersByChatId: {}, // chatId -> Array of userIds
  isLoading: false,
  error: null,

  fetchMessages: async (chatId, currentUserId, privateKey, recipientPublicKey = null) => {
    set({ isLoading: true, error: null });
    if (chatId && socket) {
      socket.emit('read_conversation', { chatId });
    }
    try {
      const res = await apiClient.get(`/messages/${chatId}`);
      const rawMessages = res.data.data.messages || [];

      // Filter out messages deleted for me locally
      const storageKey = `deleted_messages:${currentUserId}`;
      const deletedIds = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const activeMessages = rawMessages.filter((m) => !deletedIds.includes(m.id));

      // Decrypt messages in place before saving
      const decryptedMessages = activeMessages.map((msg) => {
        if (msg.isDeletedEveryone) {
          return { ...msg, decryptedContent: 'This message was deleted' };
        }

        // Private chat: decrypt using NaCl box
        if (recipientPublicKey && msg.encryptedContent) {
          const isSender = msg.senderId === currentUserId || msg.sender?.id === currentUserId;
          // Sender re-decrypts their own msg using recipientPublicKey
          // Recipient decrypts using sender's publicKey
          const otherPublicKey = isSender ? recipientPublicKey : msg.sender?.publicKey;

          if (!otherPublicKey) {
            // Key not available yet — show placeholder instead of error
            return { ...msg, decryptedContent: msg.encryptedContent };
          }

          const decrypted = decryptMessage(msg.encryptedContent, otherPublicKey, privateKey);
          return { ...msg, decryptedContent: decrypted };
        }

        // Group chats: unencrypted in MVP
        return { ...msg, decryptedContent: msg.encryptedContent };
      });

      set((state) => ({
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: decryptedMessages,
        },
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load message history', isLoading: false });
    }
  },

  addMessage: (chatId, message, currentUserId, privateKey, recipientPublicKey = null) => {
    // Skip if message has been deleted for me locally
    const storageKey = `deleted_messages:${currentUserId}`;
    const deletedIds = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (deletedIds.includes(message.id)) {
      return;
    }

    let msg = { ...message };

    // Decrypt if it's a private chat and not already decrypted
    if (recipientPublicKey && msg.encryptedContent && !msg.decryptedContent) {
      const isSender = msg.senderId === currentUserId || msg.sender?.id === currentUserId;
      const otherPublicKey = isSender ? recipientPublicKey : msg.sender?.publicKey;

      if (otherPublicKey) {
        const decrypted = decryptMessage(msg.encryptedContent, otherPublicKey, privateKey);
        msg.decryptedContent = decrypted;
      } else {
        msg.decryptedContent = msg.encryptedContent;
      }
    } else if (!msg.decryptedContent) {
      msg.decryptedContent = msg.encryptedContent;
    }

    set((state) => {
      const currentMsgs = state.messagesByChatId[chatId] || [];
      // Prevent duplicate additions
      if (currentMsgs.some((m) => m.id === msg.id)) {
        return state;
      }
      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: [...currentMsgs, msg],
        },
      };
    });
  },

  deleteMessageForMe: (messageId, currentUserId) => {
    const storageKey = `deleted_messages:${currentUserId}`;
    const deletedIds = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!deletedIds.includes(messageId)) {
      deletedIds.push(messageId);
      localStorage.setItem(storageKey, JSON.stringify(deletedIds));
    }

    set((state) => {
      const updatedMessagesByChatId = {};
      Object.keys(state.messagesByChatId).forEach((cId) => {
        updatedMessagesByChatId[cId] = state.messagesByChatId[cId].filter(
          (m) => m.id !== messageId
        );
      });
      return {
        messagesByChatId: updatedMessagesByChatId,
      };
    });
  },

  updateTick: (chatId, messageId, status) => {
    set((state) => {
      const currentMsgs = state.messagesByChatId[chatId] || [];
      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: currentMsgs.map((m) =>
            m.id === messageId ? { ...m, receipts: m.receipts?.map(r => ({ ...r, status })) || [{ status }] } : m
          ),
        },
      };
    });
  },

  deleteMessageLocally: (chatId, messageId) => {
    set((state) => {
      const currentMsgs = state.messagesByChatId[chatId] || [];
      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: currentMsgs.map((m) =>
            m.id === messageId ? { ...m, isDeletedEveryone: true, decryptedContent: 'This message was deleted', mediaUrl: null } : m
          ),
        },
      };
    });
  },

  updateReaction: (chatId, messageId, userId, emoji) => {
    set((state) => {
      const currentMsgs = state.messagesByChatId[chatId] || [];
      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: currentMsgs.map((m) => {
            if (m.id !== messageId) return m;
            
            let reactions = [...(m.reactions || [])];
            const existingIdx = reactions.findIndex((r) => r.userId === userId);
            
            if (existingIdx !== -1) {
              if (!emoji) {
                reactions.splice(existingIdx, 1);
              } else {
                reactions[existingIdx] = { ...reactions[existingIdx], emoji };
              }
            } else if (emoji) {
              reactions.push({ userId, emoji });
            }

            return { ...m, reactions };
          }),
        },
      };
    });
  },

  updatePoll: (chatId, messageId, pollId, options) => {
    set((state) => {
      const currentMsgs = state.messagesByChatId[chatId] || [];
      return {
        messagesByChatId: {
          ...state.messagesByChatId,
          [chatId]: currentMsgs.map((m) => {
            if (m.id !== messageId || !m.poll) return m;
            
            const updatedPoll = {
              ...m.poll,
              options: m.poll.options.map((opt) => {
                const optUpdate = options.find((o) => o.id === opt.id);
                return optUpdate ? { ...opt, votes: optUpdate.votes } : opt;
              }),
            };

            return { ...m, poll: updatedPoll };
          }),
        },
      };
    });
  },

  setTypingUsers: (chatId, userId, isTyping) => {
    set((state) => {
      const typing = [...(state.typingUsersByChatId[chatId] || [])];
      const existIdx = typing.indexOf(userId);

      if (isTyping && existIdx === -1) {
        typing.push(userId);
      } else if (!isTyping && existIdx !== -1) {
        typing.splice(existIdx, 1);
      }

      return {
        typingUsersByChatId: {
          ...state.typingUsersByChatId,
          [chatId]: typing,
        },
      };
    });
  },
}));
