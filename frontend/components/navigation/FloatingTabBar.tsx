import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { theme } from '../../theme';

function tabLabel(
  options: BottomTabBarProps['descriptors'][string]['options'],
  routeName: string
): string {
  const { tabBarLabel, title } = options;
  if (typeof tabBarLabel === 'string') return tabBarLabel;
  if (typeof title === 'string') return title;
  return routeName;
}

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(), [mode]);

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const color = isFocused ? theme.colors.primary : theme.colors.mutedText;
          const label = tabLabel(options, route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          const icon =
            options.tabBarIcon?.({
              focused: isFocused,
              color,
              size: 22,
            }) ?? null;

          const badge = options.tabBarBadge;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              android_ripple={null}
              style={styles.tab}
            >
              <View style={styles.iconWrap}>
                {icon}
                {badge !== undefined && badge !== null && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeTxt}>
                      {typeof badge === 'number' && badge > 9 ? '9+' : String(badge)}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    wrapper: {
      backgroundColor: 'transparent',
      paddingHorizontal: 12,
      paddingTop: 8,
      ...Platform.select({
        ios: {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.12,
          shadowRadius: 18,
        },
        android: { elevation: 18 },
        default: {},
      }),
    },
    pill: {
      flexDirection: 'row',
      backgroundColor: theme.colors.background,
      borderRadius: 28,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 6,
      paddingVertical: 6,
    },

    iconWrap: {
      width: 42,
      height: 30,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },

    label: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.2,
    },

    // Unread badge
    badge: {
      position: 'absolute',
      top: 2,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#EF4444',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      borderWidth: 1.5,
      borderColor: theme.colors.background,
    },
    badgeTxt: {
      fontSize: 9,
      fontWeight: '800',
      color: '#fff',
      lineHeight: 12,
    },
  });
}
