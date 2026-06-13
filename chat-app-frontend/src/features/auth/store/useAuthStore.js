import { create } from 'zustand';
import apiClient from '../../../shared/lib/apiClient.js';
import {
  generateKeyPair,
  deriveKeyPair,
  wrapPrivateKey,
  unwrapPrivateKey,
  wrapPrivateKeyWithAnswer,
  publicKeyFromPrivate,
} from '../../../shared/lib/crypto.js';
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

      let privateKey;
      let publicKey;

      if (userData.wrappedPrivateKey) {
        // ✅ New system: Unwrap the private key using the password
        privateKey = unwrapPrivateKey(userData.wrappedPrivateKey, userData.username, password);
        publicKey = publicKeyFromPrivate(privateKey);
      } else {
        // 🔄 Legacy migration: Old user without wrappedPrivateKey
        // Derive keys the old way, then auto-migrate to key wrapping
        const legacyKeyPair = deriveKeyPair(userData.username, password);
        privateKey = legacyKeyPair.privateKey;
        publicKey = legacyKeyPair.publicKey;

        // Auto-migrate: wrap the key and save to server
        const wrappedPrivateKey = wrapPrivateKey(privateKey, userData.username, password);
        try {
          await apiClient.patch('/users/me', { wrappedPrivateKey });
        } catch (migrationErr) {
          console.warn('Auto-migration of key wrapping failed (non-critical):', migrationErr);
        }
      }

      // Save to sessionStorage for refresh tolerance
      sessionStorage.setItem('privateKey', privateKey);
      sessionStorage.setItem('publicKey', publicKey);

      set({
        user: userData,
        privateKey,
        publicKey,
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
      // Generate random key pair (called ONCE, keys never change)
      const keyPair = generateKeyPair();

      // Wrap the private key with password-derived key
      const wrappedPrivateKey = wrapPrivateKey(keyPair.privateKey, username, password);

      // Create escrow backup with security question answer
      const securityEscrowKey = wrapPrivateKeyWithAnswer(keyPair.privateKey, securityQuestionAnswer);

      await apiClient.post('/auth/register', {
        username,
        email,
        fullName,
        password,
        securityQuestionHash: securityQuestionAnswer,
        publicKey: keyPair.publicKey,
        wrappedPrivateKey,
        securityEscrowKey,
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
