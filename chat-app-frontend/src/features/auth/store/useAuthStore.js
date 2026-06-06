import { create } from 'zustand';
import apiClient from '../../../shared/lib/apiClient.js';
import { deriveKeyPair } from '../../../shared/lib/crypto.js';
import { connectSocket, disconnectSocket } from '../../../app/socket.js';

export const useAuthStore = create((set, get) => ({
  user: null,
  privateKey: null,
  publicKey: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  initializeAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const cachedPrivateKey = sessionStorage.getItem('privateKey');
      const cachedPublicKey = sessionStorage.getItem('publicKey');

      if (!cachedPrivateKey || !cachedPublicKey) {
        set({ isAuthenticated: false, user: null, privateKey: null, publicKey: null, isLoading: false });
        return false;
      }

      const res = await apiClient.get('/users/me');
      const profile = res.data.data.profile;

      // Validate cached session keys against database stored public key
      if (profile && profile.publicKey && cachedPublicKey !== profile.publicKey) {
        throw new Error('Cryptographic key mismatch detected');
      }

      set({
        user: profile,
        privateKey: cachedPrivateKey,
        publicKey: cachedPublicKey,
        isAuthenticated: true,
        isLoading: false,
      });

      connectSocket();
      return true;
    } catch (err) {
      sessionStorage.removeItem('privateKey');
      sessionStorage.removeItem('publicKey');
      set({ isAuthenticated: false, user: null, privateKey: null, publicKey: null, isLoading: false });
      return false;
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      const userData = res.data.data.user;

      // Derive keypair deterministically
      const keyPair = deriveKeyPair(userData.username, password);

      // Save to sessionStorage for refresh tolerance
      sessionStorage.setItem('privateKey', keyPair.privateKey);
      sessionStorage.setItem('publicKey', keyPair.publicKey);

      set({
        user: userData,
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey,
        isAuthenticated: true,
        isLoading: false,
      });

      connectSocket();
      return true;
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  register: async ({ username, email, fullName, password, securityQuestion, securityQuestionAnswer, bio, phoneNumber }) => {
    set({ isLoading: true, error: null });
    try {
      // Derive keypair before registration to send the public key
      const keyPair = deriveKeyPair(username, password);

      await apiClient.post('/auth/register', {
        username,
        email,
        fullName,
        password,
        securityQuestionHash: securityQuestionAnswer,
        publicKey: keyPair.publicKey,
        bio,
        phoneNumber,
      });

      set({ isLoading: false });
      return true;
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed. Username or Email may already be taken.';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (err) {
      console.warn('Backend logout failed or was already logged out:', err);
    } finally {
      sessionStorage.removeItem('privateKey');
      sessionStorage.removeItem('publicKey');
      set({ user: null, privateKey: null, publicKey: null, isAuthenticated: false, error: null });
      disconnectSocket();
    }
  },

  updateProfile: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.patch('/users/me', data);
      set((state) => ({
        user: { ...state.user, ...res.data.data.profile },
        isLoading: false,
      }));
      return true;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update profile details.';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  updateAvatar: async (formData) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.put('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      set((state) => ({
        user: { ...state.user, profilePictureUrl: res.data.data.profile?.profilePictureUrl },
        isLoading: false,
      }));
      return true;
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to upload profile photo.';
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },
}));

// Listen to session expiry event (dispatched by apiClient interceptor)
if (typeof window !== 'undefined') {
  window.addEventListener('auth-expired', () => {
    sessionStorage.removeItem('privateKey');
    sessionStorage.removeItem('publicKey');
    useAuthStore.setState({ user: null, privateKey: null, publicKey: null, isAuthenticated: false });
    disconnectSocket();
  });
}
