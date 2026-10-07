import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { LeagueType } from '../../types';
import { getClubCrest, subscribeToClubCrests } from '../../lib/clubCrestService';

interface ClubCrestProps {
  clubName?: string;
  league?: LeagueType;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showTooltip?: boolean;
}

const SIZE_CONFIGS = {
  xs: {
    container: 'w-5 h-5 text-[9px]',
    img: 'w-5 h-5',
    fallback: 'w-5 h-5',
    icon: 'w-3 h-3'
  },
  sm: {
    container: 'w-7 h-7 text-[10px]',
    img: 'w-7 h-7',
    fallback: 'w-7 h-7',
    icon: 'w-3.5 h-3.5'
  },
  md: {
    container: 'w-10 h-10 text-xs',
    img: 'w-10 h-10',
    fallback: 'w-10 h-10',
    icon: 'w-4 h-4'
  },
  lg: {
    container: 'w-14 h-14 text-sm',
    img: 'w-14 h-14',
    fallback: 'w-14 h-14',
    icon: 'w-6 h-6'
  },
  xl: {
    container: 'w-20 h-20 sm:w-28 sm:h-28 text-base sm:text-xl',
    img: 'w-20 h-20 sm:w-28 sm:h-28',
    fallback: 'w-20 h-20 sm:w-28 sm:h-28',
    icon: 'w-10 h-10 sm:w-14 sm:h-14'
  },
  '2xl': {
    container: 'w-28 h-28 sm:w-36 sm:h-36 text-xl sm:text-2xl',
    img: 'w-28 h-28 sm:w-36 sm:h-36',
    fallback: 'w-28 h-28 sm:w-36 sm:h-36',
    icon: 'w-14 h-14 sm:w-18 sm:h-18'
  }
};

/**
 * Generate a consistent subtle gradient based on club name string
 */
function getClubColorHue(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [
    'from-blue-600 to-indigo-800 text-blue-100',
    'from-emerald-600 to-teal-800 text-emerald-100',
    'from-rose-600 to-red-800 text-rose-100',
    'from-amber-600 to-orange-800 text-amber-100',
    'from-purple-600 to-violet-800 text-purple-100',
    'from-sky-600 to-cyan-800 text-sky-100',
    'from-slate-700 to-slate-900 text-slate-100',
  ];
  return hues[Math.abs(hash) % hues.length];
}

/**
 * Get short 2-3 character initials for sports fallback crest
 */
function getClubInitials(name: string): string {
  if (!name) return 'FC';
  const clean = name
    .replace(/^(สโมสรฟุตบอล|สโมสร|ทีม)\s*/, '')
    .trim();
  
  const words = clean.split(/\s+/);
  if (words.length >= 2) {
    return (words[0].slice(0, 1) + words[1].slice(0, 1)).toUpperCase();
  }
  return clean.slice(0, 2);
}

export const ClubCrest: React.FC<ClubCrestProps> = ({
  clubName = '',
  league,
  size = 'md',
  className = '',
  showTooltip = false
}) => {
  const [crestUrl, setCrestUrl] = useState<string | null>(() => getClubCrest(clubName, league));
  const [triedFlatFallback, setTriedFlatFallback] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Subscribe to changes in crest database (e.g. when an admin uploads a new crest)
  useEffect(() => {
    setCrestUrl(getClubCrest(clubName, league));
    setTriedFlatFallback(false);
    setImgError(false);

    const unsub = subscribeToClubCrests(() => {
      setCrestUrl(getClubCrest(clubName, league));
      setTriedFlatFallback(false);
      setImgError(false);
    });
    return () => unsub();
  }, [clubName, league]);

  const handleImageError = () => {
    if (!crestUrl) {
      setImgError(true);
      return;
    }
    // If failed as .jpg in subfolder, try .png in that subfolder
    if (crestUrl.endsWith('.jpg') && crestUrl.includes('%E0%B8%AA%E0%B9%82%E0%B8%A1%E0%B8%A8%E0%B8%A3%E0%B9%84%E0%B8%97%E0%B8%A2%E0%B8%A5%E0%B8%B5%E0%B8%81')) {
      setCrestUrl(crestUrl.replace(/\.jpg$/, '.png'));
      return;
    }
    // If subfolder failed, try flat /crests/{clubName}.jpg
    if (!triedFlatFallback) {
      setTriedFlatFallback(true);
      setCrestUrl(`/crests/${encodeURIComponent(clubName.trim())}.jpg`);
      return;
    }
    // If flat .jpg failed, try flat .png
    if (crestUrl.endsWith('.jpg')) {
      setCrestUrl(`/crests/${encodeURIComponent(clubName.trim())}.png`);
      return;
    }
    setImgError(true);
  };

  const cfg = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  const initials = getClubInitials(clubName);
  const colorGradient = getClubColorHue(clubName);

  if (crestUrl && !imgError) {
    return (
      <div 
        className={`inline-flex items-center justify-center shrink-0 rounded-xl overflow-hidden bg-white/90 border border-slate-200/80 shadow-2xs transition-transform hover:scale-105 ${cfg.container} ${className}`}
        title={showTooltip ? clubName : undefined}
      >
        <img
          src={crestUrl}
          alt={clubName}
          className={`${cfg.img} object-contain p-0.5`}
          onError={handleImageError}
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback sports badge when no image is uploaded
  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 rounded-xl bg-gradient-to-br ${colorGradient} font-bold tracking-tight shadow-2xs border border-white/20 select-none ${cfg.fallback} ${className}`}
      title={showTooltip ? `${clubName} (ยังไม่มีตราสโมสร)` : undefined}
    >
      {initials.length <= 2 ? (
        <span>{initials}</span>
      ) : (
        <Shield className={cfg.icon} />
      )}
    </div>
  );
};
