import React, { useState, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore.js';
import { useAuthStore } from '../../auth/store/useAuthStore.js';
import { ChatListItem } from './ChatListItem.jsx';
import { CreateChatModal } from './CreateChatModal.jsx';
import { MessageSquarePlus, LogOut, Settings, Search, ShieldCheck, Bell, Trash2, ArrowLeft, Users, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../notifications/components/NotificationProvider.jsx';
import { cn } from '../../../shared/utils/cn.js';

const fuzzyMatch = (text, query) => {
  if (!query) return true;
  if (!text) return false;
  
  const cleanText = text.toLowerCase();
  const cleanQuery = query.toLowerCase();
  
  // 1. Direct substring check
  if (cleanText.includes(cleanQuery)) return true;
  
  // 2. Character subsequence check (e.g. "anr" matching "anurag")
  let queryIdx = 0;
  for (let charIdx = 0; charIdx < cleanText.length; charIdx++) {
    if (cleanText[charIdx] === cleanQuery[queryIdx]) {
      queryIdx++;
      if (queryIdx === cleanQuery.length) return true;
    }
  }
  
  // 3. Bigram overlap matching for typos (e.g. "anurg" matching "anurag")
  if (cleanQuery.length >= 3) {
    let matches = 0;
    for (let i = 0; i < cleanQuery.length - 1; i++) {
      const bigram = cleanQuery.slice(i, i + 2);
      if (cleanText.includes(bigram)) matches++;
    }
    if (matches / (cleanQuery.length - 1) >= 0.5) return true;
  }
  
  return false;
};

export const ChatList = () => {
  const navigate = useNavigate();
  const { chats, activeChatId, fetchChats, selectChat, allUsers, fetchAllUsers, createPrivateChat } = useChatStore();
  const { user: currentUser, logout } = useAuthStore();
  const { notifications, clearNotifications, removeNotification } = useNotifications();

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeView, setActiveView] = useState('chats'); // 'chats' | 'notifications' | 'users'

  useEffect(() => {
    fetchChats();
    // Poll for chat list updates every 15 seconds to ensure sync
    const interval = setInterval(fetchChats, 15000);
    return () => clearInterval(interval);
  }, [fetchChats]);

  // Load and poll all users when users directory view is active
  useEffect(() => {
    if (activeView === 'users') {
      fetchAllUsers();
      const interval = setInterval(fetchAllUsers, 10000);
      return () => clearInterval(interval);
    }
  }, [activeView, fetchAllUsers]);

  // Filter local chats list by search query using fuzzy match
  const filteredChats = chats.filter((c) => {
    if (c.chatType === 'GROUP') {
      return fuzzyMatch(c.groupDetails?.groupName, searchQuery) ||
             fuzzyMatch(c.groupDetails?.description, searchQuery);
    } else {
      return fuzzyMatch(c.recipient?.fullName, searchQuery) ||
             fuzzyMatch(c.recipient?.username, searchQuery);
    }
  });

  // Filter local users list by search query using fuzzy match
  const filteredUsers = allUsers.filter((u) => {
    return fuzzyMatch(u.fullName, searchQuery) ||
           fuzzyMatch(u.username, searchQuery);
  });

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to log out?')) {
      await logout();
      navigate('/login');
    }
  };

  return (
    <div className="w-80 h-full bg-slate-900/40 border-r border-slate-800/80 flex flex-col backdrop-blur-md">
      {/* Sidebar Header */}
      {activeView === 'users' ? (
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          <button
            onClick={() => {
              setActiveView('chats');
              setSearchQuery('');
            }}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center"
            title="Back to Chats"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-bold text-sm text-slate-100 tracking-tight">Users Directory</span>
          <button
            onClick={fetchAllUsers}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center"
            title="Refresh Status"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      ) : activeView === 'notifications' ? (
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          <button
            onClick={() => {
              setActiveView('chats');
              setSearchQuery('');
            }}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center"
            title="Back to Chats"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-bold text-sm text-slate-100 tracking-tight">Notifications</span>
          {notifications.length > 0 ? (
            <button
              onClick={clearNotifications}
              className="p-1.5 hover:bg-red-950/20 rounded-lg text-red-400 hover:text-red-350 transition-colors flex items-center justify-center animate-fade-in"
              title="Clear All Notifications"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <div className="w-8 h-8" />
          )}
        </div>
      ) : (
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="logo" className="h-5 w-5 object-contain rounded-md" />
            <span className="font-bold text-sm text-slate-100 tracking-tight">heyChat</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setActiveView('users');
                setSearchQuery('');
              }}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors relative"
              title="Users Directory"
            >
              <Users className="h-5 w-5" />
            </button>
            <button
              onClick={() => {
                setActiveView('notifications');
                setSearchQuery('');
              }}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors relative"
              title="Notification Center"
            >
              <Bell className="h-5 w-5" />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-slate-900" />
              )}
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              title="New Conversation"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Search Filter */}
      {activeView !== 'notifications' && (
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-500" />
            <input
              placeholder={activeView === 'users' ? "Search users by name..." : "Search active chats..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-100 text-xs placeholder:text-slate-500 focus:outline-none focus:border-brand-500/80 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Sidebar List viewport */}
      <div className="flex-1 overflow-y-auto">
        {activeView === 'notifications' ? (
          notifications.length === 0 ? (
            <div className="text-center py-16 px-4 select-none">
              <Bell className="h-7 w-7 text-slate-600 mx-auto mb-2 opacity-50" />
              <p className="text-xs text-slate-500">No new notifications</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    selectChat(item.chatId);
                    setActiveView('chats');
                  }}
                  className="p-3.5 border-b border-slate-800/40 hover:bg-slate-800/40 cursor-pointer transition-colors flex items-start gap-3.5 text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0 relative overflow-hidden">
                    {item.sender?.profilePictureUrl ? (
                      <img src={item.sender.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      item.title?.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="text-xs font-bold text-slate-200 truncate leading-none">{item.title}</span>
                      <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 leading-normal line-clamp-2">{item.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeView === 'users' ? (
          filteredUsers.length === 0 ? (
            <div className="text-center py-16 px-4 select-none">
              <Users className="h-7 w-7 text-slate-600 mx-auto mb-2 opacity-50" />
              <p className="text-xs text-slate-500">No users found</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  onClick={async () => {
                    try {
                      await createPrivateChat(u.id);
                      setActiveView('chats');
                      setSearchQuery('');
                    } catch (err) {
                      alert(err.message || 'Failed to start chat');
                    }
                  }}
                  className="p-3 border-b border-slate-800/40 hover:bg-slate-800/40 cursor-pointer transition-colors flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0 relative">
                      {u.profilePictureUrl ? (
                        <img src={u.profilePictureUrl} alt="" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        u.fullName?.slice(0, 2).toUpperCase()
                      )}
                      <span
                        className={cn(
                          "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900",
                          u.isOnline ? "bg-green-500 animate-pulse" : "bg-slate-500"
                        )}
                      />
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-xs font-semibold text-slate-200 truncate">{u.fullName}</h5>
                      <p className="text-[10px] text-slate-500 truncate">@{u.username}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <span
                      className={cn(
                        "text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                        u.isOnline 
                          ? "bg-green-950/40 border border-green-900/30 text-green-400" 
                          : "bg-slate-800 border border-slate-700/30 text-slate-400"
                      )}
                    >
                      {u.isOnline ? "Online" : "Offline"}
                    </span>
                    {!u.isOnline && u.lastSeen && (
                      <p className="text-[8px] text-slate-500 mt-1">
                        {new Date(u.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filteredChats.length === 0 ? (
          <div className="text-center py-12 px-4 select-none">
            <p className="text-xs text-slate-500">
              {searchQuery ? 'No matching conversations' : 'No active chats yet. Click the icon at the top to start one!'}
            </p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <ChatListItem
              key={chat.chatId}
              chat={chat}
              isActive={activeChatId === chat.chatId}
              onClick={() => selectChat(chat.chatId)}
            />
          ))
        )}
      </div>

      {/* User Footer profile bar */}
      <div className="p-3.5 border-t border-slate-800 flex items-center justify-between bg-slate-950/20">
        <div
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2.5 cursor-pointer max-w-[60%]"
        >
          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-750 flex-shrink-0 overflow-hidden relative group shadow-inner">
            {currentUser?.profilePictureUrl ? (
              <img src={currentUser.profilePictureUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            ) : (
              currentUser?.fullName?.[0].toUpperCase() || '?'
            )}
          </div>
          <div className="min-w-0">
            <h5 className="text-xs font-semibold text-slate-200 truncate">{currentUser?.fullName}</h5>
            <p className="text-[10px] text-slate-500 truncate">@{currentUser?.username}</p>
          </div>
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => navigate('/profile')}
            className="p-1.5 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 hover:bg-red-950/20 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <CreateChatModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};
