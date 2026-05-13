import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scrollPaddingBottom } from '../constants/tabBar';

/** Bottom padding for scroll/list content so it clears the floating tab bar on all devices. */
export function useScrollBottomForTabBar(): number {
  const insets = useSafeAreaInsets();
  return scrollPaddingBottom(insets.bottom);
}
