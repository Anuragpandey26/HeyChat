import React from 'react';
import { cn } from '../../utils/cn.js';

export const Button = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  type = 'button',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none';
  
  const variants = {
    primary: 'bg-gradient-to-tr from-brand-600 to-blue-500 hover:from-brand-500 hover:to-blue-400 text-white shadow-[0_4px_16px_rgba(37,99,235,0.25)] hover:shadow-[0_4px_20px_rgba(37,99,235,0.4)] border-none',
    secondary: 'bg-slate-850/80 hover:bg-slate-800 text-slate-200 border border-slate-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]',
    danger: 'bg-gradient-to-tr from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-450 text-white shadow-[0_4px_16px_rgba(239,68,68,0.25)] hover:shadow-[0_4px_20px_rgba(239,68,68,0.4)] border-none',
    outline: 'bg-transparent hover:bg-white/5 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-750',
    ghost: 'bg-transparent hover:bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-4.5 py-2.5 text-sm',
    lg: 'px-5.5 py-3 text-base rounded-2xl',
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Loading...
        </>
      ) : (
        children
      )}
    </button>
  );
};
