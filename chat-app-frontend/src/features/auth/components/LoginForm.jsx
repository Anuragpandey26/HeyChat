import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.js';
import { Input } from '../../../shared/components/ui/Input.jsx';
import { Button } from '../../../shared/components/ui/Button.jsx';
import { LogIn } from 'lucide-react';

export const LoginForm = ({ onToggleForm, onToggleRecovery }) => {
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (!email || !password) {
      setLocalError('Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      // Error handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-1.5 text-center mb-5">
        <h2 className="text-2xl font-black bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 bg-clip-text text-transparent tracking-tight">Welcome Back</h2>
        <p className="text-slate-400 text-xs font-medium">Enter your credentials to log into your account</p>
      </div>

      {(localError || error) && (
        <div className="p-3 bg-red-950/25 border border-red-900/40 rounded-xl text-xs font-semibold text-red-400 shadow-sm animate-fade-in">
          ⚠️ {localError || error}
        </div>
      )}

      <Input
        label="Email Address"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={isSubmitting}
      />

      <div className="flex flex-col gap-1">
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
        />
        <div className="flex justify-end mt-1.5">
          <button
            type="button"
            onClick={onToggleRecovery}
            className="text-xs text-brand-400 hover:text-brand-350 hover:underline transition-colors font-bold"
          >
            Forgot Password?
          </button>
        </div>
      </div>

      <Button type="submit" isLoading={isSubmitting} className="w-full mt-2 py-3">
        <LogIn className="h-4 w-4 mr-2" /> Log In
      </Button>

      <div className="text-center text-xs text-slate-500 mt-2 font-medium">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onToggleForm}
          className="text-brand-400 hover:text-brand-350 font-bold hover:underline"
        >
          Create an Account
        </button>
      </div>
    </form>
  );
};
