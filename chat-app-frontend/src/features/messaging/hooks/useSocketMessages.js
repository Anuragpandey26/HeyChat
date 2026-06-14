import { useEffect } from 'react';
import socket from '../../../app/socket.js';
import { useMessageStore } from '../store/useMessageStore.js';
import { useAuthStore } from '../../auth/store/useAuthStore.js';
import { useChatStore } from '../../chats/store/useChatStore.js';

export const useSocketMessages = (chatId, recipientPublicKey = null) => {
  const { user: currentUser, privateKey } = useAuthStore();
  const { fetchChats, selectChat } = useChatStore();
  const {
    addMessage,
    updateTick,
    deleteMessageLocally,
    updateReaction,
    updatePoll,
    setTypingUsers,
    editMessageLocally,
  } = useMessageStore();

  useEffect(() => {
    if (!chatId || !socket || !currentUser) return;

    // Join room for this chat
    socket.emit('join_chats', [chatId]);

    // Handle incoming E2EE decrypted message
    const handleReceiveMessage = (message) => {
      // Add message to store (handles E2EE decryption in place)
      addMessage(chatId, message, currentUser.id, privateKey, recipientPublicKey);

      // If we are NOT the sender, mark the message as read (SEEN)
      if (message.senderId !== currentUser.id && message.sender?.id !== currentUser.id) {
        socket.emit('update_tick', {
          messageId: message.id,
          status: 'SEEN',
        });
      }
    };

    const handleTickUpdated = (data) => {
      if (data.chatId === chatId) {
        updateTick(chatId, data.messageId, data.status);
      }
    };

    const handleMessageDeleted = (data) => {
      if (data.chatId === chatId) {
        deleteMessageLocally(chatId, data.messageId);
      }
    };

    const handleMessageEdited = (data) => {
      if (data.chatId === chatId) {
        editMessageLocally(
          chatId,
          data.messageId,
          data.encryptedContent,
          data.editedAt,
          currentUser.id,
          privateKey,
          recipientPublicKey
        );
      }
    };

    const handleUserTyping = (data) => {
      if (data.chatId === chatId) {
        setTypingUsers(
          chatId,
          { userId: data.userId, username: data.username, fullName: data.fullName },
          data.isTyping
        );
      }
    };

    const handleReceiveReaction = (data) => {
      if (data.chatId === chatId) {
        updateReaction(chatId, data.messageId, data.userId, data.emoji);
      }
    };

    const handlePollUpdated = (data) => {
      // Find message and update poll options votes
      updatePoll(chatId, data.messageId, data.pollId, data.options);
    };

    const handleChatDeleted = (data) => {
      if (data.chatId === chatId) {
        selectChat(null);
        fetchChats();
      }
    };

    // Register socket listeners
    socket.on('receive_message', handleReceiveMessage);
    socket.on('tick_updated', handleTickUpdated);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_edited', handleMessageEdited);
    socket.on('user_typing', handleUserTyping);
    socket.on('receive_reaction', handleReceiveReaction);
    socket.on('poll_updated', handlePollUpdated);
    socket.on('chat_deleted', handleChatDeleted);

    return () => {
      // Leave rooms and clean listeners
      socket.off('receive_message', handleReceiveMessage);
      socket.off('tick_updated', handleTickUpdated);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_edited', handleMessageEdited);
      socket.off('user_typing', handleUserTyping);
      socket.off('receive_reaction', handleReceiveReaction);
      socket.off('poll_updated', handlePollUpdated);
      socket.off('chat_deleted', handleChatDeleted);
    };
  }, [
    chatId,
    currentUser,
    privateKey,
    recipientPublicKey,
    addMessage,
    updateTick,
    deleteMessageLocally,
    updateReaction,
    updatePoll,
    setTypingUsers,
    editMessageLocally,
    fetchChats,
    selectChat,
  ]);
};
