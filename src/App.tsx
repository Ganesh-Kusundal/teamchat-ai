import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ChatProvider } from './context/ChatContext.js';
import { ToastProvider } from './components/Toast.js';
import { Navbar } from './components/Navbar.js';
import { Sidebar } from './components/Sidebar.js';
import { ChatArea } from './components/ChatArea.js';
import { LoginPage } from './components/LoginPage.js';
import { TenantInspectorModal } from './components/TenantInspectorModal.js';
import { NewRoomModal } from './components/NewRoomModal.js';
import { SimulateMessageModal } from './components/SimulateMessageModal.js';
import { RoomMembersModal } from './components/RoomMembersModal.js';

function MainApp() {
  const { user, isLoading } = useAuth();
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isNewRoomOpen, setIsNewRoomOpen] = useState(false);
  const [isRoomMembersOpen, setIsRoomMembersOpen] = useState(false);
  const [simulateUser, setSimulateUser] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0F0F11] flex items-center justify-center text-zinc-400 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
          <span>Initializing TeamChat AI session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <ChatProvider>
      <div className="flex flex-col h-screen w-full bg-[#0F0F11] text-[#E4E4E7] overflow-hidden font-sans">
        {/* Top Navigation Bar */}
        <Navbar onOpenInspector={() => setIsInspectorOpen(true)} />

        {/* Workspace Body: Sidebar + Active Chat View */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <Sidebar
            onOpenNewRoom={() => setIsNewRoomOpen(true)}
            onSimulateMessage={(id, name) => setSimulateUser({ id, name })}
          />
          <ChatArea
            onOpenInspector={() => setIsInspectorOpen(true)}
            onOpenRoomMembers={() => setIsRoomMembersOpen(true)}
          />
        </div>

        {/* Modals & Evaluation Inspector Panels */}
        <TenantInspectorModal
          isOpen={isInspectorOpen}
          onClose={() => setIsInspectorOpen(false)}
        />
        <NewRoomModal
          isOpen={isNewRoomOpen}
          onClose={() => setIsNewRoomOpen(false)}
        />
        <RoomMembersModal
          isOpen={isRoomMembersOpen}
          onClose={() => setIsRoomMembersOpen(false)}
        />
        <SimulateMessageModal
          isOpen={Boolean(simulateUser)}
          targetUser={simulateUser}
          onClose={() => setSimulateUser(null)}
        />
      </div>
    </ChatProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <MainApp />
      </ToastProvider>
    </AuthProvider>
  );
}
