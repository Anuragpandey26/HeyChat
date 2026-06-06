import React from 'react';
import { cn } from '../../utils/cn.js';

export const Textarea = React.forwardRef(({
  className,
  label,
  error,
  rows = 3,
  ...props
}, ref) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold text-slate-400 select-none uppercase tracking-wider">
          {label}
        </label>
      )}
      <textarea
        rows={rows}
        className={cn(
          "w-full px-4 py-3 bg-slate-950/50 backdrop-blur-sm border border-slate-800 rounded-xl text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed resize-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
          error ? "border-red-500/80 focus:ring-red-500/20 focus:border-red-500" : "hover:border-slate-700",
          className
        )}
        ref={ref}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-500 font-medium">
          {error}
        </span>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';
