import { LeagueType } from '../types';

const LEAGUE_LOGOS_STORAGE_KEY = 'thaileague_custom_league_logos_v1';

// In-memory cache
const memoryLeagueLogos = new Map<LeagueType, string>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb();
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * Built-in official SVG badge templates matching the exact BYD Thai League emblems from the user's mockup:
 * - League 1: BYD SEALION 6 LEAGUE I (Red)
 * - League 2: BYD SEAL 5 LEAGUE II (Blue)
 * - League 3: BYD DOLPHIN LEAGUE III (Green)
 */
export const DEFAULT_LEAGUE_SVG_DATA_URLS: Record<LeagueType, string> = {
  'League 1': `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" width="240" height="320">
  <defs>
    <linearGradient id="l1-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="25%" stop-color="#991b1b" />
      <stop offset="70%" stop-color="#e11d48" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="l1-silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#e2e8f0" />
      <stop offset="100%" stop-color="#94a3b8" />
    </linearGradient>
    <filter id="l1-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  
  <!-- Outer Shield Outline -->
  <path d="M 120 10 Q 210 10 215 90 C 215 190 170 270 120 310 C 70 270 25 190 25 90 Q 30 10 120 10 Z" 
        fill="#09090b" stroke="url(#l1-silver)" stroke-width="4" filter="url(#l1-shadow)"/>
        
  <!-- Inner Shield Fill -->
  <path d="M 120 18 Q 200 18 205 92 C 205 185 163 260 120 298 C 77 260 35 185 35 92 Q 40 18 120 18 Z" 
        fill="url(#l1-bg)"/>

  <!-- Top Circular Emblem (Thai League Symbol) -->
  <circle cx="120" cy="72" r="32" fill="#09090b" stroke="#ffffff" stroke-width="2.5"/>
  <path d="M 112 52 C 128 52 136 62 130 76 C 126 84 116 88 112 88 C 104 88 98 82 102 72 C 106 62 116 56 126 56" 
        fill="none" stroke="#e11d48" stroke-width="5" stroke-linecap="round"/>
  <circle cx="126" cy="62" r="5" fill="#ffffff"/>

  <!-- BYD Brand Typography -->
  <text x="120" y="145" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="4">
    3YD
  </text>
  
  <!-- Car Model Name -->
  <text x="120" y="172" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    SEALION 6
  </text>
  
  <!-- League Badge Bar -->
  <rect x="52" y="188" width="136" height="34" rx="6" fill="#09090b" stroke="#ffffff" stroke-width="1.5"/>
  <text x="120" y="211" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    LEAGUE <tspan fill="#e11d48">I</tspan>
  </text>

  <!-- Bottom Title Partner (RÊVER) -->
  <text x="120" y="270" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="#cbd5e1" text-anchor="middle" letter-spacing="3">
    R Ê V E R
  </text>
</svg>
`)}`,

  'League 2': `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" width="240" height="320">
  <defs>
    <linearGradient id="l2-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#09090b" />
      <stop offset="25%" stop-color="#0369a1" />
      <stop offset="70%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="l2-silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#e2e8f0" />
      <stop offset="100%" stop-color="#94a3b8" />
    </linearGradient>
    <filter id="l2-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  
  <!-- Outer Shield Outline -->
  <path d="M 120 10 Q 210 10 215 90 C 215 190 170 270 120 310 C 70 270 25 190 25 90 Q 30 10 120 10 Z" 
        fill="#09090b" stroke="url(#l2-silver)" stroke-width="4" filter="url(#l2-shadow)"/>
        
  <!-- Inner Shield Fill -->
  <path d="M 120 18 Q 200 18 205 92 C 205 185 163 260 120 298 C 77 260 35 185 35 92 Q 40 18 120 18 Z" 
        fill="url(#l2-bg)"/>

  <!-- Top Circular Emblem (Thai League Symbol) -->
  <circle cx="120" cy="72" r="32" fill="#09090b" stroke="#ffffff" stroke-width="2.5"/>
  <path d="M 112 52 C 128 52 136 62 130 76 C 126 84 116 88 112 88 C 104 88 98 82 102 72 C 106 62 116 56 126 56" 
        fill="none" stroke="#38bdf8" stroke-width="5" stroke-linecap="round"/>
  <circle cx="126" cy="62" r="5" fill="#ffffff"/>

  <!-- BYD Brand Typography -->
  <text x="120" y="145" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="4">
    3YD
  </text>
  
  <!-- Car Model Name -->
  <text x="120" y="172" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    SEAL 5
  </text>
  
  <!-- League Badge Bar -->
  <rect x="52" y="188" width="136" height="34" rx="6" fill="#09090b" stroke="#ffffff" stroke-width="1.5"/>
  <text x="120" y="211" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    LEAGUE <tspan fill="#38bdf8">II</tspan>
  </text>

  <!-- Bottom Title Partner (RÊVER) -->
  <text x="120" y="270" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="#cbd5e1" text-anchor="middle" letter-spacing="3">
    R Ê V E R
  </text>
