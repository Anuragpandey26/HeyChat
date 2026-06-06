import React, { useState, useEffect } from 'react';
import { useStatusStore } from '../store/useStatusStore.js';
import { useAuthStore } from '../../auth/store/useAuthStore.js';
import { StatusUploadModal } from './StatusUploadModal.jsx';
import { StatusViewerModal } from './StatusViewerModal.jsx';
import { Plus } from 'lucide-react';
import { cn } from '../../../shared/utils/cn.js';

export const StatusTray = () => {
  const { selfStatuses, contactsStatuses, fetchStatuses } = useStatusStore();
  const { user: currentUser } = useAuthStore();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState(null);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 30000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  const hasSelfStatuses = selfStatuses.length > 0;

  // Build a feed object compatible with StatusViewerModal
  const selfFeed = {
    user: currentUser
      ? {
          id: currentUser.id,
          fullName: currentUser.fullName,
          username: currentUser.username,
          profilePictureUrl: currentUser.profilePictureUrl,
        }
      : null,
    statuses: selfStatuses,
  };

  const handleMyStatusClick = () => {
    if (hasSelfStatuses) {
      // View existing statuses first
      setSelectedFeed(selfFeed);
    } else {
      // No statuses yet — open upload directly
      setIsUploadOpen(true);
    }
  };

  const initials = currentUser?.fullName?.[0]?.toUpperCase() || '?';
  const avatarUrl = currentUser?.profilePictureUrl;

  return (
    <>
      <div className="px-4 py-3 bg-slate-900/40 border-b border-slate-800/80 flex items-center gap-4 select-none overflow-x-auto shrink-0 backdrop-blur-md">

        {/* ── My Status ── */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
          <div className="relative cursor-pointer group" onClick={handleMyStatusClick}>

            {/* Gradient ring when statuses exist */}
            <div
              className={cn(
                'w-12 h-12 rounded-full p-[2.5px] transition-all duration-200',
                hasSelfStatuses
                  ? 'bg-gradient-to-tr from-brand-500 via-purple-500 to-pink-500 shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                  : 'border-2 border-dashed border-slate-600 group-hover:border-slate-500'
              )}
            >
              <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden border border-slate-950">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="me" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-black text-slate-300">{initials}</span>
                )}
              </div>
            </div>

            {/* "+" badge — always shows to add a new status */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsUploadOpen(true);
              }}
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-brand-600 hover:bg-brand-500 rounded-full flex items-center justify-center text-white border-2 border-slate-900 shadow transition-colors"
              title="Post a status"
            >
              <Plus className="h-3 w-3 stroke-[3px]" />
            </button>
          </div>

          <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">
            {hasSelfStatuses ? `My Status (${selfStatuses.length})` : 'My Status'}
          </span>
        </div>

        {/* Vertical divider */}
        <div className="w-px h-10 bg-slate-800 flex-shrink-0" />

        {/* ── Contacts Statuses ── */}
        <div className="flex gap-4 overflow-x-auto pr-2 scrollbar-none">
          {contactsStatuses.length === 0 ? (
            <span className="text-[10px] font-semibold text-slate-500 my-auto py-2 italic whitespace-nowrap">
              No contact status updates
            </span>
          ) : (
            contactsStatuses.map((feed) => {
              const hasUnread = feed.statuses.some((s) => !s.viewed);

              return (
                <div
                  key={feed.user.id}
                  onClick={() => setSelectedFeed(feed)}
                  className="flex flex-col items-center gap-1.5 cursor-pointer flex-shrink-0 group"
                >
                  <div
                    className={cn(
                      'w-12 h-12 rounded-full p-[2.5px] transition-all duration-200 group-hover:scale-105',
                      hasUnread
                        ? 'bg-gradient-to-tr from-brand-500 via-purple-500 to-pink-500 shadow-[0_0_10px_rgba(99,102,241,0.35)]'
                        : 'bg-slate-705 border border-slate-700/50'
                    )}
                  >
                    <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden border border-slate-950">
                      {feed.user.profilePictureUrl ? (
                        <img
                          src={feed.user.profilePictureUrl}
                          alt={feed.user.fullName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-black text-slate-350">
                          {feed.user.fullName?.[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 truncate max-w-[56px] text-center">
                    {feed.user.fullName.split(' ')[0]}
                  </span>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* ── Modals ── */}
      <StatusUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
      />

      {selectedFeed && (
        <StatusViewerModal
          isOpen={!!selectedFeed}
          onClose={() => setSelectedFeed(null)}
          feed={selectedFeed}
        />
      )}
    </>
  );
}
