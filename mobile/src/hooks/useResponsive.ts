import { useWindowDimensions } from 'react-native';

/**
 * Small-phone / phone / tablet breakpoints, plus a column count derived from
 * a minimum comfortable tile width — used instead of hardcoded "2 per row"
 * grids so KPI tiles and quick actions gain columns on a tablet or a phone
 * held in landscape, rather than stretching two tiles across the full width.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isSmallPhone = width < 360;
  const isTablet = width >= 700;
  const isLandscape = width > height;

  /** How many `minTileWidth`-wide tiles fit per row, clamped to [min, max]. */
  function columnsFor(minTileWidth: number, opts: { min?: number; max?: number } = {}): number {
    const { min = 2, max = 6 } = opts;
    const raw = Math.floor(width / minTileWidth);
    return Math.min(max, Math.max(min, raw));
  }

  return { width, height, isSmallPhone, isTablet, isLandscape, columnsFor };
}