</svg>
`)}`,

  'League 3': `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" width="240" height="320">
  <defs>
    <linearGradient id="l3-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#09090b" />
      <stop offset="25%" stop-color="#047857" />
      <stop offset="70%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="l3-silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#e2e8f0" />
      <stop offset="100%" stop-color="#94a3b8" />
    </linearGradient>
    <filter id="l3-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>
  
  <!-- Outer Shield Outline -->
  <path d="M 120 10 Q 210 10 215 90 C 215 190 170 270 120 310 C 70 270 25 190 25 90 Q 30 10 120 10 Z" 
        fill="#09090b" stroke="url(#l3-silver)" stroke-width="4" filter="url(#l3-shadow)"/>
        
  <!-- Inner Shield Fill -->
  <path d="M 120 18 Q 200 18 205 92 C 205 185 163 260 120 298 C 77 260 35 185 35 92 Q 40 18 120 18 Z" 
        fill="url(#l3-bg)"/>

  <!-- Top Circular Emblem (Thai League Symbol) -->
  <circle cx="120" cy="72" r="32" fill="#09090b" stroke="#ffffff" stroke-width="2.5"/>
  <path d="M 112 52 C 128 52 136 62 130 76 C 126 84 116 88 112 88 C 104 88 98 82 102 72 C 106 62 116 56 126 56" 
        fill="none" stroke="#34d399" stroke-width="5" stroke-linecap="round"/>
  <circle cx="126" cy="62" r="5" fill="#ffffff"/>

  <!-- BYD Brand Typography -->
  <text x="120" y="145" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="4">
    3YD
  </text>
  
  <!-- Car Model Name -->
  <text x="120" y="172" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    DOLPHIN
  </text>
  
  <!-- League Badge Bar -->
  <rect x="52" y="188" width="136" height="34" rx="6" fill="#09090b" stroke="#ffffff" stroke-width="1.5"/>
  <text x="120" y="211" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    LEAGUE <tspan fill="#34d399">III</tspan>
  </text>

  <!-- Bottom Title Partner (RÊVER) -->
  <text x="120" y="270" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="#cbd5e1" text-anchor="middle" letter-spacing="3">
    R Ê V E R
  </text>
</svg>
`)}`
};

function initLeagueLogos() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LEAGUE_LOGOS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([league, url]) => {
          if (url && typeof url === 'string') {
            memoryLeagueLogos.set(league as LeagueType, url);
          }
        });
      }
    }
  } catch (e) {
    console.warn('Failed to load custom league logos from localStorage:', e);
  }
}

initLeagueLogos();

/**
 * Get active league logo (custom uploaded or default official SVG)
 */
export function getLeagueLogo(league: LeagueType): string {
  if (memoryLeagueLogos.has(league)) {
    return memoryLeagueLogos.get(league)!;
  }
  return DEFAULT_LEAGUE_SVG_DATA_URLS[league];
}

/**
 * Check if a custom logo has been uploaded for this league
 */
export function hasCustomLeagueLogo(league: LeagueType): boolean {
  return memoryLeagueLogos.has(league);
}

/**
 * Save custom logo for a league
 */
export async function saveLeagueLogo(league: LeagueType, dataUrl: string): Promise<void> {
  memoryLeagueLogos.set(league, dataUrl);
  notifyListeners();

  if (typeof localStorage !== 'undefined') {
    try {
      const obj: Record<string, string> = {};
      memoryLeagueLogos.forEach((val, key) => {
        obj[key] = val;
      });
      localStorage.setItem(LEAGUE_LOGOS_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to save league logo to localStorage:', e);
    }
  }
}

/**
 * Reset a league logo to official built-in default
 */
export async function resetLeagueLogo(league: LeagueType): Promise<void> {
  memoryLeagueLogos.delete(league);
  notifyListeners();

  if (typeof localStorage !== 'undefined') {
    try {
      const obj: Record<string, string> = {};
      memoryLeagueLogos.forEach((val, key) => {
        obj[key] = val;
      });
      localStorage.setItem(LEAGUE_LOGOS_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to reset league logo in localStorage:', e);
    }
  }
}

/**
 * Subscribe to league logo changes
 */
export function subscribeToLeagueLogos(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
