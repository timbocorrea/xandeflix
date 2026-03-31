import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = 1180;

export const useResponsiveLayout = () => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isMobile = width < MOBILE_BREAKPOINT;
    const isTablet = width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT;
    const isCompact = isMobile || isTablet;

    const horizontalPadding = isMobile ? 16 : isTablet ? 24 : 60;
    const topHeaderPadding = isMobile ? 18 : isTablet ? 26 : 40;
    const sideRailWidth = isCompact ? 0 : 120;
    // 72px = 52px button area + 8px safe area padding + 12px extra clearance
    const bottomNavigationHeight = isCompact ? 72 : 0;

    return {
      width,
      height,
      isMobile,
      isTablet,
      isCompact,
      isDesktop: !isCompact,
      horizontalPadding,
      topHeaderPadding,
      sideRailWidth,
      bottomNavigationHeight,
    };
  }, [width, height]);
};
