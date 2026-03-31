import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableHighlight } from 'react-native';
import { motion } from 'motion/react';
import { Search, Home, Film, Tv, Settings, User, Radio, LogOut, Heart } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'search', label: 'Busca', icon: Search },
  { id: 'home', label: 'Início', icon: Home },
  { id: 'mylist', label: 'Minha Lista', icon: Heart },
  { id: 'live', label: 'Canais ao Vivo', icon: Radio },
  { id: 'movie', label: 'Filmes', icon: Film },
  { id: 'series', label: 'Séries', icon: Tv },
  { id: 'settings', label: 'Ajustes', icon: Settings },
];

interface SideMenuProps {
  onSelect?: (id: string) => void;
  activeId?: string;
  onLogout?: () => void;
}

export const SideMenu: React.FC<SideMenuProps> = ({ onSelect, activeId = 'home', onLogout }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);

  const handleFocus = (id: string) => {
    setIsExpanded(true);
    setFocusedItem(id);
  };

  const handlePress = (id: string) => {
    if (onSelect) {
      onSelect(id);
    }
  };

  const handleBlur = () => {
    // We delay the collapse slightly to see if focus moves to another menu item
    setTimeout(() => {
      const activeElement = document.activeElement;
      if (!activeElement?.closest('.side-menu-container')) {
        setIsExpanded(false);
        setFocusedItem(null);
      }
    }, 50);
  };

  return (
    <div
      className={cn(
        "side-menu-container fixed left-0 top-0 bottom-0 z-[1000] backdrop-blur-xl bg-black/40 border-r border-white/5 flex flex-col py-8 shadow-2xl transition-all duration-500 ease-in-out",
        isExpanded ? "w-[280px]" : "w-[80px]"
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Logo Section */}
      <div className="px-6 mb-6 h-10 flex items-center shrink-0">
        <Text className="text-red-600 font-display font-black text-2xl tracking-tighter italic">
          {isExpanded ? 'XANDEFLIX' : 'X'}
        </Text>
      </div>

      {/* User Profile Section */}
      <div className="px-4 mb-4 shrink-0">
        <button
          onFocus={() => handleFocus('profile')}
          onBlur={handleBlur}
          onClick={() => handlePress('profile')}
          className={cn(
            "w-full flex flex-row items-center p-2 rounded-xl transition-all duration-300 outline-none border-none bg-transparent text-left",
            focusedItem === 'profile' && "bg-white/10 ring-1 ring-white/20"
          )}
        >
          <div className="flex flex-row items-center">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-800 rounded-lg flex items-center justify-center shadow-lg shrink-0">
              <User color="white" size={20} />
            </div>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="ml-4 inline-block font-display font-bold text-white text-lg tracking-tight whitespace-nowrap"
              >
                Timbo
              </motion.div>
            )}
          </div>
        </button>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-hide py-2">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const isFocused = focusedItem === item.id;
          const isActive = activeId === item.id;

          return (
            <button
              key={item.id}
              onFocus={() => handleFocus(item.id)}
              onBlur={handleBlur}
              onClick={() => handlePress(item.id)}
              className={cn(
                "w-full flex flex-row items-center p-3 rounded-xl transition-all duration-300 cursor-pointer group outline-none border-none bg-transparent text-left",
                (isFocused || isActive) ? "bg-white/10" : "hover:bg-white/5"
              )}
            >
              <div className="flex flex-row items-center">
                <div className="w-6 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110">
                  <Icon 
                    size={22} 
                    color={(isFocused || isActive) ? "#E50914" : "rgba(255,255,255,0.6)"} 
                    strokeWidth={(isFocused || isActive) ? 2.5 : 1.5}
                  />
                </div>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "ml-4 inline-block font-display tracking-tight transition-colors duration-300 whitespace-nowrap",
                      (isFocused || isActive) ? "text-white font-bold text-lg" : "text-gray-400 group-hover:text-white"
                    )}
                  >
                    {item.label}
                  </motion.div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-4 border-t border-white/5 space-y-2 shrink-0">
        <button
          onFocus={() => handleFocus('logout')}
          onBlur={handleBlur}
          onClick={() => onLogout?.()}
          className={cn(
            "w-full flex flex-row items-center p-3 rounded-xl transition-all duration-300 cursor-pointer group outline-none border-none bg-transparent text-left",
            focusedItem === 'logout' ? "bg-red-600/20" : "hover:bg-red-600/10"
          )}
        >
          <div className="flex flex-row items-center">
            <div className="w-6 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110">
              <LogOut 
                size={22} 
                color={focusedItem === 'logout' ? "#E50914" : "rgba(255,255,255,0.6)"} 
              />
            </div>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "ml-4 inline-block font-display tracking-tight transition-colors duration-300 whitespace-nowrap",
                  focusedItem === 'logout' ? "text-red-500 font-bold text-lg" : "text-gray-400 group-hover:text-red-500"
                )}
              >
                Sair
              </motion.div>
            )}
          </div>
        </button>

        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4"
          >
            <Text className="text-[10px] text-gray-500 uppercase tracking-widest font-display font-black opacity-50">
              Xandeflix Premium v1.2
            </Text>
          </motion.div>
        )}
      </div>
    </div>
  );
};
