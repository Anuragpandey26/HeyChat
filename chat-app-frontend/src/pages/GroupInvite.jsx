import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/store/useAuthStore.js';
import { useChatStore } from '../features/chats/store/useChatStore.js';
import { ShieldCheck, Users, LogIn, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import apiClient from '../shared/lib/apiClient.js';
import { Button } from '../shared/components/ui/Button.jsx';
import { cn } from '../shared/utils/cn.js';

export default function GroupInvite() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  
  const { isAuthenticated, initializeAuth } = useAuthStore();
  const { selectChat, fetchChats, chats } = useChatStore();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);

  // Initialize Auth state first to ensure we know if they are logged in
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Fetch group preview details
  const fetchPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get(`/chats/group-preview/${chatId}`);
      setGroup(res.data?.data?.group || null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load group details. Invalid link.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (chatId) {
      fetchPreview();
    }
  }, [chatId]);

  // Check if they are already in the group (once group details are loaded)
  const isAlreadyMember = group && chats.some(c => c.chatId === chatId);

  // Auto-join logic if redirected back from Login
  useEffect(() => {
    const checkAutoJoin = async () => {
      if (isAuthenticated && group && sessionStorage.getItem('pendingJoinGroup') === chatId) {
        sessionStorage.removeItem('pendingJoinGroup');
        try {
          setJoining(true);
          await apiClient.post(`/chats/group/${chatId}/join`);
          await fetchChats();
          selectChat(chatId);
          navigate('/');
        } catch (err) {
          console.error('Auto-join failed:', err);
          // Don't show critical error block, just let them try manually
          alert(err.response?.data?.message || 'Auto-join failed. Please try clicking Join Group.');
          setJoining(false);
        }
      }
    };
    checkAutoJoin();
  }, [isAuthenticated, group, chatId, fetchChats, selectChat, navigate]);

  const handleJoin = async () => {
    if (!isAuthenticated) {
      // Set pending state and redirect to login
      sessionStorage.setItem('pendingJoinGroup', chatId);
      navigate(`/login?redirect=/join/${chatId}`);
      return;
    }

    try {
      setJoining(true);
      await apiClient.post(`/chats/group/${chatId}/join`);
      await fetchChats();
      selectChat(chatId);
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to join group.');
    } finally {
      setJoining(false);
    }
  };

  const handleOpenChat = () => {
    selectChat(chatId);
    navigate('/');
  };

  // Rendering Loading View
  if (loading) {
    return (
      <div className="min-h-screen bg-[#030014] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        <div className="glass-panel w-full max-w-md rounded-[28px] p-8 flex flex-col items-center justify-center text-center relative z-10 min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500 mb-4"></div>
          <p className="text-slate-400 text-sm font-semibold">Fetching invite details...</p>
        </div>
      </div>
    );
  }

  // Rendering Error View
  if (error || !group) {
    return (
      <div className="min-h-screen bg-[#030014] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        <div className="glass-panel w-full max-w-md rounded-[28px] p-8 flex flex-col items-center justify-center text-center relative z-10 border border-red-500/10 shadow-2xl">
          <div className="p-3 bg-red-950/20 border border-red-900/40 text-red-500 rounded-2xl mb-4">
            <AlertCircle className="h-8 w-8 filter drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
          </div>
          <h3 className="text-lg font-black text-slate-100 tracking-tight">Invite Link Invalid</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed max-w-xs font-medium">
            {error || 'This group invite link is invalid, expired, or the group has been deleted.'}
          </p>
          <Button onClick={() => navigate('/')} className="w-full mt-6 py-3 font-bold bg-slate-800 hover:bg-slate-750 text-slate-200">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Rendering Normal Group Invite Preview
  return (
    <div className="min-h-screen bg-[#030014] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Decorative Gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '12s' }} />

      <div className="w-full max-w-md glass-panel rounded-[28px] p-8 shadow-2xl relative z-10 transition-all duration-500 hover:border-white/10 flex flex-col">
        {/* Brand header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src="/logo.png" alt="logo" className="h-5 w-5 object-contain rounded-md" />
          <span className="text-sm font-bold tracking-tight text-slate-300 font-sans">
            heyChat Group Invite
          </span>
        </div>

        {/* Group Info Section */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative group/avatar mb-4 select-none">
            {group.groupPhotoUrl ? (
              <img
                src={group.groupPhotoUrl}
                alt={group.groupName}
                className="w-24 h-24 rounded-full object-cover border-2 border-white/15 shadow-xl hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-slate-800 to-slate-850 border-2 border-slate-700/60 flex items-center justify-center text-slate-300 hover:scale-105 transition-transform duration-200 shadow-inner">
                <Users className="h-10 w-10 text-slate-450" />
              </div>
            )}
          </div>
          <h2 className="text-xl font-black bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 bg-clip-text text-transparent tracking-tight">
            {group.groupName}
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">
            Group Invite Link
          </p>
          {group.description && (
            <p className="text-xs text-slate-400 mt-2.5 px-4 max-w-xs italic line-clamp-3">
              "{group.description}"
            </p>
          )}
        </div>

        {/* Members Directory Preview */}
        <div className="border-t border-slate-800 pt-4 flex-1 flex flex-col text-left mb-6 min-h-[140px] max-h-[220px]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Group Directory ({group.participantsCount})</span>
          </div>
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 max-h-[180px]">
            {group.members && group.members.map((member) => (
              <div key={member.userId} className="flex items-center gap-3 p-1.5 hover:bg-slate-900/40 rounded-xl transition-colors">
                <img
                  src={member.user.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${member.user.fullName}`}
                  alt={member.user.fullName}
                  className="w-7 h-7 rounded-full object-cover border border-slate-800"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-200 truncate leading-tight flex items-center gap-1.5">
                    {member.user.fullName}
                    {member.role === 'ADMIN' && (
                      <span className="text-[8px] bg-brand-500/10 text-brand-400 border border-brand-500/20 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Admin</span>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate leading-none mt-0.5">@{member.user.username}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions section */}
        <div className="flex flex-col gap-2.5 mt-auto">
          {isAlreadyMember ? (
            <Button
              onClick={handleOpenChat}
              className="w-full py-3.5 bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold shadow-[0_4px_16px_rgba(16,185,129,0.25)] rounded-xl"
            >
              <Check className="h-4 w-4 mr-2" /> You're in! Go to Group Chat
            </Button>
          ) : (
            <Button
              onClick={handleJoin}
              isLoading={joining}
              className="w-full py-3.5 bg-gradient-to-tr from-brand-600 to-blue-500 hover:from-brand-500 hover:to-blue-400 text-white font-extrabold shadow-[0_4px_16px_rgba(37,99,235,0.25)] rounded-xl flex items-center justify-center gap-2"
            >
              {!isAuthenticated ? (
                <>
                  <LogIn className="h-4 w-4" /> Log In to Join Group
                </>
              ) : (
                'Join Group'
              )}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => navigate('/')}
            disabled={joining}
            className="w-full text-slate-350 hover:text-white hover:bg-slate-800 border-slate-800 font-bold"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
