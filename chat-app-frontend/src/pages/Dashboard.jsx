import React from 'react';
import { ChatList } from '../features/chats/components/ChatList.jsx';
import { ChatWindow } from '../features/messaging/components/ChatWindow.jsx';
import { StatusTray } from '../features/status/components/StatusTray.jsx';

export default function Dashboard() {
  return (
    <div className="h-screen w-screen bg-transparent flex overflow-hidden">
      {/* 1. Conversations Sidebar list */}
      <ChatList />

      {/* 2. Main Workstation Area */}
      <div className="flex-1 h-full flex flex-col overflow-hidden">
        {/* Status ring tray */}
        <StatusTray />

        {/* Messaging viewport */}
        <ChatWindow />
      </div>
    </div>
  );
}
