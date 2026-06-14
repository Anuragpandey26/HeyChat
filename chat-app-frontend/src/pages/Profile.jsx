import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../features/auth/store/useAuthStore.js';
import { useChatStore } from '../features/chats/store/useChatStore.js';
import { Input } from '../shared/components/ui/Input.jsx';
import { Textarea } from '../shared/components/ui/Textarea.jsx';
import { Button } from '../shared/components/ui/Button.jsx';
import { ArrowLeft, Camera, Check, FileText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../shared/lib/apiClient.js';

export default function Profile() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const { user: currentUser, updateProfile, updateAvatar, isLoading } = useAuthStore();
  const { chats } = useChatStore();

  const isSelf = !userId || userId === currentUser.id;

  const fileInputRef = useRef(null);

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bio, setBio] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  // States for viewing another user's profile
  const [targetUser, setTargetUser] = useState(null);
  const [gallery, setGallery] = useState({ images: [], videos: [], docs: [], links: [] });
  const [pageLoading, setPageLoading] = useState(false);

  // Sync self profile details
  useEffect(() => {
    if (isSelf && currentUser) {
      setTimeout(() => {
        setFullName(currentUser.fullName || '');
        setPhoneNumber(currentUser.phoneNumber || '');
        setBio(currentUser.bio || '');
      }, 0);
    }
  }, [isSelf, currentUser]);

  // Fetch other user profile and shared media
  useEffect(() => {
    if (isSelf) return;

    const fetchOtherProfile = async () => {
      setPageLoading(true);
      setError('');
      try {
        // A. Fetch profile info
        const profileRes = await apiClient.get(`/users/profile/${userId}`);
        setTargetUser(profileRes.data.data.profile);

        // B. Fetch shared media if chat exists
        const targetChat = chats.find(
          (c) => c.chatType === 'PRIVATE' && c.recipient?.id === userId
        );
        if (targetChat) {
          const mediaRes = await apiClient.get(`/messages/${targetChat.chatId}/media`);
          setGallery(mediaRes.data.data.gallery || { images: [], videos: [], docs: [], links: [] });
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch user profile.');
      } finally {
        setPageLoading(false);
      }
    };

    fetchOtherProfile();
  }, [userId, isSelf, chats]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }

    try {
      await updateProfile({ fullName, phoneNumber, bio });
      setSuccess('Profile updated successfully');
    } catch (err) {
      setError(err.message || 'Failed to update profile settings.');
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    setSuccess('');

    // Avatar checks matching backend size limits (100 KB max)
    if (!file.type.startsWith('image/')) {
      setError('Uploaded file must be an image');
      return;
    }

    if (file.size > 100 * 1024) {
      setError('Profile picture exceeds size limit of 100 KB. Please compress your image.');
      return;
    }

    setAvatarUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      await updateAvatar(formData);
      setSuccess('Avatar updated successfully');
    } catch (err) {
      setError(err.message || 'Failed to update profile picture.');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isSelf && pageLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-brand-500"></div>
      </div>
    );
  }

  const profileUser = isSelf ? currentUser : targetUser;

  const initials = profileUser?.fullName
    ? profileUser.fullName
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  const mediaCount = gallery.images.length + gallery.videos.length + gallery.docs.length;

  return (
    <div className="min-h-screen bg-[#030014] text-slate-100 flex items-center justify-center p-4 select-none relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '12s' }} />
      
      <div className="w-full max-w-md bg-slate-900/35 border border-white/5 rounded-[28px] shadow-2xl p-8 backdrop-blur-2xl relative z-10 transition-all duration-500 hover:border-white/10">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 border-b border-slate-800/80 pb-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 bg-slate-950/40 border border-slate-850 hover:bg-slate-800 hover:text-white rounded-xl transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            {isSelf ? 'Profile Settings' : 'User Profile'}
          </h2>
        </div>

        {/* Success/Error banners */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-950/25 border border-red-900/40 rounded-xl text-xs font-bold text-red-400 shadow-sm animate-fade-in">
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div className="mb-5 p-3.5 bg-emerald-950/25 border border-emerald-900/40 rounded-xl text-xs font-bold text-emerald-400 flex items-center gap-1.5 animate-fade-in shadow-sm">
            <Check className="h-4 w-4 text-emerald-500 filter drop-shadow-[0_0_4px_rgba(16,185,129,0.5)]" /> {success}
          </div>
        )} 

        {/* Self Profile View (Editable) */}
        {isSelf && (
          <>
            {/* Avatar Uploader UI */}
            <div className="flex flex-col items-center mb-6 relative">
              <div className="relative group">
                {profileUser?.profilePictureUrl ? (
                  <img
                    src={profileUser.profilePictureUrl}
                    alt="profile"
                    className="w-24 h-24 rounded-full object-cover border-2 border-slate-800 group-hover:opacity-75 transition-opacity"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-xl font-bold text-slate-355 group-hover:opacity-75 transition-opacity shadow-inner">
                    {initials}
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute bottom-0 right-0 p-2 bg-brand-600 hover:bg-brand-700 text-white rounded-full border-2 border-slate-900 shadow-md transition-colors"
                  title="Upload Avatar"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                className="hidden"
                accept="image/*"
              />
              <p className="text-[10px] text-slate-500 mt-2 select-none">
                {avatarUploading ? 'Uploading image...' : 'Avatar max size limit: 100 KB'}
              </p>
            </div>

            {/* Form Details */}
            <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Username"
                  value={profileUser?.username || ''}
                  disabled
                  className="bg-slate-950/40 text-slate-500 border-slate-850 cursor-not-allowed"
                />
                <Input
                  label="Email Address"
                  value={profileUser?.email || ''}
                  disabled
                  className="bg-slate-950/40 text-slate-500 border-slate-850 cursor-not-allowed"
                />
              </div>

              <Input
                label="Full Name*"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isLoading || avatarUploading}
              />

              <Input
                label="Phone Number"
                placeholder="+123456789"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isLoading || avatarUploading}
              />

              <Textarea
                label="Bio (Max 139 characters)"
                placeholder="Tell us about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 139))}
                disabled={isLoading || avatarUploading}
                rows={3}
              />

              <Button type="submit" isLoading={isLoading || avatarUploading} className="w-full mt-2">
                Save Changes
              </Button>
            </form>
          </>
        )}

        {/* Other User Profile View (Read-only + Media Gallery) */}
        {!isSelf && profileUser && (
          <div className="flex flex-col gap-5">
            {/* Centered Big Avatar */}
            <div className="flex flex-col items-center">
              {profileUser.profilePictureUrl ? (
                <img
                  src={profileUser.profilePictureUrl}
                  alt="profile"
                  className="w-28 h-28 rounded-full object-cover border border-slate-800 shadow-md"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl font-bold text-slate-300 shadow-inner">
                  {initials}
                </div>
              )}
              <h3 className="text-lg font-bold text-slate-100 mt-3.5">{profileUser.fullName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">@{profileUser.username}</p>
            </div>

            <div className="flex flex-col gap-4.5 border-t border-slate-850/80 pt-4.5 text-left">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 select-none">
                  Phone Number
                </span>
                <p className="text-xs text-slate-200 bg-slate-950/50 px-4 py-3 rounded-2xl border border-slate-850/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
                  {profileUser.phoneNumber || <span className="italic text-slate-500">No phone number provided</span>}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 select-none">
                  About (Bio)
                </span>
                <p className="text-xs text-slate-200 bg-slate-950/50 px-4 py-3 rounded-2xl border border-slate-850/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] leading-relaxed italic">
                  "{profileUser.bio || "Hey there! I am using ChatApp."}"
                </p>
              </div>
            </div>

            {/* Shared Media Gallery section */}
            <div className="border-t border-slate-850 pt-5 text-left">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 select-none flex items-center justify-between">
                <span>📁 Media, links and docs</span>
                <span className="text-[10px] text-slate-500 font-extrabold px-1.5 py-0.5 bg-slate-950/60 border border-slate-850 rounded">
                  {mediaCount}
                </span>
              </h3>
              <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-800">
                {gallery.images.map((img) => (
                  <img
                    key={img.messageId}
                    src={img.url}
                    alt="shared media"
                    onClick={() => window.open(img.url, '_blank')}
                    className="w-20 h-20 object-cover rounded-xl border border-slate-800 cursor-pointer hover:opacity-85 transition-all duration-150 flex-shrink-0"
                  />
                ))}
                {gallery.videos.map((vid) => (
                  <div
                    key={vid.messageId}
                    onClick={() => window.open(vid.url, '_blank')}
                    className="w-20 h-20 bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer rounded-xl flex items-center justify-center relative flex-shrink-0 overflow-hidden"
                  >
                    <video src={vid.url} className="w-full h-full object-cover opacity-60" />
                    <span className="absolute text-slate-250 text-xs bg-slate-950/70 p-1.5 rounded-full border border-slate-800">▶️</span>
                  </div>
                ))}
                {gallery.docs.map((doc) => (
                  <div
                    key={doc.messageId}
                    onClick={() => window.open(doc.url, '_blank')}
                    className="w-20 h-20 bg-slate-950 border border-slate-800 hover:border-red-900/40 text-red-500 cursor-pointer rounded-xl flex flex-col items-center justify-center gap-1 p-2 flex-shrink-0 overflow-hidden"
                    title="PDF Document"
                  >
                    <FileText className="h-6 w-6 text-red-500" />
                    <span className="text-[9px] font-bold text-slate-400 truncate w-full text-center">PDF</span>
                  </div>
                ))}
              </div>
              {mediaCount === 0 && (
                <p className="text-[11px] text-slate-500 italic text-center py-2 select-none">
                  No media shared in this chat yet
                </p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
