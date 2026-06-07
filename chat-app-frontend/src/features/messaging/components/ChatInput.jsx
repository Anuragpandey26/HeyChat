import React, { useState, useRef, useEffect } from 'react';
import socket from '../../../app/socket.js';
import { useAuthStore } from '../../auth/store/useAuthStore.js';
import { useChatStore } from '../../chats/store/useChatStore.js';
import { encryptMessage } from '../../../shared/lib/crypto.js';
import apiClient from '../../../shared/lib/apiClient.js';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Input } from '../../../shared/components/ui/Input.jsx';
import { Button } from '../../../shared/components/ui/Button.jsx';
import { Send, Paperclip, BarChart2, Plus, X, FileText, Users } from 'lucide-react';
import { cn } from '../../../shared/utils/cn.js';

// Size limit constants matching backend .env
const MAX_IMAGE_SIZE = 1024 * 1024; // 1 MB
const MAX_PDF_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_VIDEO_SIZE = 5 * 1024 * 1024; // 5 MB

export const ChatInput = ({ chatId, chatType, recipientPublicKey }) => {
  const { user: currentUser, privateKey } = useAuthStore();
  const { chats, unblockUser } = useChatStore();
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  const [text, setText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);

  // Mentions Autocomplete State
  const [groupMembers, setGroupMembers] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);

  const activeChat = chats.find((c) => c.chatId === chatId);
  const onlyAdminsCanSend = activeChat?.groupDetails?.onlyAdminsCanSend || false;
  const userRole = activeChat?.groupDetails?.role;
  const isRestricted = chatType === 'GROUP' && onlyAdminsCanSend && userRole !== 'ADMIN';

  // Load group members for mentions autocomplete
  useEffect(() => {
    if (chatType === 'GROUP' && chatId) {
      apiClient.get(`/chats/group/${chatId}/members`)
        .then((res) => {
          const activeMembers = (res.data?.data?.members || []).filter(
            (m) => m.role === 'MEMBER' || m.role === 'ADMIN'
          );
          setGroupMembers(activeMembers);
        })
        .catch((err) => {
          console.error('Failed to fetch group members for autocomplete:', err);
        });
    } else {
      setGroupMembers([]);
    }
  }, [chatId, chatType]);

  // File Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Attachment Flow States
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingFilePreview, setPendingFilePreview] = useState(null);
  const [pendingMediaType, setPendingMediaType] = useState(null);
  const [caption, setCaption] = useState('');
  const [acceptType, setAcceptType] = useState('image/*,application/pdf,video/*');

  // Handle click outside attachment dropdown menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Poll Modal State
  const [isPollOpen, setIsPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Handle keypress typing indicators and mentions autocomplete
  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing_start', chatId);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing_stop', chatId);
    }, 2000);

    // Mentions logic
    if (chatType === 'GROUP') {
      const match = val.match(/@(\w*)$/);
      if (match) {
        const query = match[1].toLowerCase();
        setMentionQuery(query);
        
        const suggestions = [];

        // 1. "all" suggestion
        if ('all'.includes(query)) {
          suggestions.push({
            id: 'all',
            isAll: true,
            username: 'all',
            fullName: 'all',
            subText: 'Mention all members in this chat'
          });
        }



        // 3. Member suggestions
        const matchedMembers = groupMembers.filter((m) =>
          m.user.username.toLowerCase().includes(query) ||
          m.user.fullName.toLowerCase().includes(query)
        );
        
        matchedMembers.forEach((m) => {
          suggestions.push({
            id: m.userId,
            isMember: true,
            username: m.user.username,
            fullName: m.user.fullName,
            profilePictureUrl: m.user.profilePictureUrl,
            member: m
          });
        });

        setFilteredMembers(suggestions);
        setSelectedMentionIdx(0);
      } else {
        setMentionQuery(null);
        setFilteredMembers([]);
      }
    }
  };

  const handleSelectMention = (item) => {
    if (mentionQuery === null) return;
    const lastAtIndex = text.lastIndexOf('@' + mentionQuery);
    if (lastAtIndex !== -1) {
      let replacement = `@${item.username} `;
      if (item.isAll) {
        // Expand to all active group members' usernames
        const usernames = groupMembers
          .map((m) => `@${m.user.username}`)
          .join(' ');
        replacement = usernames ? `${usernames} ` : `@all `;
      }
      const newText = text.slice(0, lastAtIndex) + replacement;
      setText(newText);
    }
    setMentionQuery(null);
    setFilteredMembers([]);
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIdx((prev) => (prev + 1) % filteredMembers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIdx((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSelectMention(filteredMembers[selectedMentionIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        setFilteredMembers([]);
      }
    }
  };

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const handleSendText = (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    // Decoupled emit target
    let contentToSend = text;

    // If it's a private chat, encrypt it before sending
    if (chatType === 'PRIVATE' && recipientPublicKey) {
      contentToSend = encryptMessage(text, recipientPublicKey, privateKey);
    }

    socket.emit('send_message', {
      chatId,
      encryptedContent: contentToSend,
      mediaType: 'TEXT',
    }, (res) => {
      if (res.status !== 'success') {
        alert(res.message || 'Failed to send message');
      }
    });

    setText('');
    setIsTyping(false);
    socket.emit('typing_stop', chatId);
  };

  const triggerFileSelect = (type) => {
    let accept = 'image/*,application/pdf,video/*';
    if (type === 'document') accept = 'application/pdf';
    else if (type === 'image') accept = 'image/*';
    else if (type === 'video') accept = 'video/*';
    
    setAcceptType(accept);
    setShowAttachMenu(false);
    
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  const handleCancelUpload = () => {
    if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview);
    setPendingFile(null);
    setPendingFilePreview(null);
    setPendingMediaType(null);
    setCaption('');
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadError('');

    // Validate file type and size constraints
    let mediaType = 'TEXT';
    let sizeLimit = 0;
    let limitLabel = '';

    if (file.type.startsWith('image/')) {
      mediaType = 'IMAGE';
      sizeLimit = MAX_IMAGE_SIZE;
      limitLabel = '1 MB';
    } else if (file.type === 'application/pdf') {
      mediaType = 'PDF';
      sizeLimit = MAX_PDF_SIZE;
      limitLabel = '2 MB';
    } else if (file.type.startsWith('video/')) {
      mediaType = 'VIDEO';
      sizeLimit = MAX_VIDEO_SIZE;
      limitLabel = '5 MB';
    } else {
      setUploadError('Unsupported file type. Please upload an image, PDF, or video.');
      return;
    }

    if (file.size > sizeLimit) {
      setUploadError(`File exceeds the limit of ${limitLabel} for ${mediaType.toLowerCase()}s.`);
      return;
    }

    setPendingFile(file);
    setPendingMediaType(mediaType);
    setPendingFilePreview(URL.createObjectURL(file));
    setCaption('');
  };

  const handleSendMedia = async () => {
    if (!pendingFile) return;

    setIsUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', pendingFile);

    try {
      const res = await apiClient.post('/messages/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fileUrl = res.data.data.fileUrl;

      // Determine text content (caption or fallback)
      let finalCaption = caption.trim();
      if (!finalCaption) {
        if (pendingMediaType === 'IMAGE') finalCaption = `Shared a photo`;
        else if (pendingMediaType === 'VIDEO') finalCaption = `Shared a video`;
        else if (pendingMediaType === 'PDF') finalCaption = `Shared a document`;
      }

      let contentToSend = finalCaption;
      if (chatType === 'PRIVATE' && recipientPublicKey) {
        contentToSend = encryptMessage(finalCaption, recipientPublicKey, privateKey);
      }

      socket.emit('send_message', {
        chatId,
        encryptedContent: contentToSend,
        mediaType: pendingMediaType,
        mediaUrl: fileUrl,
      }, (socketRes) => {
        if (socketRes.status !== 'success') {
          alert(socketRes.message || 'Failed to send media message');
        }
      });

      handleCancelUpload();
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Failed to upload media file.');
    } finally {
      setIsUploading(false);
    }
  };

  // Poll creation management
  const handleAddPollOption = () => {
    if (pollOptions.length < 10) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const handleRemovePollOption = (idx) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== idx));
    }
  };

  const handlePollOptionChange = (idx, val) => {
    const updated = [...pollOptions];
    updated[idx] = val;
    
    // Automatically append a new blank option if the user types in the last option
    if (idx === updated.length - 1 && val.trim() !== '' && updated.length < 10) {
      updated.push('');
    }
    setPollOptions(updated);
  };

  const handleCreatePollSubmit = (e) => {
    e.preventDefault();
    if (!pollQuestion.trim()) {
      alert('Question is required');
      return;
    }
    const cleanOpts = pollOptions.filter((opt) => opt.trim() !== '');
    if (cleanOpts.length < 2) {
      alert('Provide at least 2 options');
      return;
    }

    // Send Poll via WebSocket
    socket.emit('send_message', {
      chatId,
      encryptedContent: `Poll: ${pollQuestion}`,
      mediaType: 'POLL',
      poll: {
        encryptedQuestion: pollQuestion,
        options: cleanOpts.map((text) => ({ encryptedText: text })),
      },
    }, (res) => {
      if (res.status !== 'success') {
        alert(res.message || 'Failed to send poll');
      }
    });

    // Reset poll modal state
    setPollQuestion('');
    setPollOptions(['', '']);
    setIsPollOpen(false);
  };

  const blockedBySelf = activeChat?.blockedBySelf || false;
  const blockedByRecipient = activeChat?.blockedByRecipient || false;

  if (chatType === 'PRIVATE' && (blockedBySelf || blockedByRecipient)) {
    return (
      <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col items-center justify-center min-h-[64px]">
        {blockedBySelf ? (
          <div className="flex items-center gap-3.5 bg-slate-950/60 border border-slate-800 px-4 py-2.5 rounded-xl w-full max-w-md justify-between animate-fade-in">
            <span className="text-xs font-semibold text-slate-400">
              You have blocked this user. Unblock them to send messages.
            </span>
            <button
              onClick={async () => {
                try {
                  await unblockUser(activeChat.recipient.id);
                } catch (err) {
                  alert(err.message || 'Failed to unblock user');
                }
              }}
              className="text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white px-3.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              Unblock
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center bg-slate-950/40 border border-slate-850 px-4 py-2.5 rounded-xl w-full max-w-md animate-fade-in">
            <span className="text-xs font-semibold text-slate-500 italic">
              You cannot send messages to this user.
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 bg-slate-900/40 border-t border-slate-800/80 flex flex-col gap-2 relative backdrop-blur-md">
      {/* Mentions autocomplete dropdown */}
      {mentionQuery !== null && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-14 w-80 mb-3 bg-slate-900/90 border border-white/5 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50 animate-fade-in max-h-60 overflow-y-auto backdrop-blur-xl hover:border-white/10 transition-all duration-300">
          {filteredMembers.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => handleSelectMention(item)}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors select-none text-left border-b border-slate-800/40 last:border-b-0",
                idx === selectedMentionIdx
                  ? "bg-brand-600/20 border-l-2 border-brand-500 text-slate-100"
                  : "hover:bg-slate-800/60 text-slate-300"
              )}
            >
              {item.isAll ? (
                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center text-slate-300 flex-shrink-0">
                  <Users className="h-4 w-4" />
                </div>

              ) : (
                <img
                  src={item.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${item.fullName}`}
                  alt={item.fullName}
                  className="w-7 h-7 rounded-full object-cover border border-slate-800 flex-shrink-0"
                />
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold truncate leading-tight text-slate-200">
                  {item.fullName}
                </span>
                <span className="text-[10px] text-slate-500 truncate leading-none mt-0.5">
                  {item.isAll ? item.subText : `@${item.username}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File upload errors banner */}
      {uploadError && (
        <div className="absolute bottom-full left-3 right-3 mb-2 p-2.5 bg-slate-950/95 border border-red-900/40 rounded-xl text-xs font-semibold text-red-400 flex items-center justify-between shadow-2xl backdrop-blur-md z-40 animate-fade-in">
          <span className="flex items-center gap-1.5">⚠️ {uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError('')}
            className="p-1 hover:bg-red-950/50 hover:text-red-300 rounded-lg transition-colors text-red-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={handleSendText} className="flex items-center gap-2">
        {/* File Attach clip with Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            disabled={isUploading || isRestricted}
            className={cn(
              "p-2.5 bg-slate-905/40 hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-slate-200 transition-colors border border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed",
              showAttachMenu && "bg-slate-800 text-slate-100 border-slate-700"
            )}
            title="Attach File (Images/PDFs/Videos)"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          
          {showAttachMenu && (
            <div className="absolute bottom-14 left-0 w-48 bg-slate-950/95 border border-slate-850 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 z-50 animate-fade-in backdrop-blur-xl">
              <button
                type="button"
                onClick={() => triggerFileSelect('document')}
                className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-900 rounded-xl text-xs font-semibold text-slate-300 hover:text-slate-100 text-left transition-colors"
              >
                <span className="p-1.5 bg-indigo-950/40 border border-indigo-900/40 text-indigo-400 rounded-lg text-xs leading-none">📄</span>
                Document (PDF)
              </button>
              <button
                type="button"
                onClick={() => triggerFileSelect('image')}
                className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-900 rounded-xl text-xs font-semibold text-slate-300 hover:text-slate-100 text-left transition-colors"
              >
                <span className="p-1.5 bg-sky-950/40 border border-sky-900/40 text-sky-400 rounded-lg text-xs leading-none">🖼️</span>
                Photo (Images)
              </button>
              <button
                type="button"
                onClick={() => triggerFileSelect('video')}
                className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-900 rounded-xl text-xs font-semibold text-slate-300 hover:text-slate-100 text-left transition-colors"
              >
                <span className="p-1.5 bg-pink-950/40 border border-pink-900/40 text-pink-400 rounded-lg text-xs leading-none">🎥</span>
                Video (Videos)
              </button>
            </div>
          )}
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept={acceptType}
        />

        {/* Poll Build button */}
        <button
          type="button"
          onClick={() => setIsPollOpen(true)}
          disabled={isUploading || isRestricted}
          className="p-2.5 bg-slate-905/40 hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-slate-200 transition-colors border border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Create Opinion Poll"
        >
          <BarChart2 className="h-5 w-5" />
        </button>

        {/* Text Input area */}
        <input
          type="text"
          placeholder={isRestricted ? "Only administrators can send messages" : (isUploading ? "Uploading encrypted attachment..." : "Type message securely...")}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={isUploading || isRestricted}
          className="flex-1 px-4.5 py-3 bg-slate-950/45 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all disabled:opacity-50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={!text.trim() || isUploading || isRestricted}
          className="p-3 bg-gradient-to-tr from-brand-600 to-blue-500 hover:from-brand-500 hover:to-blue-400 active:scale-95 text-white rounded-xl shadow-[0_4px_16px_rgba(37,99,235,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Poll Creation Modal */}
      <Modal isOpen={isPollOpen} onClose={() => setIsPollOpen(false)} title="Create Poll" size="md">
        <form onSubmit={handleCreatePollSubmit} className="flex flex-col gap-4">
          <Input
            label="Poll Question*"
            placeholder="What should we discuss?"
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
          />

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Options (Min 2, Max 10)
            </label>
            <div className="flex flex-col gap-2 max-h-[30vh] overflow-y-auto pr-1">
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder={`Option ${idx + 1}`}
                    value={opt}
                    onChange={(e) => handlePollOptionChange(idx, e.target.value)}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePollOption(idx)}
                      className="p-2.5 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-colors border border-slate-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {pollOptions.length < 10 && (
              <button
                type="button"
                onClick={handleAddPollOption}
                className="mt-1 self-start inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-350 font-semibold"
              >
                <Plus className="h-3.5 w-3.5" /> Add Option
              </button>
            )}
          </div>

          <Button type="submit" className="w-full mt-2">
            Create Poll
          </Button>
        </form>
      </Modal>

      {/* Media Caption Preview Modal */}
      <Modal
        isOpen={!!pendingFile}
        onClose={handleCancelUpload}
        title="Preview Media"
        size="md"
      >
        <div className="flex flex-col gap-4 text-center">
          <div className="flex items-center justify-center min-h-[220px] max-h-[50vh] bg-slate-950/40 border border-slate-900 rounded-2xl overflow-hidden p-4">
            {pendingMediaType === 'IMAGE' && (
              <img
                src={pendingFilePreview}
                alt="Preview"
                className="max-h-[40vh] max-w-full object-contain rounded-lg shadow-md"
              />
            )}
            {pendingMediaType === 'VIDEO' && (
              <video
                src={pendingFilePreview}
                controls
                className="max-h-[40vh] max-w-full object-contain rounded-lg shadow-md"
              />
            )}
            {pendingMediaType === 'PDF' && pendingFile && (
              <div className="flex flex-col items-center gap-3">
                <div className="p-5 bg-red-950/20 border border-red-900/35 rounded-2xl text-red-500 shadow-inner">
                  <FileText className="h-12 w-12" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-200 truncate max-w-xs px-2">
                    {pendingFile.name}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {(pendingFile.size / (1024 * 1024)).toFixed(2)} MB • PDF Document
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Add a Caption
            </label>
            <input
              type="text"
              placeholder="Type message..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-850 rounded-xl text-slate-100 placeholder:text-slate-500 text-sm focus:outline-none focus:border-brand-500 transition-colors"
              autoFocus
            />
          </div>

          <div className="flex gap-2.5 mt-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelUpload}
              disabled={isUploading}
              className="flex-1 text-slate-350 hover:text-white hover:bg-slate-800 border-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSendMedia}
              disabled={isUploading}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
