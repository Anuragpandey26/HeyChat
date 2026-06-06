import React, { createContext, useContext, useState, useEffect } from 'react';
import socket from '../../../app/socket.js';
import { useAuthStore } from '../../auth/store/useAuthStore.js';
import { useChatStore } from '../../chats/store/useChatStore.js';
import { decryptMessage } from '../../../shared/lib/crypto.js';
import { X, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const { user: currentUser, privateKey } = useAuthStore();
  const { selectChat, activeChatId } = useChatStore();
  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUser || !socket) return;

    const handleNotification = (notification) => {
      // 1. If user is currently in the active chat window, don't show the notification toast
      if (activeChatId === notification.chatId) {
        return;
      }

      let displayMessage = notification.message;

      // 2. Decrypt message content if it is a private E2EE message
      if (notification.type === 'MESSAGE' && notification.encryptedContent) {
        try {
          const decrypted = decryptMessage(
            notification.encryptedContent,
            notification.sender.publicKey,
            privateKey
          );
          
          if (decrypted.startsWith('[Replied to Status Text: "')) {
            const match = decrypted.match(/^\[Replied to Status (Text|Photo): "([^"]*)"\]\s*([\s\S]*)$/i);
            if (match) {
              displayMessage = `Replied to your status: "${match[3] || 'Photo'}"`;
            } else {
              displayMessage = 'Replied to your status';
            }
          } else if (decrypted.startsWith('[Replied to Status Photo: "')) {
            const match = decrypted.match(/^\[Replied to Status (Text|Photo): "([^"]*)"\]\s*([\s\S]*)$/i);
            if (match) {
              displayMessage = `Replied to your status photo: "${match[3] || 'Photo'}"`;
            } else {
              displayMessage = 'Replied to your status photo';
            }
          } else {
            displayMessage = decrypted;
          }
        } catch (err) {
          console.error('Failed to decrypt notification message:', err);
          displayMessage = 'Sent you a message';
        }
      }

      const newToast = {
        ...notification,
        message: displayMessage,
      };

      // Add to toasts list
      setToasts((prev) => [...prev, newToast]);

      // Add to persistent history
      setNotifications((prev) => [newToast, ...prev].slice(0, 50));

      // Auto-remove toast after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== notification.id));
      }, 4000);
    };

    socket.on('receive_notification', handleNotification);

    return () => {
      socket.off('receive_notification', handleNotification);
    };
  }, [currentUser, privateKey, activeChatId]);

  const handleToastClick = (toast) => {
    // Select chat and close toast
    selectChat(toast.chatId);
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    // Navigate to homepage (where Dashboard is loaded)
    navigate('/');
  };

  const handleCloseToast = (e, id) => {
    e.stopPropagation();
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const clearNotifications = () => setNotifications([]);
  const removeNotification = (id) => setNotifications((prev) => prev.filter((n) => n.id !== id));

  return (
    <NotificationContext.Provider value={{ toasts, notifications, clearNotifications, removeNotification }}>
      {children}
      {/* Toast Overlay Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none select-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => handleToastClick(toast)}
            className="w-full bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-2xl flex items-start gap-3 pointer-events-auto cursor-pointer hover:bg-slate-800 hover:border-slate-700 transition-all backdrop-blur-md animate-slide-up duration-300 text-left"
          >
            {/* Sender Image or Default Icon */}
            {toast.type === 'GROUP_ADD' ? (
              <div className="w-10 h-10 rounded-full bg-indigo-950/60 border border-indigo-900/40 flex items-center justify-center text-indigo-400 flex-shrink-0">
                <Users className="h-5 w-5" />
              </div>
            ) : toast.sender?.profilePictureUrl ? (
              <img
                src={toast.sender.profilePictureUrl}
                alt={toast.title}
                className="w-10 h-10 rounded-full object-cover border border-slate-800 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {toast.title?.slice(0, 2).toUpperCase()}
              </div>
            )}

            {/* Notification content text */}
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-bold text-slate-100 truncate flex items-center gap-1.5 leading-tight">
                {toast.title}
                {toast.type === 'REACTION' && <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wide">Reaction</span>}
                {toast.type === 'MENTION' && <span className="text-[9px] bg-amber-950/40 border border-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-wide">Mention</span>}
              </h5>
              <p className="text-[11px] text-slate-400 mt-1 leading-normal line-clamp-2">
                {toast.message}
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={(e) => handleCloseToast(e, toast.id)}
              className="p-1 hover:bg-slate-800 hover:text-slate-200 rounded-lg text-slate-500 transition-colors flex-shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};
