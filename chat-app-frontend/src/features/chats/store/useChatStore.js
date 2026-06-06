import { create } from 'zustand';
import apiClient from '../../../shared/lib/apiClient.js';
import socket from '../../../app/socket.js';

export const useChatStore = create((set, get) => ({
  chats: [],
  activeChatId: null,
  searchResults: [],
  allUsers: [],
  isLoading: false,
  error: null,

  fetchAllUsers: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.get('/users/list/all');
      set({ allUsers: res.data.data.users || [], isLoading: false });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to fetch users', isLoading: false });
    }
  },

  fetchChats: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.get('/chats');
      const chats = res.data.data?.chats;
      const activeChatId = get().activeChatId;
      const updatedChats = Array.isArray(chats)
        ? chats.map((c) => (c.chatId === activeChatId ? { ...c, unreadCount: 0 } : c))
        : [];
      set({ chats: updatedChats, isLoading: false });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to fetch conversations', isLoading: false });
    }
  },

  selectChat: (chatId) => {
    set((state) => ({
      activeChatId: chatId,
      chats: state.chats.map((c) =>
        c.chatId === chatId ? { ...c, unreadCount: 0 } : c
      ),
    }));
    if (chatId && socket) {
      socket.emit('read_conversation', { chatId });
    }
  },

  searchUsers: async (username) => {
    if (!username.trim()) {
      set({ searchResults: [] });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.get(`/users/${username}`);
      set({ searchResults: res.data.data.users || [], isLoading: false });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to search users', isLoading: false });
    }
  },

  createPrivateChat: async (targetUserId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post('/chats/private', { targetUserId });
      const { chatId } = res.data.data;
      await get().fetchChats();
      set({ activeChatId: chatId, isLoading: false, searchResults: [] });
      return chatId;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create chat';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  createGroupChat: async (groupName, participantIds, description = '') => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post('/chats/group', {
        groupName,
        participantIds,
        description,
      });
      const { chatId } = res.data.data;
      await get().fetchChats();
      set({ activeChatId: chatId, isLoading: false });
      return chatId;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create group';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  togglePinChat: async (chatId) => {
    try {
      await apiClient.put(`/chats/${chatId}/pin`);
      // Update local state directly
      set((state) => ({
        chats: state.chats.map((c) =>
          c.chatId === chatId ? { ...c, isPinned: !c.isPinned } : c
        ).sort((a, b) => {
          if (a.chatId === chatId) a.isPinned = !a.isPinned; // Apply temp sorting check
          if (b.chatId === chatId) b.isPinned = !b.isPinned;
          
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          const timeA = a.lastMessage ? new Date(a.lastMessage.sentAt).getTime() : new Date(a.joinedAt).getTime();
          const timeB = b.lastMessage ? new Date(b.lastMessage.sentAt).getTime() : new Date(b.joinedAt).getTime();
          return timeB - timeA;
        }),
      }));
      // Fetch fresh sorted chats list
      await get().fetchChats();
    } catch (err) {
      set({ error: 'Failed to pin conversation' });
    }
  },

  updateGroupSettings: async (chatId, { groupName, description, onlyAdminsCanSend, groupPhotoUrl }) => {
    try {
      await apiClient.patch(`/chats/group/${chatId}`, { groupName, description, onlyAdminsCanSend, groupPhotoUrl });
      await get().fetchChats();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update group settings';
      throw new Error(msg);
    }
  },

  addGroupMember: async (chatId, userId) => {
    try {
      await apiClient.post(`/chats/group/${chatId}/members`, { userIdToAdd: userId });
      await get().fetchChats();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to add member';
      throw new Error(msg);
    }
  },

  removeGroupMember: async (chatId, userId) => {
    try {
      await apiClient.delete(`/chats/group/${chatId}/members/${userId}`);
      await get().fetchChats();
      // If user left themselves, unselect active chat
      if (get().activeChatId === chatId) {
        set({ activeChatId: null });
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to remove member / leave group';
      throw new Error(msg);
    }
  },

  deleteChat: async (chatId, deleteType) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.delete(`/chats/${chatId}`, { data: { deleteType } });
      await get().fetchChats();
      // Unselect active chat if it was deleted
      if (get().activeChatId === chatId) {
        set({ activeChatId: null });
      }
      set({ isLoading: false });
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete conversation';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  blockUser: async (targetUserId) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.post('/users/block', { targetUserId });
      await get().fetchChats();
      set({ isLoading: false });
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to block user';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  unblockUser: async (targetUserId) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.post('/users/unblock', { targetUserId });
      await get().fetchChats();
      set({ isLoading: false });
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to unblock user';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },
}));
