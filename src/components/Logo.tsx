import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  variant?: 'light' | 'dark';
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
  variant = 'dark',
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-2xl',
  };

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Option 1: Clean Side-by-Side "eC" Monogram with Overhead Symmetrical Scales */}
      <div
        className={`${iconSizes[size]} relative rounded-xl bg-slate-900 border border-slate-700/80 shadow-md flex items-center justify-center shrink-0 overflow-hidden`}
        aria-label="Lawyers eChamber Logo"
      >
        <svg
          viewBox="0 0 44 44"
          className="w-[90%] h-[90%]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* --- Symmetrical Scales of Justice at Top --- */}
          {/* Central Vertical Mast */}
          <line x1="22" y1="4" x2="22" y2="18" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="22" cy="4" r="1.3" fill="#FFFFFF" />

          {/* Top Horizontal Crossbeam */}
          <line x1="8" y1="8" x2="36" y2="8" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />

          {/* Left Scale Pan (Triangular balance hanging from beam) */}
          <path d="M11 8L7 15H15L11 8Z" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
          <path d="M7 15C7 16.5 8.8 17.5 11 17.5C13.2 17.5 15 16.5 15 15" stroke="#FFFFFF" strokeWidth="1.4" fill="none" />

          {/* Right Scale Pan (Triangular balance hanging from beam) */}
          <path d="M33 8L29 15H37L33 8Z" stroke="#FFFFFF" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
          <path d="M29 15C29 16.5 30.8 17.5 33 17.5C35.2 17.5 37 16.5 37 15" stroke="#FFFFFF" strokeWidth="1.4" fill="none" />

          {/* --- Lowercase 'e' (Royal Indigo #4F46E5) --- */}
          <path
            d="M9 29.5H21C21 24.5 17.5 21 14.5 21C10.5 21 8 24.5 8 29.5C8 34.5 11 38 15.5 38C18.5 38 20.2 36.5 21 35"
            stroke="#6366F1"
            strokeWidth="3.2"
            strokeLinecap="round"
          />

          {/* --- Uppercase 'C' (Crisp White #FFFFFF) --- */}
          <path
            d="M36 24C34 22 31.5 21 28 21C23 21 20 24.8 20 29.5C20 34.2 23 38 28 38C31.5 38 34 37 36 35"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className={`font-bold tracking-tight flex items-baseline gap-1 ${textSizes[size]}`}>
            <span
              className={variant === 'dark' ? 'text-white' : 'text-slate-900'}
              style={{ letterSpacing: '0.01em' }}
            >
              LAWYERS
            </span>
            <span className="font-semibold tracking-normal text-indigo-400">
              e<span className={variant === 'dark' ? 'text-white' : 'text-slate-800'}>Chamber</span>
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mt-0.5">
            Smart Practice Management
          </span>
        </div>
      )}
    </div>
  );
};
