import React, { useState } from 'react';
import { LoginForm } from '../features/auth/components/LoginForm.jsx';
import { RegisterForm } from '../features/auth/components/RegisterForm.jsx';
import { SecurityQuestionRecovery } from '../features/auth/components/SecurityQuestionRecovery.jsx';
import { ShieldCheck } from 'lucide-react';

export default function Login() {
  const [view, setView] = useState('login'); // 'login' | 'register' | 'recover'

  return (
    <div className="min-h-screen bg-[#030014] flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Decorative Gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '12s' }} />

      {/* Main Card Container */}
      <div className="w-full max-w-md bg-slate-900/35 border border-white/5 rounded-[28px] shadow-2xl p-8 backdrop-blur-2xl relative z-10 transition-all duration-500 hover:border-white/10">
        
        {/* Logo and Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-1 bg-brand-600/5 border border-brand-500/10 rounded-2xl shadow-inner">
            <img src="/logo.png" alt="heyChat logo" className="h-10 w-10 object-contain rounded-xl" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-100 font-sans">
            hey<span className="bg-gradient-to-r from-brand-400 to-blue-500 bg-clip-text text-transparent">Chat</span>
          </span>
        </div>

        {/* Dynamic Form Mounting */}
        {view === 'login' && (
          <LoginForm
            onToggleForm={() => setView('register')}
            onToggleRecovery={() => setView('recover')}
          />
        )}
        {view === 'register' && (
          <RegisterForm onToggleForm={() => setView('login')} />
        )}
        {view === 'recover' && (
          <SecurityQuestionRecovery onCancel={() => setView('login')} />
        )}
      </div>
    </div>
  );
}
