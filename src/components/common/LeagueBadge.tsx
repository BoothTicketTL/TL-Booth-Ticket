import React, { useState, useEffect } from 'react';
import { LeagueType } from '../../types';
import { getLeagueLogo, subscribeToLeagueLogos } from '../../lib/leagueLogoService';

interface LeagueBadgeProps {
  league: LeagueType;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
}

const SIZE_CONFIGS = {
  sm: 'w-16 h-20',
  md: 'w-24 h-32',
  lg: 'w-32 h-40',
  xl: 'w-44 h-56',
  '2xl': 'w-56 h-70 sm:w-64 sm:h-80 md:w-72 md:h-88',
  '3xl': 'w-64 h-80 sm:w-76 sm:h-96 md:w-88 md:h-[26rem]'
};

export const LeagueBadge: React.FC<LeagueBadgeProps> = ({
  league,
  size = 'md',
  className = ''
}) => {
  const [logoUrl, setLogoUrl] = useState<string>(() => getLeagueLogo(league));
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setLogoUrl(getLeagueLogo(league));
    setImgError(false);
    const unsub = subscribeToLeagueLogos(() => {
      setLogoUrl(getLeagueLogo(league));
      setImgError(false);
    });
    return () => unsub();
  }, [league]);

  const sizeClass = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  const activeSrc = imgError ? DEFAULT_LEAGUE_SVG_DATA_URLS[league] : logoUrl;

  return (
    <div className={`inline-flex items-center justify-center shrink-0 drop-shadow-md select-none transition-transform hover:scale-105 ${sizeClass} ${className}`}>
      <img
        src={activeSrc}
        alt={`Official ${league} Logo`}
        className="w-full h-full object-contain"
        onError={() => setImgError(true)}
        loading="lazy"
      />
    </div>
  );
};
