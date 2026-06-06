import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStatusStore } from '../store/useStatusStore.js';
import { useAuthStore } from '../../auth/store/useAuthStore.js';
import { useChatStore } from '../../chats/store/useChatStore.js';
import { encryptMessage } from '../../../shared/lib/crypto.js';
import socket from '../../../app/socket.js';
import { ChevronLeft, ChevronRight, X, Trash2 } from 'lucide-react';
import { cn } from '../../../shared/utils/cn.js';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const StatusViewerModal = ({ isOpen, onClose, feed }) => {
  const { viewStatus, deleteStatus, getStatusViewers } = useStatusStore();
  const { user: currentUser, privateKey } = useAuthStore();
  const { chats, createPrivateChat } = useChatStore();

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Reactions & Replies state
  const [showReactions, setShowReactions] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);

  // Viewers list state
  const [viewers, setViewers] = useState([]);
  const [showViewers, setShowViewers] = useState(false);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);

  const isOwnStatus = feed?.user?.id === currentUser?.id;
  const statuses = feed?.statuses || [];
  const activeStatus = statuses[currentIdx];

  const isTimerPaused = showViewers || replyText.trim().length > 0 || isSendingReply;

  // Reset states on status change
  useEffect(() => {
    setShowReactions(false);
    setReplyText('');
    setReplySuccess(false);
    setShowViewers(false);
    setViewers([]);
  }, [currentIdx]);

  // Register view automatically when status changes
  useEffect(() => {
    if (activeStatus && isOpen && !isOwnStatus) {
      viewStatus(activeStatus.id, activeStatus.isLiked, activeStatus.emoji);
    }
  }, [activeStatus?.id, isOpen, isOwnStatus]);

  // Fetch viewers list for status owner
  useEffect(() => {
    if (activeStatus && showViewers && isOwnStatus) {
      const loadViewers = async () => {
        setIsLoadingViewers(true);
        const list = await getStatusViewers(activeStatus.id);
        setViewers(list);
        setIsLoadingViewers(false);
      };
      loadViewers();
    }
  }, [activeStatus?.id, showViewers, isOwnStatus, getStatusViewers]);

  // Auto advance timer
  useEffect(() => {
    if (!isOpen || statuses.length === 0 || isTimerPaused) return;

    const timer = setTimeout(() => {
      handleNext();
    }, 5000);

    return () => clearTimeout(timer);
  }, [isOpen, currentIdx, statuses.length, isTimerPaused]);

  if (!isOpen || statuses.length === 0) return null;

  const handleNext = () => {
    if (currentIdx < statuses.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  };

  const handleEmojiSelect = async (emoji) => {
    try {
      await viewStatus(activeStatus.id, false, emoji);
      setShowReactions(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || isSendingReply) return;

    setIsSendingReply(true);
    try {
      const targetUserId = feed.user.id;
      
      // 1. Find or create private chat
      let chat = chats.find(
        (c) =>
          c.chatType === 'PRIVATE' &&
          (c.recipient?.id === targetUserId || c.recipientId === targetUserId)
      );
      let chatId;
      let recipientPublicKey;

      if (chat) {
        chatId = chat.chatId;
        recipientPublicKey = chat.recipient?.publicKey;
      } else {
        chatId = await createPrivateChat(targetUserId);
        const freshChats = useChatStore.getState().chats;
        const newChat = freshChats.find((c) => c.chatId === chatId);
        recipientPublicKey = newChat?.recipient?.publicKey;
      }

      if (!recipientPublicKey) {
        throw new Error('Recipient public key not found for E2EE reply.');
      }

      // 2. Format reply content (context of status + reply)
      const statusContext =
        activeStatus.statusType === 'IMAGE'
          ? `[Replied to Status Photo: "${activeStatus.encryptedContent || 'No Caption'}"]`
          : `[Replied to Status Text: "${activeStatus.encryptedContent}"]`;

      const fullMessageText = `${statusContext}\n\n${replyText}`;

      // 3. Encrypt message
      const encryptedContent = encryptMessage(fullMessageText, recipientPublicKey, privateKey);

      // 4. Emit via socket
      socket.emit(
        'send_message',
        {
          chatId,
          encryptedContent,
          mediaType: 'TEXT',
        },
        (res) => {
          if (res.status !== 'success') {
            alert(res.message || 'Failed to send status reply');
          }
        }
      );

      setReplyText('');
      setReplySuccess(true);
      setTimeout(() => setReplySuccess(false), 2500);
    } catch (err) {
      console.error('Failed to send status reply:', err);
      alert(err.message || 'Failed to send status reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError('');
    setIsDeleting(true);
    try {
      await deleteStatus(activeStatus.id);
      if (statuses.length > 1) {
        const nextIdx = currentIdx > 0 ? currentIdx - 1 : 0;
        setCurrentIdx(nextIdx);
      } else {
        onClose();
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete status');
    } finally {
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-fade-in select-none">
      {/* Progress bars */}
      <div className="absolute top-4 left-4 right-4 flex gap-1 z-10">
        {statuses.map((_, idx) => (
          <div key={idx} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full bg-white rounded-full',
                idx < currentIdx && 'w-full',
                idx === currentIdx && 'w-full',
                idx > currentIdx && 'w-0'
              )}
              style={
                idx === currentIdx && !isTimerPaused
                  ? { transition: 'width 5000ms linear' }
                  : {}
              }
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-8 left-4 right-4 flex items-center justify-between z-10 text-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold border border-slate-700 overflow-hidden">
            {feed.user?.profilePictureUrl ? (
              <img src={feed.user.profilePictureUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              feed.user?.fullName?.[0]?.toUpperCase()
            )}
          </div>
          <div>
            <h5 className="text-sm font-bold">{feed.user?.fullName}</h5>
            <p className="text-[10px] text-white/50">@{feed.user?.username}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOwnStatus && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/70 hover:bg-red-900/70 border border-red-800/50 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 transition-all disabled:opacity-50 shadow-sm"
              title="Delete this status"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-900/70 border border-slate-800 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors shadow-sm"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {deleteError && (
        <div className="absolute top-20 left-4 right-4 z-20 p-2.5 bg-red-950/80 border border-red-800 rounded-xl text-xs font-semibold text-red-300 text-center">
          ⚠️ {deleteError}
        </div>
      )}

      {/* Main status card */}
      <div
        style={activeStatus?.statusType === 'IMAGE' ? {} : { backgroundColor: activeStatus?.backgroundColor || '#0f172a' }}
        className="w-full max-w-md h-[72vh] rounded-3xl flex flex-col justify-between p-6 text-center shadow-2xl relative transition-all duration-300 overflow-hidden border border-slate-800/40 bg-slate-950"
      >
        {/* Background Image for image status */}
        {activeStatus?.statusType === 'IMAGE' && (
          <>
            <img
              src={activeStatus.mediaUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/75 pointer-events-none" />
          </>
        )}

        {/* Top spacer */}
        <div className="h-10" />

        {/* Status body content */}
        <div className={cn(
          "flex-1 flex justify-center p-4 relative z-10",
          activeStatus?.statusType === 'IMAGE' ? "items-end pb-2" : "items-center"
        )}>
          {activeStatus?.encryptedContent && (
            <p
              className={cn(
                'leading-relaxed break-words max-w-full font-semibold select-text',
                activeStatus?.statusType === 'IMAGE'
                  ? 'text-xs text-white bg-slate-950/85 px-4 py-2 border border-slate-800 rounded-xl w-full text-center shadow-md'
                  : 'text-lg text-white'
              )}
            >
              {activeStatus?.encryptedContent}
            </p>
          )}
        </div>

        {/* Bottom action panel */}
        <div className="relative z-10 flex flex-col items-center gap-3">
          {/* Reaction selector bar */}
          {showReactions && (
            <div className="absolute bottom-full mb-2 bg-slate-900 border border-slate-800 rounded-2xl p-1.5 flex gap-1.5 shadow-xl animate-fade-in z-20">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiSelect(emoji)}
                  className="hover:scale-125 transition-transform text-sm px-0.5"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between w-full">
            {isOwnStatus ? (
              <button
                onClick={() => setShowViewers(!showViewers)}
                className="text-[10px] text-white/80 hover:text-brand-300 font-bold bg-black/45 hover:bg-black/60 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md"
              >
                👁️ {activeStatus?.viewCount || 0} {activeStatus?.viewCount === 1 ? 'view' : 'views'}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowReactions(!showReactions)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/70 hover:bg-slate-900 border border-slate-800/40 rounded-xl text-xs font-semibold transition-all shadow-md',
                    activeStatus?.emoji ? 'text-brand-400 border-brand-900/40 font-bold' : 'text-slate-350'
                  )}
                >
                  <span>{activeStatus?.emoji || '😊'}</span>
                  {activeStatus?.emoji ? `Reacted ${activeStatus.emoji}` : 'React'}
                </button>
              </div>
            )}
          </div>

          {/* Reply form */}
          {!isOwnStatus && (
            <form onSubmit={handleSendReply} className="flex gap-2 w-full mt-1">
              <input
                type="text"
                placeholder={replySuccess ? 'Reply Sent! ✓' : 'Reply securely...'}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={isSendingReply || replySuccess}
                className={cn(
                  'flex-1 px-3 py-2 text-xs bg-slate-950/75 hover:bg-slate-950 border rounded-xl text-white placeholder-slate-500 focus:outline-none transition-colors',
                  replySuccess ? 'border-green-500 bg-green-950/20 text-green-300' : 'border-slate-800/70 focus:border-brand-500'
                )}
              />
              <button
                type="submit"
                disabled={!replyText.trim() || isSendingReply || replySuccess}
                className="px-3.5 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-xl text-xs font-bold text-white transition-colors shadow-md active:scale-95"
              >
                Send
              </button>
            </form>
          )}
        </div>

        {/* Viewers list bottom drawer */}
        {isOwnStatus && showViewers && (
          <div className="absolute inset-x-0 bottom-0 max-h-[70%] bg-slate-900 border-t border-slate-800 rounded-t-3xl shadow-2xl flex flex-col text-left z-30 animate-slide-up">
            {/* Drawer header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/40 rounded-t-3xl">
              <h6 className="text-xs font-bold text-slate-300">
                Viewed by ({viewers.length})
              </h6>
              <button
                onClick={() => setShowViewers(false)}
                className="text-[10px] text-slate-500 hover:text-slate-350 font-extrabold uppercase px-1.5 py-0.5 hover:bg-slate-800 rounded-md transition-colors"
              >
                Close
              </button>
            </div>

            {/* Drawer list */}
            <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-3 min-h-0">
              {isLoadingViewers ? (
                <div className="text-center py-6 text-xs text-slate-500">Loading viewers...</div>
              ) : viewers.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500 italic">No views yet.</div>
              ) : (
                viewers.map((view, idx) => (
                  <div key={idx} className="flex items-center justify-between border-b border-slate-850/30 pb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold overflow-hidden">
                        {view.viewer?.profilePictureUrl ? (
                          <img src={view.viewer.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          view.viewer?.fullName?.[0]?.toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-200">{view.viewer?.fullName}</p>
                        <p className="text-[9px] text-slate-500">
                          {new Date(view.viewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    {view.emoji && (
                      <span className="text-sm bg-slate-950/40 px-1.5 py-0.5 rounded-md border border-slate-850" title="Reaction">
                        {view.emoji}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation controls */}
      {currentIdx > 0 && (
        <button
          onClick={handlePrev}
          className="absolute left-4 p-2.5 bg-slate-900/70 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 shadow-lg z-10 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {currentIdx < statuses.length - 1 && (
        <button
          onClick={handleNext}
          className="absolute right-4 p-2.5 bg-slate-900/70 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 shadow-lg z-10 transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>,
    document.body
  );
};
