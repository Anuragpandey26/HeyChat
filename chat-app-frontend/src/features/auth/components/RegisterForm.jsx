import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore.js';
import { Input } from '../../../shared/components/ui/Input.jsx';
import { Button } from '../../../shared/components/ui/Button.jsx';
import { UserPlus } from 'lucide-react';

const QUESTIONS = [
  'What was the name of your first pet?',
  'In what city were you born?',
  'What was the name of your elementary school?',
  'What is your mother’s maiden name?',
  'What was your first car?',
];

export const RegisterForm = ({ onToggleForm }) => {
  const register = useAuthStore((state) => state.register);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(QUESTIONS[0]);
  const [securityQuestionAnswer, setSecurityQuestionAnswer] = useState('');
  const [bio, setBio] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (!username || !email || !fullName || !password || !securityQuestionAnswer) {
      setLocalError('Please fill in all required fields.');
      return;
    }

    if (username.length < 3) {
      setLocalError('Username must be at least 3 characters long.');
      return;
    }

    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    if (securityQuestionAnswer.trim().length < 5) {
      setLocalError('Security answer must be at least 5 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        username,
        email,
        fullName,
        password,
        securityQuestion,
        securityQuestionAnswer,
        bio,
        phoneNumber,
      });
      setSuccess(true);
    } catch (err) {
      // Error handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col gap-4.5 text-center py-4 animate-fade-in">
        <h2 className="text-2xl font-black bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 bg-clip-text text-transparent tracking-tight">Registration Successful</h2>
        <p className="text-slate-400 text-xs font-medium leading-relaxed">
          Your secure account has been created successfully.
        </p>
        <div className="p-3.5 bg-emerald-950/25 border border-emerald-900/40 rounded-xl text-xs font-semibold text-emerald-450 my-2 shadow-sm leading-relaxed">
          You can now log in using your password to access your chats.
        </div>
        <Button onClick={onToggleForm} className="w-full py-3">
          Proceed to Login
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-1.5 text-center mb-3">
        <h2 className="text-2xl font-black bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 bg-clip-text text-transparent tracking-tight">Create Account</h2>
        <p className="text-slate-400 text-xs font-medium">Register to begin chatting securely</p>
      </div>

      {(localError || error) && (
        <div className="p-3 bg-red-950/25 border border-red-900/40 rounded-xl text-xs font-semibold text-red-400 shadow-sm animate-fade-in">
          ⚠️ {localError || error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Username (Unique)*"
          placeholder="johndoe"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isSubmitting}
        />
        <Input
          label="Full Name*"
          placeholder="John Doe"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Email Address*"
          type="email"
          placeholder="john@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
        />
        <Input
          label="Password*"
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-450 select-none uppercase tracking-wider">
          Security Question (For Recovery)*
        </label>
        <select
          value={securityQuestion}
          onChange={(e) => setSecurityQuestion(e.target.value)}
          disabled={isSubmitting}
          className="w-full px-4 py-3 bg-slate-950/50 backdrop-blur-sm border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] cursor-pointer"
        >
          {QUESTIONS.map((q, idx) => (
            <option key={idx} value={q} className="bg-slate-900 text-slate-100">
              {q}
            </option>
          ))}
        </select>
      </div>

      <Input
        label="Security Answer*"
        placeholder="Secret answer"
        value={securityQuestionAnswer}
        onChange={(e) => setSecurityQuestionAnswer(e.target.value)}
        disabled={isSubmitting}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Phone (Optional)"
          placeholder="+123456789"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          disabled={isSubmitting}
        />
        <Input
          label="Bio (Optional)"
          placeholder="Hey there!"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <Button type="submit" isLoading={isSubmitting} className="w-full mt-2 py-3">
        <UserPlus className="h-4 w-4 mr-2" /> Register Account
      </Button>

      <div className="text-center text-xs text-slate-500 font-medium">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onToggleForm}
          className="text-brand-400 hover:text-brand-350 font-bold hover:underline"
        >
          Log In
        </button>
      </div>
    </form>
  );
};
