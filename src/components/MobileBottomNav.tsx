import React from 'react';
import { Search, Home, Film, Tv, Radio } from 'lucide-react';

interface MobileBottomNavProps {
  activeId?: string;
  onSelect?: (id: string) => void;
}

// 5 primary items that fit on one row with comfortable 44px+ touch targets
const ITEMS = [
  { id: 'home',   label: 'Início',   icon: Home },
  { id: 'live',   label: 'Ao Vivo',  icon: Radio },
  { id: 'movie',  label: 'Filmes',   icon: Film },
  { id: 'series', label: 'Séries',   icon: Tv },
  { id: 'search', label: 'Busca',    icon: Search },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeId = 'home',
  onSelect,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1200,
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        backgroundColor: 'rgba(5,5,5,0.95)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          padding: '6px 0 2px',
        }}
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelect?.(item.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                minHeight: 52,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '6px 4px',
                position: 'relative',
                color: isActive ? 'white' : 'rgba(255,255,255,0.45)',
                transition: 'color 0.2s',
                WebkitTapHighlightColor: 'transparent',
              }}
              title={item.label}
            >
              {/* Active indicator dot above icon */}
              <div
                style={{
                  position: 'absolute',
                  top: 3,
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: isActive ? '#E50914' : 'transparent',
                  transition: 'background-color 0.2s',
                }}
              />
              <Icon
                size={22}
                color={isActive ? '#E50914' : 'currentColor'}
                strokeWidth={isActive ? 2.4 : 1.8}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: isActive ? 900 : 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: 'Outfit, sans-serif',
                  lineHeight: 1,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
