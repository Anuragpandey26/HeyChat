import React, { useState, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore.js';
import { Modal } from '../../../shared/components/ui/Modal.jsx';
import { Input } from '../../../shared/components/ui/Input.jsx';
import { Textarea } from '../../../shared/components/ui/Textarea.jsx';
import { Button } from '../../../shared/components/ui/Button.jsx';
import { Search, Plus, Users, User, Check, X } from 'lucide-react';

export const CreateChatModal = ({ isOpen, onClose }) => {
  const { searchUsers, searchResults, createPrivateChat, createGroupChat, isLoading } = useChatStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('private'); // 'private' | 'group'

  // Group creation state
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]); // Array of user objects

  // Debounced search trigger
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery, searchUsers]);

  const handleCreatePrivate = async (userId) => {
    try {
      await createPrivateChat(userId);
      onClose();
      // Reset state
      setSearchQuery('');
    } catch (err) {
      alert(err.message || 'Failed to start chat');
    }
  };

  const handleToggleSelectUser = (user) => {
    const idx = selectedUsers.findIndex((u) => u.id === user.id);
    if (idx !== -1) {
      setSelectedUsers(selectedUsers.filter((u) => u.id !== user.id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      alert('Group name is required');
      return;
    }
    if (selectedUsers.length === 0) {
      alert('Select at least one participant');
      return;
    }

    try {
      const participantIds = selectedUsers.map((u) => u.id);
      await createGroupChat(groupName, participantIds, description);
      onClose();
      // Reset state
      setGroupName('');
      setDescription('');
      setSelectedUsers([]);
      setSearchQuery('');
    } catch (err) {
      alert(err.message || 'Failed to create group');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start Conversation" size="md">
      {/* Tab Selectors */}
      <div className="flex gap-2 mb-4 p-1 bg-slate-950 rounded-xl">
        <button
          onClick={() => setActiveTab('private')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'private' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <User className="h-4 w-4" /> Direct Message
        </button>
        <button
          onClick={() => setActiveTab('group')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'group' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="h-4 w-4" /> Group Chat
        </button>
      </div>

      {activeTab === 'private' ? (
        <div className="flex flex-col gap-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input
              placeholder="Search users by name or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {/* Search Results */}
          <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto pr-1">
            {isLoading && (
              <p className="text-center text-xs text-slate-500 py-4">Searching users...</p>
            )}

            {!isLoading && searchResults.length === 0 && searchQuery && (
              <p className="text-center text-xs text-slate-500 py-4">No users found</p>
            )}

            {!searchQuery && (
              <p className="text-center text-xs text-slate-500 py-4">Type a name above to search</p>
            )}

            {searchResults.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 bg-slate-950/40 border border-slate-850 hover:border-slate-800 hover:bg-slate-900/40 rounded-xl transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                    {user.fullName[0].toUpperCase()}
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-slate-200">{user.fullName}</h5>
                    <p className="text-xs text-slate-500">@{user.username}</p>
                  </div>
                </div>
                <Button onClick={() => handleCreatePrivate(user.id)} size="sm" variant="outline">
                  Message
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={handleCreateGroup} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3.5">
            <Input
              label="Group Name*"
              placeholder="e.g. Project Alpha Team"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <Textarea
              label="Description"
              placeholder="What is this group about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Selected participants tags */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Participants ({selectedUsers.length})
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950 rounded-xl border border-slate-900">
                {selectedUsers.map((user) => (
                  <span
                    key={user.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 text-slate-200 text-xs font-semibold rounded-lg"
                  >
                    {user.fullName}
                    <button
                      type="button"
                      onClick={() => handleToggleSelectUser(user)}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Search participants */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Add Participants
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                placeholder="Search by name or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            {/* Results with checkbox select toggles */}
            <div className="flex flex-col gap-1.5 max-h-[25vh] overflow-y-auto pr-1">
              {searchResults.map((user) => {
                const isSelected = selectedUsers.some((u) => u.id === user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => handleToggleSelectUser(user)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition-all ${
                      isSelected
                        ? 'border-brand-500 bg-brand-500/5'
                        : 'border-slate-850 bg-slate-950/40 hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                        {user.fullName[0].toUpperCase()}
                      </div>
                      <div>
                        <h5 className="text-sm font-semibold text-slate-200">{user.fullName}</h5>
                        <p className="text-xs text-slate-500">@{user.username}</p>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-brand-600 border-brand-650 text-white' : 'border-slate-700 bg-slate-900'
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 stroke-[3px]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Button type="submit" isLoading={isLoading} className="w-full mt-2">
            Create Group
          </Button>
        </form>
      )}
    </Modal>
  );
};
