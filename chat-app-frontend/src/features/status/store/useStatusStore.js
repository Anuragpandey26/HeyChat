import { create } from 'zustand';
import apiClient from '../../../shared/lib/apiClient.js';

export const useStatusStore = create((set, get) => ({
  selfStatuses: [],
  contactsStatuses: [],
  isLoading: false,
  error: null,

  fetchStatuses: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.get('/status');
      const { self = [], contacts = [] } = res.data.data;
      set({
        selfStatuses: self,
        contactsStatuses: contacts,
        isLoading: false,
      });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to fetch status updates', isLoading: false });
    }
  },

  uploadStatus: async (content, statusType = 'TEXT', backgroundColor = '#0f172a', imageFile = null) => {
    set({ isLoading: true, error: null });
    try {
      if (statusType === 'IMAGE' && imageFile) {
        const formData = new FormData();
        formData.append('statusType', 'IMAGE');
        if (content) {
          formData.append('encryptedContent', content);
        }
        formData.append('image', imageFile);

        await apiClient.post('/status', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await apiClient.post('/status', {
          statusType,
          encryptedContent: content,
          backgroundColor: statusType === 'TEXT' ? backgroundColor : null,
        });
      }
      await get().fetchStatuses();
      set({ isLoading: false });
      return true;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to upload status update';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  viewStatus: async (statusId, isLiked = false, emoji = null) => {
    try {
      await apiClient.post(`/status/${statusId}/view`, { isLiked, emoji });
      await get().fetchStatuses();
    } catch (err) {
      console.error('Failed to register status view:', err);
    }
  },

  getStatusViewers: async (statusId) => {
    try {
      const res = await apiClient.get(`/status/${statusId}/viewers`);
      return res.data.data.viewers || [];
    } catch (err) {
      console.error('Failed to fetch status viewers:', err);
      return [];
    }
  },

  deleteStatus: async (statusId) => {
    try {
      await apiClient.delete(`/status/${statusId}`);
      await get().fetchStatuses();
      return true;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to delete status';
      throw new Error(msg);
    }
  },
}));
