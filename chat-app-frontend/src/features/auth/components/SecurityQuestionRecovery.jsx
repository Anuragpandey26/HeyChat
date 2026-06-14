import { useState } from 'react';
import apiClient from '../../../shared/lib/apiClient.js';
import { Input } from '../../../shared/components/ui/Input.jsx';
import { Button } from '../../../shared/components/ui/Button.jsx';
import { HelpCircle, Key, CheckCircle } from 'lucide-react';
import {
  wrapPrivateKey,
  unwrapPrivateKeyWithAnswer,
} from '../../../shared/lib/crypto.js';

export const SecurityQuestionRecovery = ({ onCancel }) => {
  const [email, setEmail] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  
  const [step, setStep] = useState(1); // 1 = Verify Answer, 2 = Reset Password, 3 = Success
  const [recoveryToken, setRecoveryToken] = useState('');
  const [recoveredPrivateKey, setRecoveredPrivateKey] = useState(null);
  const [hasEscrowKey, setHasEscrowKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !securityAnswer) {
      setError('Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post('/auth/recover/verify', {
        email,
        securityAnswer,
      });
      setRecoveryToken(res.data.data.recoveryToken);
      setUsername(res.data.data.username);

      // Try to recover the private key from escrow
      const escrowKey = res.data.data.securityEscrowKey;
      if (escrowKey) {
        try {
          const privateKey = unwrapPrivateKeyWithAnswer(escrowKey, securityAnswer);
          setRecoveredPrivateKey(privateKey);
          setHasEscrowKey(true);
        } catch (unwrapErr) {
          console.warn('Escrow key recovery failed (old user or corrupted):', unwrapErr);
          setRecoveredPrivateKey(null);
          setHasEscrowKey(false);
        }
      }

      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Incorrect recovery answer or email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const requestBody = {
        email,
        recoveryToken,
        newPassword,
      };

      if (recoveredPrivateKey) {
        // ✅ Key wrapping: Re-wrap the SAME private key with the new password
        // Public key stays the same → old messages remain readable!
        requestBody.wrappedPrivateKey = wrapPrivateKey(recoveredPrivateKey, username, newPassword);
        requestBody.securityEscrowKey = wrapPrivateKeyWithAnswer(recoveredPrivateKey, securityAnswer);
      }

      await apiClient.post('/auth/recover/reset', requestBody);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Password reset failed. Please request recovery again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 3) {
    return (
      <div className="flex flex-col gap-4.5 text-center py-4 animate-fade-in">
        <div className="flex justify-center mb-3">
          <CheckCircle className="h-12 w-12 text-emerald-500 filter drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
        </div>
        <h2 className="text-2xl font-black bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 bg-clip-text text-transparent tracking-tight">Password Reset Complete</h2>
        <p className="text-slate-400 text-xs font-medium leading-relaxed">
          Your account password has been updated.
        </p>
        {hasEscrowKey ? (
          <div className="p-3.5 bg-emerald-950/25 border border-emerald-900/40 rounded-xl text-xs text-emerald-400 font-semibold my-2 shadow-sm leading-relaxed">
            ✅ Your encryption keys have been preserved. All your previous messages will remain readable after logging in with your new password.
          </div>
        ) : (
          <div className="p-3.5 bg-amber-950/25 border border-amber-900/40 rounded-xl text-xs text-amber-400 font-semibold my-2 shadow-sm leading-relaxed">
            ⚠️ Your password has been reset, but your encryption keys could not be recovered. Messages sent before this reset may not be readable.
          </div>
        )}
        <Button onClick={onCancel} className="w-full py-3">
          Back to Login
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-col gap-1.5 text-center mb-3">
        <h2 className="text-2xl font-black bg-gradient-to-r from-slate-50 via-slate-100 to-slate-300 bg-clip-text text-transparent tracking-tight">Reset Password</h2>
        <p className="text-slate-400 text-xs font-medium">
          {step === 1 ? 'Verify your security question answer' : 'Choose your new account password'}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-950/25 border border-red-900/40 rounded-xl text-xs font-semibold text-red-400 shadow-sm animate-fade-in">
          ⚠️ {error}
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <Input
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
          />
          <Input
            label="Recovery Security Answer"
            placeholder="Enter the security answer you set during signup"
            value={securityAnswer}
            onChange={(e) => setSecurityAnswer(e.target.value)}
            disabled={isSubmitting}
          />
          <Button type="submit" isLoading={isSubmitting} className="w-full mt-2 py-3">
            <HelpCircle className="h-4 w-4 mr-2" /> Verify Security Answer
          </Button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="flex flex-col gap-4.5">
          <Input
            label="New Password"
            type="password"
            placeholder="At least 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={isSubmitting}
          />
          <Input
            label="Confirm New Password"
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isSubmitting}
          />
          <Button type="submit" isLoading={isSubmitting} className="w-full mt-2 py-3">
            <Key className="h-4 w-4 mr-2" /> Update Password
          </Button>
        </form>
      )}

      <div className="text-center text-xs text-slate-500 font-medium">
        Remembered your password?{' '}
        <button
          type="button"
          onClick={onCancel}
          className="text-brand-400 hover:text-brand-350 font-bold hover:underline"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
};

