import React, { useState } from 'react';
import { useAuthStore } from '../../auth/store/useAuthStore.js';
import { useChatStore } from '../../chats/store/useChatStore.js';
import { useMessageStore } from '../store/useMessageStore.js';
import { formatMessageTime } from '../../../shared/utils/format.js';
import socket from '../../../app/socket.js';
import { Trash2, Heart, Smile, Check, CheckCheck, FileText, Play, Copy } from 'lucide-react';
import { cn } from '../../../shared/utils/cn.js';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Button } from '../../../shared/components/ui/Button.jsx';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const ChatBubble = ({ message, chatType, isGroupAdmin = false }) => {
  const { user: currentUser } = useAuthStore();
  const { activeChatId } = useChatStore();
  const { deleteMessageForMe } = useMessageStore();
  
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isViewVotesOpen, setIsViewVotesOpen] = useState(false);

  const handleCopy = () => {
    const content = message.decryptedContent || message.encryptedContent;
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isSelf = message.senderId === currentUser.id || message.sender?.id === currentUser.id;
  const isGroup = chatType === 'GROUP';
  const isSystemMessage = message.encryptedContent?.startsWith('[SYSTEM]:');

  const contentText = message.decryptedContent || message.encryptedContent || '';
  const isMentioned = !isSelf && (() => {
    if (contentText.includes('@all')) return true;
    if (!currentUser?.username) return false;
    
    // Match any word starting with @
    const mentionRegex = /@([a-zA-Z0-9_.-]+)/g;
    let match;
    const dbUsername = currentUser.username.toLowerCase();
    const dbFullName = (currentUser.fullName || '').toLowerCase().trim();
    const firstName = dbFullName.split(' ')[0];

    while ((match = mentionRegex.exec(contentText)) !== null) {
      const mention = match[1].toLowerCase();
      if (mention === 'all') continue;
      if (dbUsername === mention || 
          firstName === mention || 
          dbUsername.startsWith(mention) ||
          dbFullName.includes(mention)) {
        return true;
      }
    }
    return false;
  })();

  if (isSystemMessage) {
    const systemText = message.encryptedContent.replace(/^\[SYSTEM\]:/, '');
    return (
      <div className="flex justify-center w-full my-2 px-4 select-none">
        <span className="bg-slate-800/40 border border-slate-700/30 text-slate-400 px-3.5 py-1.5 rounded-full text-xs font-semibold max-w-[85%] text-center shadow-sm backdrop-blur-sm">
          {systemText}
        </span>
      </div>
    );
  }

  const renderMessageTextWithLinks = (text) => {
    if (!text) return '';
    const regex = /(https?:\/\/[^\s]+|www\.[^\s]+|@[a-zA-Z0-9_.-]+)/gi;
    const parts = text.split(regex);
    return parts.map((part, index) => {
      if (/^(https?:\/\/|www\.)[^\s]+$/i.test(part)) {
        let href = part;
        let cleanText = part;
        const trailingPunctuationMatch = part.match(/([.,!?;:]+)$/);
        let trailingPunctuation = '';
        if (trailingPunctuationMatch) {
          trailingPunctuation = trailingPunctuationMatch[1];
          href = part.slice(0, -trailingPunctuation.length);
          cleanText = part.slice(0, -trailingPunctuation.length);
        }
        
        const finalHref = href.toLowerCase().startsWith('http') ? href : `https://${href}`;
        return (
          <React.Fragment key={index}>
            <a
              href={finalHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "underline break-all font-medium transition-colors hover:underline",
                isSelf
                  ? "text-sky-200 hover:text-sky-100"
                  : "text-brand-400 hover:text-brand-300"
              )}
            >
              {cleanText}
            </a>
            {trailingPunctuation}
          </React.Fragment>
        );
      } else if (/^(@[a-zA-Z0-9_.-]+)$/i.test(part)) {
        return (
          <span
            key={index}
            className={cn(
              "font-bold select-all rounded px-1 py-0.5 mx-0.5",
              isSelf
                ? "text-sky-100 bg-white/20"
                : "text-brand-300 bg-brand-500/20"
            )}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const renderMessageContent = () => {
    if (message.isDeletedEveryone) {
      return "This message was deleted";
    }

    const content = message.decryptedContent || message.encryptedContent || '';
    const statusReplyMatch = content.match(/^\[Replied to Status (Text|Photo): "([^"]*)"\]\s*([\s\S]*)$/i);

    if (statusReplyMatch) {
      const isPhoto = statusReplyMatch[1].toLowerCase() === 'photo';
      const statusText = statusReplyMatch[2];
      const actualReply = statusReplyMatch[3];

      return (
        <div className="flex flex-col gap-1.5 min-w-[180px]">
          {/* Status quote header box */}
          <div className={cn(
            "border-l-4 rounded-r-lg p-2.5 text-left text-xs bg-slate-950/45 select-none",
            isSelf ? "border-sky-300 bg-sky-950/15" : "border-brand-500 bg-slate-900/60"
          )}>
            <div className="flex items-center gap-1 font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
              {isPhoto ? '📷 Status Photo' : '💬 Status Update'}
            </div>
            <div className="italic text-slate-350 truncate max-w-xs font-normal text-[11px]">
              {statusText || (isPhoto ? 'Photo' : 'Text Status')}
            </div>
          </div>
          {/* Reply Text */}
          <div className="px-0.5">
            {renderMessageTextWithLinks(actualReply)}
          </div>
        </div>
      );
    }

    return renderMessageTextWithLinks(content);
  };

  // Check delete window (30 mins) - group admins can delete any message at any time
  const isWithinDeleteWindow =
    !message.isDeletedEveryone &&
    ((isSelf && new Date() - new Date(message.sentAt) <= 30 * 60 * 1000) ||
     (isGroup && isGroupAdmin));

  // Resolve receipt status (SENT, DELIVERED, SEEN)
  let receiptStatus = 'SENT';
  if (isSelf && message.receipts && message.receipts.length > 0) {
    // Check if anyone has seen it, or if it is delivered, etc.
    const statuses = message.receipts.map((r) => r.status);
    if (statuses.includes('SEEN')) {
      receiptStatus = 'SEEN';
    } else if (statuses.includes('DELIVERED')) {
      receiptStatus = 'DELIVERED';
    }
  }

  const handleReactionSelect = (emoji) => {
    socket.emit('send_reaction', {
      messageId: message.id,
      emoji: emoji, // empty string removes it
    });
    setShowReactionPicker(false);
  };

  const handleDelete = () => {
    socket.emit('delete_message', message.id, (res) => {
      if (res.status !== 'success') {
        alert(res.message || 'Failed to delete message');
      }
    });
  };

  const handleVote = (optionId) => {
    socket.emit('cast_vote', { optionId }, (res) => {
      if (res.status !== 'success') {
        alert(res.message || 'Failed to register vote');
      }
    });
  };

  return (
    <>
      <div
        className={cn(
          "flex flex-col mb-3.5 max-w-[70%] group relative",
          isSelf ? "ml-auto items-end" : "mr-auto items-start"
        )}
      >
        {/* Sender name for groups */}
        {!isSelf && isGroup && message.sender && (
        <span className="text-[10px] font-bold text-slate-400 mb-1 ml-2 select-none">
          {message.sender.fullName}
        </span>
      )}

      {/* Main bubble */}
      <div
        className={cn(
          "px-4 py-2.5 rounded-2xl relative shadow-md transition-all duration-200",
          isSelf
            ? "bg-gradient-to-br from-brand-500 to-indigo-600 text-white rounded-tr-none border border-brand-400/10 shadow-[0_4px_16px_rgba(37,99,235,0.18)]"
            : cn(
                "rounded-tl-none border",
                isMentioned
                  ? "bg-amber-950/15 text-amber-100 border-amber-500/30 shadow-[0_0_16px_rgba(245,158,11,0.12)] backdrop-blur-md"
                  : "bg-slate-900/35 text-slate-100 border-white/5 backdrop-blur-md hover:border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
              )
        )}
      >
        {/* Render file attachments */}
        {message.mediaUrl && !message.isDeletedEveryone && (
          <div className="mb-2 max-w-sm rounded-xl overflow-hidden bg-slate-950 border border-slate-900">
            {message.mediaType === 'IMAGE' && (
              <img
                src={message.mediaUrl}
                alt="attachment"
                className="max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(message.mediaUrl, '_blank')}
              />
            )}
            {message.mediaType === 'VIDEO' && (
              <video
                src={message.mediaUrl}
                controls
                className="max-h-60 w-full object-cover"
              />
            )}
            {message.mediaType === 'PDF' && (
              <a
                href={message.mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-3.5 hover:bg-slate-900 transition-colors"
              >
                <div className="p-2.5 bg-red-950/20 border border-red-900/35 rounded-xl">
                  <FileText className="h-5 w-5 text-red-500" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-xs font-semibold text-slate-250 truncate pr-1">Document Attachment</p>
                  <p className="text-[10px] text-slate-500">PDF File</p>
                </div>
              </a>
            )}
          </div>
        )}

        {/* Render Poll option block */}
        {message.mediaType === 'POLL' && message.poll && (
          <div className="flex flex-col gap-3 py-1.5 px-0.5 max-w-sm my-1 select-none text-left w-[280px] sm:w-[320px]">
            {/* Poll Question */}
            <h4 className="text-sm font-extrabold text-slate-100 flex items-start gap-2 leading-tight">
              <span>{message.poll.encryptedQuestion || 'Opinion Poll'}</span>
            </h4>
            
            {/* Poll Subtitle */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 -mt-1.5 font-semibold uppercase tracking-wider">
              <svg className="w-3.5 h-3.5 text-emerald-400 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <span>Select one or more</span>
            </div>

            {/* Poll Options List */}
            <div className="flex flex-col gap-2.5 mt-1">
              {message.poll.options?.map((opt) => {
                const votes = opt.votes || [];
                const hasVoted = votes.some((v) => v.userId === currentUser.id);
                
                // Calculate percentage relative to total votes
                const totalVotes = message.poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
                const percent = totalVotes > 0 ? ((votes.length / totalVotes) * 100) : 0;

                return (
                  <div
                    key={opt.id}
                    onClick={() => handleVote(opt.id)}
                    className={cn(
                      "group/opt relative flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer select-none transition-all overflow-hidden",
                      hasVoted
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_2px_8px_rgba(16,185,129,0.1)]'
                        : 'border-slate-850/80 hover:border-slate-750 bg-slate-950/30 text-slate-300 hover:bg-slate-950/50'
                    )}
                  >
                    {/* Progress Fill Layer (z-0) */}
                    <div
                      className={cn(
                        "absolute top-0 left-0 h-full transition-all duration-500 ease-out z-0",
                        hasVoted ? "bg-emerald-500/15" : "bg-slate-750/10"
                      )}
                      style={{ width: `${percent}%` }}
                    />

                    {/* Checkbox circle (z-10) */}
                    <div className="flex-shrink-0 z-10">
                      {hasVoted ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 border border-emerald-500 flex items-center justify-center text-white shadow-sm">
                          <svg className="w-3.5 h-3.5 fill-current stroke-current" viewBox="0 0 24 24" strokeWidth="3">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-500 hover:border-slate-400" />
                      )}
                    </div>

                    {/* Option Text & Vote Details (z-10) */}
                    <div className="flex-1 flex justify-between items-center text-xs font-semibold z-10 min-w-0">
                      <span className="truncate pr-2">{opt.encryptedText}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Voter Avatars overlay (up to 3) */}
                        {votes.length > 0 && (
                          <div className="flex items-center -space-x-1.5 overflow-hidden">
                            {votes.slice(0, 3).map((v) => {
                              const user = v.user;
                              if (!user) return null;
                              return (
                                <img
                                  key={v.userId}
                                  src={user.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user.fullName}`}
                                  alt={user.fullName}
                                  className="w-4 h-4 rounded-full border border-slate-900 object-cover"
                                  title={user.fullName}
                                />
                              );
                            })}
                          </div>
                        )}
                        {/* Vote Count */}
                        <span className="text-slate-400 font-bold bg-slate-950/45 px-1.5 py-0.5 rounded text-[10px]">
                          {votes.length}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* View Votes Footer button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsViewVotesOpen(true);
              }}
              className="mt-1 text-center w-full py-2 text-xs font-bold text-slate-350 hover:text-white border-t border-slate-800/80 hover:bg-slate-800/20 transition-all select-none"
            >
              View votes
            </button>
          </div>
        )}

        {/* Message body */}
        {message.mediaType !== 'POLL' && (
          <div
            className={cn(
              "text-sm leading-relaxed text-left break-words",
              message.isDeletedEveryone && "italic text-slate-400 font-medium select-none"
            )}
          >
            {renderMessageContent()}
          </div>
        )}

        {/* Timestamp & Checks footer */}
        <div className="flex items-center justify-end gap-1.5 mt-1.5 -mr-1">
          <span
            className={cn(
              "text-[9px] font-medium",
              isSelf ? "text-slate-300" : "text-slate-400"
            )}
          >
            {formatMessageTime(message.sentAt)}
          </span>
          {isSelf && (
            <span className="flex items-center select-none">
              {receiptStatus === 'SEEN' ? (
                <CheckCheck className="h-3.5 w-3.5 text-blue-400" />
              ) : receiptStatus === 'DELIVERED' ? (
                <CheckCheck className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <Check className="h-3.5 w-3.5 text-slate-400" />
              )}
            </span>
          )}
        </div>

        {/* Render reactions on message bubble */}
        {message.reactions && message.reactions.length > 0 && (
          <div
            className={cn(
              "absolute -bottom-2 flex gap-0.5 bg-slate-900 border border-slate-800 rounded-full px-1.5 py-0.5 shadow-md",
              isSelf ? "right-2" : "left-2"
            )}
          >
            {message.reactions.map((r, idx) => (
              <span
                key={idx}
                className="text-xs"
                title={`Reaction by user ${r.userId}`}
              >
                {r.emoji}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Menu (Reactions Picker, Copy, & Delete trigger on Hover) */}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10 px-2",
          isSelf ? "left-0 -translate-x-full flex-row-reverse" : "right-0 translate-x-full"
        )}
      >
        {/* Reaction Picker Button */}
        {!message.isDeletedEveryone && (
          <div className="relative">
            <button
              onClick={() => setShowReactionPicker(!showReactionPicker)}
              className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors shadow-sm"
              title="Add Reaction"
            >
              <Smile className="h-3.5 w-3.5" />
            </button>

            {showReactionPicker && (
              <div
                className={cn(
                  "absolute bottom-8 bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex gap-1.5 shadow-xl animate-fade-in z-20",
                  isSelf ? "right-0" : "left-0"
                )}
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReactionSelect(emoji)}
                    className="hover:scale-125 transition-transform text-sm px-0.5"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  onClick={() => handleReactionSelect('')}
                  className="text-[10px] text-slate-400 hover:text-red-400 font-bold px-1"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {/* Copy Button (Only if NOT deleted) */}
        {!message.isDeletedEveryone && (
          <button
            onClick={handleCopy}
            className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-colors shadow-sm"
            title={copied ? "Copied!" : "Copy Text"}
          >
            <Copy className={cn("h-3.5 w-3.5", copied && "text-green-400")} />
          </button>
        )}

        {/* Delete Options Button */}
        <button
          onClick={() => setIsDeleteOpen(true)}
          className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-red-950/20 hover:border-red-900/35 rounded-lg text-slate-400 hover:text-red-400 transition-colors shadow-sm"
          title="Delete Message"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    {/* Delete Message Modal */}
    <Modal
      isOpen={isDeleteOpen}
      onClose={() => setIsDeleteOpen(false)}
      title="Delete Message"
      size="sm"
    >
      <div className="flex flex-col gap-4 text-center">
        <p className="text-xs text-slate-400 leading-relaxed">
          {message.isDeletedEveryone
            ? "This placeholder will be removed from your view only."
            : "Are you sure you want to delete this message?"}
        </p>

        <div className="flex flex-col gap-2 mt-2">
          <Button
            onClick={() => {
              deleteMessageForMe(message.id, currentUser.id);
              setIsDeleteOpen(false);
            }}
            variant="outline"
            className="w-full text-slate-350 hover:text-white hover:bg-slate-800 border-slate-800 flex items-center justify-center gap-2"
          >
            <Trash2 className="h-4 w-4 text-slate-450" />
            Delete for Me
          </Button>

          {isWithinDeleteWindow && (
            <Button
              onClick={() => {
                handleDelete();
                setIsDeleteOpen(false);
              }}
              variant="outline"
              className="w-full text-red-400 hover:text-white hover:bg-red-950/25 hover:border-red-900 border-slate-800 flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
              Delete for Everyone
            </Button>
          )}

          <Button
            onClick={() => setIsDeleteOpen(false)}
            className="w-full mt-2"
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>

    {/* View Votes Modal */}
    <Modal
      isOpen={isViewVotesOpen}
      onClose={() => setIsViewVotesOpen(false)}
      title="Poll Results"
      size="md"
    >
      <div className="flex flex-col gap-4 text-left max-h-[60vh] overflow-y-auto pr-1">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Question</h3>
          <p className="text-sm font-extrabold text-slate-100 mt-1 leading-snug">
            {message.poll?.encryptedQuestion || 'Opinion Poll'}
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {message.poll?.options?.map((opt) => {
            const votes = opt.votes || [];
            const totalVotes = message.poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
            const percent = totalVotes > 0 ? Math.round((votes.length / totalVotes) * 100) : 0;

            return (
              <div key={opt.id} className="flex flex-col gap-2">
                {/* Option summary */}
                <div className="flex justify-between items-center text-xs font-bold text-slate-350">
                  <span className="truncate pr-2">{opt.encryptedText}</span>
                  <span className="flex-shrink-0 text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full text-[10px]">
                    {votes.length} {votes.length === 1 ? 'vote' : 'votes'} ({percent}%)
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-slate-950/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                {/* Voters List */}
                <div className="flex flex-col gap-2 mt-1 pl-1">
                  {votes.length > 0 ? (
                    votes.map((v) => {
                      const user = v.user;
                      if (!user) return null;
                      return (
                        <div key={v.userId} className="flex items-center gap-3 py-1">
                          <img
                            src={user.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user.fullName}`}
                            alt={user.fullName}
                            className="w-7 h-7 rounded-full object-cover border border-slate-800"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-200 leading-tight">
                              {user.fullName}
                            </span>
                            <span className="text-[10px] text-slate-500 leading-none">
                              @{user.username}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-[10px] text-slate-500 italic pl-1">
                      No votes yet
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  </>
  );
};
