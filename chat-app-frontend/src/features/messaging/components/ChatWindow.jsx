import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useChatStore } from '../../chats/store/useChatStore.js';
import { useMessageStore } from '../store/useMessageStore.js';
import { useAuthStore } from '../../auth/store/useAuthStore.js';
import { useSocketMessages } from '../hooks/useSocketMessages.js';
import { ChatBubble } from './ChatBubble.jsx';
import { ChatInput } from './ChatInput.jsx';
import { formatLastSeen } from '../../../shared/utils/format.js';
import { Users, LogOut, ShieldAlert, ArrowLeft, Trash2, UserPlus, FileText, Link } from 'lucide-react';
import { cn } from '../../../shared/utils/cn.js';
import { Button } from '../../../shared/components/ui/Button.jsx';
import { Input } from '../../../shared/components/ui/Input.jsx';
import { Textarea } from '../../../shared/components/ui/Textarea.jsx';
import apiClient from '../../../shared/lib/apiClient.js';

export const ChatWindow = () => {
  const { user: currentUser, privateKey } = useAuthStore();
  const { chats, activeChatId, updateGroupSettings, addGroupMember, removeGroupMember, selectChat, deleteChat, blockUser, unblockUser } = useChatStore();
  const { messagesByChatId, fetchMessages, typingUsersByChatId, isLoading } = useMessageStore();

  const [showInfo, setShowInfo] = useState(false);
  const [newMemberUsername, setNewMemberUsername] = useState('');
  
  // Group editing state
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [onlyAdminsSend, setOnlyAdminsSend] = useState(false);

  // Group directory & shared files states
  const [membersList, setMembersList] = useState([]);
  const [sharedMedia, setSharedMedia] = useState({ images: [], videos: [], docs: [], links: [] });
  const [mediaTab, setMediaTab] = useState('media');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/join/${activeChatId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2050);
  };

  const photoInputRef = useRef(null);
  const addMemberInputRef = useRef(null);

  const messagesEndRef = useRef(null);

  const activeChat = chats.find((c) => c.chatId === activeChatId);

  // Hook up E2EE keys
  const recipientPublicKey = activeChat?.recipient?.publicKey;

  // Initialize socket listener hook for this specific room
  useSocketMessages(activeChatId, recipientPublicKey);

  // Fetch messages from history on chat open
  useEffect(() => {
    if (activeChatId && currentUser && privateKey) {
      fetchMessages(activeChatId, currentUser.id, privateKey, recipientPublicKey);
      setTimeout(() => setShowInfo(false), 0);
    }
  }, [activeChatId, currentUser, privateKey, recipientPublicKey, fetchMessages]);

  // Sync group details editing state when group settings change
  useEffect(() => {
    if (activeChat && activeChat.chatType === 'GROUP') {
      setTimeout(() => {
        setGroupName(activeChat.groupDetails.groupName);
        setGroupDesc(activeChat.groupDetails.description || '');
        setOnlyAdminsSend(activeChat.groupDetails.onlyAdminsCanSend);
      }, 0);
    }
  }, [activeChat]);

  // Scroll to bottom on new messages
  const messages = useMemo(() => messagesByChatId[activeChatId] || [], [messagesByChatId, activeChatId]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchGroupMembersList = useCallback(async () => {
    if (activeChatId) {
      try {
        const res = await apiClient.get(`/chats/group/${activeChatId}/members`);
        setMembersList(res.data?.data?.members || []);
      } catch (err) {
        console.error('Failed to fetch group members list:', err);
      }
    }
  }, [activeChatId]);

  const fetchSharedMedia = useCallback(async () => {
    if (activeChatId) {
      try {
        const res = await apiClient.get(`/messages/${activeChatId}/media`);
        setSharedMedia(res.data?.data?.gallery || { images: [], videos: [], docs: [], links: [] });
      } catch (err) {
        console.error('Failed to fetch shared media:', err);
      }
    }
  }, [activeChatId]);

  useEffect(() => {
    if (showInfo && activeChatId) {
      setTimeout(() => {
        fetchSharedMedia();
        const isGroupChat = chats.find((c) => c.chatId === activeChatId)?.chatType === 'GROUP';
        if (isGroupChat) {
          fetchGroupMembersList();
        }
      }, 0);
    }
  }, [showInfo, activeChatId, chats, fetchSharedMedia, fetchGroupMembersList]);

  if (!activeChatId || !activeChat) {
    return (
      <div className="flex-1 h-full bg-transparent flex flex-col items-center justify-center text-center p-6 select-none relative overflow-hidden">
        {/* Decorative Gradients */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-500/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        
        <div className="p-5.5 bg-slate-900/35 border border-white/5 rounded-[24px] mb-5 shadow-2xl backdrop-blur-xl relative z-10 transition-all duration-300 hover:border-white/10 hover:shadow-brand-500/5">
          <Users className="h-12 w-12 text-brand-500 filter drop-shadow-[0_0_10px_rgba(59,130,246,0.4)] animate-presence-pulse" />
        </div>
        <h3 className="text-lg font-black bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 bg-clip-text text-transparent tracking-tight relative z-10">No Conversation Open</h3>
        <p className="text-xs text-slate-500 max-w-xs mt-2.5 leading-relaxed relative z-10 font-medium">
          Select an active chat from the sidebar or search for users in the directory to start secure end-to-end encrypted messaging.
        </p>
      </div>
    );
  }

  const isGroup = activeChat.chatType === 'GROUP';
  const name = isGroup ? activeChat.groupDetails?.groupName : activeChat.recipient?.fullName;
  const isOnline = !isGroup && activeChat.recipient?.isOnline;
  const lastSeen = !isGroup && activeChat.recipient?.lastSeen;

  // Typing status list text resolution
  const typingUsers = typingUsersByChatId[activeChatId] || [];
  const otherTypingUsers = typingUsers.filter((u) => u.userId !== currentUser?.id);
  const displayTypingText = (() => {
    if (otherTypingUsers.length === 0) return '';
    if (!isGroup) return 'typing...';
    if (otherTypingUsers.length === 1) {
      return `${otherTypingUsers[0].fullName || otherTypingUsers[0].username || 'Someone'} is typing...`;
    }
    if (otherTypingUsers.length === 2) {
      return `${otherTypingUsers[0].fullName || otherTypingUsers[0].username} and ${otherTypingUsers[1].fullName || otherTypingUsers[1].username} are typing...`;
    }
    return `${otherTypingUsers.length} people are typing...`;
  })();

  const handleUpdateGroupSettings = async (e) => {
    e.preventDefault();
    try {
      await updateGroupSettings(activeChatId, {
        groupName,
        description: groupDesc,
        onlyAdminsCanSend: onlyAdminsSend,
      });
      alert('Group settings saved');
    } catch (err) {
      alert(err.message || 'Failed to update settings');
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberUsername.trim()) return;

    try {
      // Find user by username first to get ID
      const searchRes = await apiClient.get(`/users/${newMemberUsername.trim()}`);
      const user = searchRes.data.data.users?.[0];
      if (!user) {
        alert('User not found');
        return;
      }

      await addGroupMember(activeChatId, user.id);
      setNewMemberUsername('');
      alert('Member added successfully');
      fetchGroupMembersList();
    } catch (err) {
      alert(err.message || 'Failed to add member');
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setIsUploadingPhoto(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiClient.post('/messages/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploadedUrl = res.data.data.fileUrl;

      // Save to group settings
      await updateGroupSettings(activeChatId, {
        groupName,
        description: groupDesc,
        onlyAdminsCanSend: onlyAdminsSend,
        groupPhotoUrl: uploadedUrl,
      });
      alert('Group photo updated successfully');
    } catch (err) {
      alert(err.message || 'Failed to update group photo');
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleKickMember = async (targetUserId, fullName) => {
    if (window.confirm(`Are you sure you want to remove ${fullName} from the group?`)) {
      try {
        await removeGroupMember(activeChatId, targetUserId);
        alert(`${fullName} removed from the group`);
        fetchGroupMembersList();
      } catch (err) {
        alert(err.message || 'Failed to remove member');
      }
    }
  };

  const handleLeaveGroup = async () => {
    if (window.confirm('Are you sure you want to leave this group?')) {
      try {
        await removeGroupMember(activeChatId, currentUser.id);
      } catch (err) {
        alert(err.message || 'Failed to leave group');
      }
    }
  };

  const handleDeleteForMe = async () => {
    const confirmMsg = isGroup
      ? 'Are you sure you want to clear your chat history for this group? This cannot be undone.'
      : 'Are you sure you want to delete this chat for yourself? The conversation will be hidden until you receive a new message.';
    if (window.confirm(confirmMsg)) {
      try {
        await deleteChat(activeChatId, 'ME');
        setShowInfo(false);
      } catch (err) {
        alert(err.message || 'Failed to delete chat');
      }
    }
  };

  const handleDeleteForEveryone = async () => {
    const confirmMsg = isGroup
      ? 'Are you sure you want to delete this group and all its history for everyone? This action is permanent and cannot be undone.'
      : 'Are you sure you want to delete this chat and all its messages for everyone? This action is permanent and cannot be undone.';
    if (window.confirm(confirmMsg)) {
      try {
        await deleteChat(activeChatId, 'EVERYONE');
        setShowInfo(false);
      } catch (err) {
        alert(err.message || 'Failed to delete chat for everyone');
      }
    }
  };

  return (
    <div className="flex-1 h-full bg-transparent flex relative overflow-hidden">
      {/* Messaging View */}
      <div className="flex-1 flex flex-col h-full border-r border-slate-900/40">
        
        {/* Header */}
        <div className="p-3.5 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between select-none backdrop-blur-md">
          <div
            onClick={() => setShowInfo(!showInfo)}
            className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition-opacity"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                selectChat(null);
              }}
              className="md:hidden p-2 bg-slate-950/40 border border-slate-850 hover:bg-slate-800 hover:text-white rounded-xl transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex flex-col">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                {name}
                {!isGroup && (
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full ring-2 ring-slate-950",
                      isOnline ? "bg-green-500 animate-presence-pulse glow-green" : "bg-slate-650"
                    )}
                  />
                )}
              </h4>
              <p className={cn(
                "text-[10px] font-semibold mt-0.5 transition-colors",
                displayTypingText ? "text-emerald-400 animate-pulse font-bold" : "text-slate-500"
              )}>
                {isGroup
                  ? (displayTypingText || `${activeChat.participantsCount || 0} participants`)
                  : (displayTypingText || formatLastSeen(isOnline, lastSeen))}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowInfo(!showInfo)}
            className={cn(
              "p-2.5 bg-slate-950/40 border border-slate-850 hover:bg-slate-800 hover:text-white rounded-xl transition-all shadow-sm",
              showInfo && "bg-slate-800 text-white"
            )}
            title="Chat Info"
          >
            <Users className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Messages feed container */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {isLoading && messages.length === 0 ? (
            <div className="m-auto flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-brand-500"></div>
              <span className="text-xs text-slate-500">Decrypting messages...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="m-auto text-center p-6 max-w-xs">
              <p className="text-xs text-slate-500 leading-relaxed italic">
                🔒 Messages are end-to-end encrypted. No one outside of this chat, not even the server, can read them.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  chatType={activeChat.chatType}
                  isGroupAdmin={activeChat?.groupDetails?.role === 'ADMIN'}
                  recipientPublicKey={recipientPublicKey}
                />
              )) }
              {otherTypingUsers.map((tUser) => (
                <div key={tUser.userId} className="flex flex-col mb-3.5 max-w-[70%] mr-auto items-start animate-fade-in select-none">
                  {isGroup && (
                    <span className="text-[10px] font-bold text-slate-400 mb-1 ml-2">
                      {tUser.fullName || tUser.username || 'Someone'}
                    </span>
                  )}
                  <div className="px-4 py-3 rounded-2xl rounded-tl-none border bg-slate-900/35 border-white/5 text-slate-100 backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.15)] flex items-center gap-1.5 min-w-[56px] justify-center">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Chat input block */}
        <ChatInput
          chatId={activeChatId}
          chatType={activeChat.chatType}
          recipientPublicKey={recipientPublicKey}
        />
      </div>

      {/* Slide-out Sidebar Info Panel */}
      {showInfo && (
        <div className="w-80 h-full bg-slate-900/40 border-l border-slate-800/80 flex flex-col overflow-y-auto animate-fade-in backdrop-blur-md">
          <div className="p-4 border-b border-slate-850 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-200">Chat Information</h4>
            <button
              onClick={() => setShowInfo(false)}
              className="text-xs text-slate-500 hover:text-slate-300 font-semibold"
            >
              Close
            </button>
          </div>

          <div className="p-4 flex flex-col gap-5">
            {/* Summary Details */}
            <div className="flex flex-col items-center text-center">
              {isGroup ? (
                <div className="relative group/avatar cursor-pointer mb-3 select-none">
                  <img
                    src={activeChat.groupDetails?.groupPhotoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${name}`}
                    alt={name}
                    className="w-20 h-20 rounded-full object-cover border border-slate-700/60 shadow-lg"
                  />
                  {activeChat.groupDetails?.role === 'ADMIN' && (
                    <div
                      onClick={() => photoInputRef.current?.click()}
                      className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold text-center p-1.5"
                    >
                      {isUploadingPhoto ? 'Uploading...' : 'Change Photo'}
                    </div>
                  )}
                  <input
                    type="file"
                    ref={photoInputRef}
                    onChange={handlePhotoUpload}
                    className="hidden"
                    accept="image/*"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-lg font-bold text-slate-300 mb-3 shadow-inner">
                  {name?.[0].toUpperCase()}
                </div>
              )}
              
              <h5 className="text-sm font-bold text-slate-100">{name}</h5>
              <p className="text-xs text-slate-500 mt-1">
                {isGroup ? 'Group Conversation' : `@${activeChat.recipient?.username}`}
              </p>

              {/* Circular Action Buttons */}
              {isGroup && (
                <div className="flex items-center justify-center gap-6 mt-4 select-none">
                  {activeChat.groupDetails?.role === 'ADMIN' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (addMemberInputRef.current) {
                          addMemberInputRef.current.scrollIntoView({ behavior: 'smooth' });
                          addMemberInputRef.current.focus();
                        }
                      }}
                      className="flex flex-col items-center gap-1.5 group/btn"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-750 border border-slate-700/50 flex items-center justify-center text-slate-300 group-hover/btn:text-slate-100 transition-all shadow-md">
                        <UserPlus className="h-4 w-4" />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 group-hover/btn:text-slate-400">Add</span>
                    </button>
                  )}
                  
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="flex flex-col items-center gap-1.5 group/btn"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-750 border border-slate-700/50 flex items-center justify-center text-slate-300 group-hover/btn:text-slate-100 transition-all shadow-md relative">
                      <Link className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 group-hover/btn:text-slate-400">
                      {copiedLink ? 'Copied!' : 'Invite Link'}
                    </span>
                  </button>
                </div>
              )}

              {!isGroup && activeChat.recipient?.bio && (
                <p className="text-xs text-slate-400 mt-3 p-3 bg-slate-950/40 rounded-xl border border-slate-850/50 max-w-full italic">
                  "{activeChat.recipient.bio}"
                </p>
              )}
            </div>



            {/* Tabbed Shared Files */}
            <div className="flex flex-col gap-2.5 border-t border-slate-800 pt-4">
              <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left mb-1">Shared Gallery</h6>
              <div className="flex border-b border-slate-800">
                {['media', 'docs', 'links'].map((tab) => {
                  const mediaCount = (sharedMedia?.images?.length || 0) + (sharedMedia?.videos?.length || 0);
                  const docsCount = sharedMedia?.docs?.length || 0;
                  const linksCount = sharedMedia?.links?.length || 0;
                  const countLabel = tab === 'media' ? mediaCount : (tab === 'docs' ? docsCount : linksCount);

                  return (
                    <button
                      key={tab}
                      onClick={() => setMediaTab(tab)}
                      className={cn(
                        "flex-1 pb-2 text-[10px] font-extrabold uppercase tracking-wider transition-colors border-b-2 text-center",
                        mediaTab === tab
                          ? "border-brand-500 text-brand-400"
                          : "border-transparent text-slate-500 hover:text-slate-350"
                      )}
                    >
                      {tab} ({countLabel})
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 text-left">
                {mediaTab === 'media' && (
                  <>
                    {[...(sharedMedia?.images || []), ...(sharedMedia?.videos || [])].length === 0 ? (
                      <span className="text-[10px] text-slate-500 italic block py-2 text-center">No shared images or videos.</span>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1">
                        {[...(sharedMedia?.images || []), ...(sharedMedia?.videos || [])].map((item, idx) => (
                          <a
                            key={idx}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="aspect-square bg-slate-905 border border-slate-800 rounded-lg overflow-hidden hover:opacity-80 transition-opacity flex items-center justify-center"
                          >
                            {item.url?.includes('.mp4') ? (
                              <span className="text-[9px] text-slate-400 font-bold uppercase">🎥 Video</span>
                            ) : (
                              <img src={item.url} alt="shared" className="w-full h-full object-cover" />
                            )}
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {mediaTab === 'docs' && (
                  <>
                    {(sharedMedia?.docs || []).length === 0 ? (
                      <span className="text-[10px] text-slate-500 italic block py-2 text-center">No shared documents.</span>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                        {(sharedMedia?.docs || []).map((item, idx) => (
                          <a
                            key={idx}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 p-2 bg-slate-955/40 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors min-w-0"
                          >
                            <FileText className="h-4 w-4 text-red-500 flex-shrink-0" />
                            <span className="text-[10px] text-slate-300 font-semibold truncate flex-1 leading-tight">
                              {item.url?.split('/').pop() || 'document.pdf'}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {mediaTab === 'links' && (
                  <>
                    {(sharedMedia?.links || []).length === 0 ? (
                      <span className="text-[10px] text-slate-500 italic block py-2 text-center">No shared links.</span>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                        {(sharedMedia?.links || []).map((item, idx) => (
                          <a
                            key={idx}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col gap-0.5 p-2 bg-slate-955/40 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors text-left"
                          >
                            <span className="text-[10px] text-brand-400 font-bold truncate leading-tight hover:underline">
                              {item.url}
                            </span>
                            <span className="text-[8px] text-slate-500 truncate leading-none">
                              {item.encryptedContent || 'Scraped shared link'}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Group Admin Settings Panel */}
            {isGroup && (
              <div className="flex flex-col gap-4">
                {activeChat.groupDetails?.role === 'ADMIN' ? (
                  <form onSubmit={handleUpdateGroupSettings} className="flex flex-col gap-3.5 border-t border-slate-850 pt-4 text-left">
                    <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Group Settings (Admin)</h6>
                    <Input
                      label="Group Name"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                    <Textarea
                      label="Description"
                      value={groupDesc}
                      onChange={(e) => setGroupDesc(e.target.value)}
                      rows={2}
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={onlyAdminsSend}
                        onChange={(e) => setOnlyAdminsSend(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-800 text-brand-500 focus:ring-0 focus:ring-offset-0"
                      />
                      Only admins can send messages
                    </label>
                    <Button type="submit" size="sm" className="mt-1">Save Settings</Button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2 border-t border-slate-850 pt-4 text-left">
                    <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</h6>
                    <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/20 p-3 rounded-xl border border-slate-850">
                      {activeChat.groupDetails?.description || <span className="italic text-slate-500">No group description set.</span>}
                    </p>
                  </div>
                )}

                {/* Add Group Member form (Admin only) */}
                {activeChat.groupDetails?.role === 'ADMIN' && (
                  <form onSubmit={handleAddMember} className="flex flex-col gap-2.5 border-t border-slate-850 pt-4 text-left">
                    <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Add Member</h6>
                    <div className="flex gap-2">
                      <Input
                        ref={addMemberInputRef}
                        placeholder="Search by username..."
                        value={newMemberUsername}
                        onChange={(e) => setNewMemberUsername(e.target.value)}
                        className="py-2 text-xs"
                      />
                      <Button type="submit" size="sm">Add</Button>
                    </div>
                  </form>
                )}

                {/* Group Directory */}
                <div className="flex flex-col gap-3.5 border-t border-slate-850 pt-4 text-left">
                  <div className="flex justify-between items-center mb-1">
                    <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Group Directory</h6>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-900/60 px-1.5 py-0.5 rounded">
                      {membersList.length} total
                    </span>
                  </div>

                  {/* Active Members Category */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Active Members</span>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                      {membersList.filter(m => m.role === 'ADMIN' || m.role === 'MEMBER').map((member) => (
                        <div key={member.userId} className="flex items-center justify-between gap-2 p-1.5 hover:bg-slate-900/40 rounded-xl transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={member.user.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${member.user.fullName}`}
                              alt={member.user.fullName}
                              className="w-7 h-7 rounded-full object-cover border border-slate-800"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-200 truncate leading-tight flex items-center gap-1.5">
                                {member.user.fullName}
                                {member.role === 'ADMIN' && (
                                  <span className="text-[8px] bg-brand-500/10 text-brand-400 border border-brand-500/20 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider scale-95">Admin</span>
                                )}
                              </span>
                              <span className="text-[10px] text-slate-500 truncate leading-none mt-0.5">@{member.user.username}</span>
                            </div>
                          </div>

                          {/* Kick / Remove option */}
                          {activeChat.groupDetails?.role === 'ADMIN' && member.userId !== currentUser.id && (
                            <button
                              onClick={() => handleKickMember(member.userId, member.user.fullName)}
                              className="text-[10px] font-extrabold text-red-400 hover:text-red-350 hover:bg-red-950/20 px-2.5 py-1 rounded-lg border border-transparent hover:border-red-900/30 transition-all"
                            >
                              Kick
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Past Members Category */}
                  {membersList.some(m => m.role === 'LEFT' || m.role === 'REMOVED') && (
                    <div className="flex flex-col gap-2 mt-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Past Members</span>
                      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                        {membersList.filter(m => m.role === 'LEFT' || m.role === 'REMOVED').map((member) => (
                          <div key={member.userId} className="flex items-center justify-between gap-2 p-1.5 hover:bg-slate-900/30 rounded-xl opacity-60 hover:opacity-80 transition-all">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={member.user.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${member.user.fullName}`}
                                alt={member.user.fullName}
                                className="w-7 h-7 rounded-full object-cover border border-slate-800 grayscale"
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-300 truncate leading-tight flex items-center gap-1.5">
                                  {member.user.fullName}
                                  <span className="text-[8px] bg-slate-800 text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">{member.role === 'LEFT' ? 'Left' : 'Removed'}</span>
                                </span>
                                <span className="text-[10px] text-slate-500 truncate leading-none mt-0.5">@{member.user.username}</span>
                              </div>
                            </div>
                            <span className="text-[8px] text-slate-500 select-none">
                              {member.leftAt ? new Date(member.leftAt).toLocaleDateString() : 'Exited'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Leave Group Action */}
                  <div className="border-t border-slate-800 pt-4">
                    <Button
                      onClick={handleLeaveGroup}
                      variant="outline"
                      className="w-full text-red-500 hover:text-white hover:bg-red-950 border-red-900/50 flex items-center justify-center gap-2 font-bold py-2.5 rounded-xl transition-all"
                    >
                      <LogOut className="h-4 w-4" /> Exit Group
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Danger Zone / Chat Actions */}
            <div className="border-t border-slate-850 pt-4 flex flex-col gap-3">
              <h6 className="text-[10px] font-bold text-red-400 uppercase tracking-wider text-left">Chat Actions</h6>
              
              {!isGroup && (
                <Button
                  onClick={async () => {
                    try {
                      if (activeChat.blockedBySelf) {
                        await unblockUser(activeChat.recipient.id);
                      } else {
                        if (window.confirm(`Are you sure you want to block ${activeChat.recipient.fullName}?`)) {
                          await blockUser(activeChat.recipient.id);
                        }
                      }
                    } catch (err) {
                      alert(err.message || 'Action failed');
                    }
                  }}
                  variant="outline"
                  className={cn(
                    "w-full flex items-center justify-center gap-2 font-bold",
                    activeChat.blockedBySelf
                      ? "text-green-400 hover:text-white hover:bg-green-950/25 hover:border-green-900 border-slate-850"
                      : "text-red-400 hover:text-white hover:bg-red-950/25 hover:border-red-900 border-slate-850"
                  )}
                >
                  <ShieldAlert className="h-4 w-4" />
                  {activeChat.blockedBySelf ? 'Unblock User' : 'Block User'}
                </Button>
              )}

              <Button
                onClick={handleDeleteForMe}
                variant="outline"
                className="w-full text-slate-350 hover:text-white hover:bg-slate-800 border-slate-800 flex items-center justify-center gap-2"
              >
                <Trash2 className="h-4 w-4 text-slate-400" />
                {isGroup ? 'Clear Chat History' : 'Delete for Me'}
              </Button>

              {(!isGroup || activeChat.groupDetails?.role === 'ADMIN') && (
                <Button
                  onClick={handleDeleteForEveryone}
                  variant="outline"
                  className="w-full text-red-400 hover:text-white hover:bg-red-950/25 hover:border-red-900 border-slate-850 flex items-center justify-center gap-2"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                  {isGroup ? 'Delete Group for Everyone' : 'Delete for Everyone'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
