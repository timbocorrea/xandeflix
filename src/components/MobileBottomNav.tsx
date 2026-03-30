import React from 'react';
import { Search, Home, Film, Tv, Settings, Radio } from 'lucide-react';

interface MobileBottomNavProps {
  activeId?: string;
  onSelect?: (id: string) => void;
}

const ITEMS = [
  { id: 'search', label: 'Busca', icon: Search },
  { id: 'home', label: 'Inicio', icon: Home },
  { id: 'live', label: 'Ao Vivo', icon: Radio },
  { id: 'movie', label: 'Filmes', icon: Film },
  { id: 'series', label: 'Series', icon: Tv },
  { id: 'settings', label: 'Ajustes', icon: Settings },
];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeId = 'home',
  onSelect,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
        zIndex: 1200,
      }}
    >
      <div
        className="grid grid-cols-6 rounded-[28px] border border-white/10 bg-black/85 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        style={{ padding: '10px 8px' }}
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelect?.(item.id)}
              className={`flex min-h-[64px] flex-col items-center justify-center rounded-2xl px-1 text-center transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
              }`}
              title={item.label}
            >
              <Icon
                size={20}
                color={isActive ? '#E50914' : 'currentColor'}
                strokeWidth={isActive ? 2.4 : 1.8}
              />
              <span className="mt-1 text-[10px] font-black uppercase tracking-[0.14em]">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
