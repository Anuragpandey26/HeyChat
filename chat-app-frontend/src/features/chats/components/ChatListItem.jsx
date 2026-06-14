import { useState } from 'react';
import { useAuthStore } from '../../auth/store/useAuthStore.js';
import { useChatStore } from '../../chats/store/useChatStore.js';
import { useMessageStore } from '../../messaging/store/useMessageStore.js';
import { decryptMessage } from '../../../shared/lib/crypto.js';
import { formatMessageTime } from '../../../shared/utils/format.js';
import { Pin, Users, Trash2 } from 'lucide-react';
import { cn } from '../../../shared/utils/cn.js';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Button } from '../../../shared/components/ui/Button.jsx';

export const ChatListItem = ({ chat, isActive, onClick }) => {
  const { user: currentUser, privateKey } = useAuthStore();
  const { deleteChat, removeGroupMember } = useChatStore();
  const typingUsers = useMessageStore((state) => state.typingUsersByChatId[chat.chatId]);
  const otherTypingUsers = (typingUsers || []).filter((u) => u.userId !== currentUser?.id);
  const isTyping = otherTypingUsers.length > 0;
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const isGroup = chat.chatType === 'GROUP';

  // Get recipient public key for private E2EE decryption
  const recipientPublicKey = chat.recipient?.publicKey;

  // Decrypt last message content dynamically
  let lastMessageText = '';
  if (chat.lastMessage) {
    if (chat.lastMessage.isDeletedEveryone) {
      lastMessageText = 'This message was deleted';
    } else if (!isGroup && recipientPublicKey && chat.lastMessage.encryptedContent) {
      const isSender = chat.lastMessage.senderId === currentUser.id;
      const otherPublicKey = isSender ? recipientPublicKey : chat.recipient.publicKey;
      lastMessageText = decryptMessage(chat.lastMessage.encryptedContent, otherPublicKey, privateKey);
    } else {
      lastMessageText = chat.lastMessage.encryptedContent || 'Sent an attachment';
    }

    // Format status reply message preview for sidebar
    const statusReplyMatch = lastMessageText.match(/^\[Replied to Status (Text|Photo): "([^"]*)"\]\s*([\s\S]*)$/i);
    if (statusReplyMatch) {
      const isSender = chat.lastMessage.senderId === currentUser.id;
      const senderName = isSender ? 'You' : (chat.recipient?.fullName || 'Someone');
      lastMessageText = `${senderName} replied to status`;
    }
  }

  // Get display details
  const name = isGroup ? chat.groupDetails?.groupName : chat.recipient?.fullName;
  const avatarUrl = isGroup ? chat.groupDetails?.groupPhotoUrl : chat.recipient?.profilePictureUrl;
  const isOnline = !isGroup && chat.recipient?.isOnline;

  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <>
      <div
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 p-3.5 mx-2 my-1 rounded-xl cursor-pointer select-none transition-all duration-200 group relative border",
          isActive
            ? "bg-slate-800/75 border-slate-700/60 text-slate-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06),0_4px_12px_rgba(0,0,0,0.2)]"
            : "hover:bg-slate-800/35 text-slate-300 hover:text-slate-200 border-transparent"
        )}
      >
      {/* Left indicator accent */}
      {isActive && (
        <div className="absolute left-0 top-3 bottom-3 w-1 bg-gradient-to-b from-brand-500 to-blue-600 rounded-r-full" />
      )}

      {/* Avatar with Presence Indicator */}
      <div className="relative flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-11 h-11 rounded-full object-cover border border-slate-850 group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-slate-800 to-slate-850 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 group-hover:scale-105 transition-transform duration-200 shadow-inner">
            {isGroup ? <Users className="h-5 w-5 text-slate-400" /> : initials}
          </div>
        )}
        
        {/* Presence ring */}
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-950 rounded-full animate-presence-pulse" />
        )}
      </div>

      {/* Message Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold truncate text-slate-200 pr-1">
            {name}
          </h4>
          <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap">
            {chat.lastMessage ? formatMessageTime(chat.lastMessage.sentAt) : ''}
          </span>
        </div>

        <div className="flex items-center justify-between">
          {isTyping ? (
            <p className="text-xs truncate text-emerald-400 font-bold animate-pulse">
              {isGroup 
                ? `${otherTypingUsers[0].fullName || otherTypingUsers[0].username || 'Someone'} is typing...` 
                : 'typing...'}
            </p>
          ) : (
            <p className="text-xs truncate text-slate-400 font-medium">
              {chat.lastMessage ? lastMessageText : <span className="italic text-slate-500">No messages yet</span>}
            </p>
          )}

          <div className="flex items-center gap-1.5 ml-2 relative">
            <div className="flex items-center gap-1.5 group-hover:opacity-0 transition-opacity duration-150">
              {chat.isPinned && (
                <Pin className="h-3 w-3 text-brand-400 fill-brand-400 rotate-45" />
              )}
              {chat.unreadCount > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-extrabold text-white bg-brand-600 rounded-full">
                  {chat.unreadCount}
                </span>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteOpen(true);
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 bg-slate-900/90 border border-slate-850 hover:bg-red-950/40 hover:border-red-900 hover:text-red-400 text-slate-400 rounded-lg transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
              title="Delete Chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Delete Action Modal */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Delete Conversation"
        size="sm"
      >
        <div className="flex flex-col gap-4 text-center">
          <p className="text-xs text-slate-400 leading-relaxed">
            Choose how you want to handle the conversation with <strong className="text-slate-200">{name}</strong>.
          </p>

          <div className="flex flex-col gap-2 mt-2">
            <Button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await deleteChat(chat.chatId, 'ME');
                  setIsDeleteOpen(false);
                } catch (err) {
                  alert(err.message || 'Failed to delete chat');
                }
              }}
              variant="outline"
              className="w-full text-slate-350 hover:text-white hover:bg-slate-800 border-slate-800 flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4 text-slate-400" />
              {isGroup ? 'Clear Chat History' : 'Delete for Me'}
            </Button>

            {(!isGroup || chat.groupDetails?.role === 'ADMIN') && (
              <Button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await deleteChat(chat.chatId, 'EVERYONE');
                    setIsDeleteOpen(false);
                  } catch (err) {
                    alert(err.message || 'Failed to delete chat');
                  }
                }}
                variant="outline"
                className="w-full text-red-400 hover:text-white hover:bg-red-950/25 hover:border-red-900 border-slate-800 flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
                {isGroup ? 'Delete Group for Everyone' : 'Delete for Everyone'}
              </Button>
            )}

            {isGroup && (
              <Button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.confirm('Are you sure you want to leave this group?')) {
                    try {
                      await removeGroupMember(chat.chatId, currentUser.id);
                      setIsDeleteOpen(false);
                    } catch (err) {
                      alert(err.message || 'Failed to leave group');
                    }
                  }
                }}
                variant="outline"
                className="w-full text-red-400 hover:text-white hover:bg-red-950/20 hover:border-red-900 border-slate-800 flex items-center justify-center gap-2"
              >
                Leave Group
              </Button>
            )}

            <Button
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteOpen(false);
              }}
              className="w-full mt-2"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
