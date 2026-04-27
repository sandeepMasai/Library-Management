import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  present: number;
  absent: number;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function AttendanceCard({ present, absent }: Props) {
  const total = Math.max(0, present + absent);
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  const size = 120;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const progress = useRef(new Animated.Value(0)).current;
  const dashOffset = useRef(new Animated.Value(c)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: pct,
      duration: 650,
      useNativeDriver: false,
    }).start();
  }, [pct, progress]);

  useEffect(() => {
    const sub = progress.addListener(({ value }) => {
      const clamped = Math.min(100, Math.max(0, value));
      dashOffset.setValue(c * (1 - clamped / 100));
    });
    return () => progress.removeListener(sub);
  }, [c, dashOffset, progress]);

  const styles = useMemo(() => makeStyles(), []);

  return (
    <LinearGradient
      colors={['#5B21B6', '#7C3AED', '#9333EA']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <Text style={styles.title}>Today Attendance</Text>
      </View>

      <View style={styles.center}>
        <View style={styles.ringWrap}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={stroke}
              fill="transparent"
              strokeLinecap="round"
            />
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="#FFFFFF"
              strokeWidth={stroke}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>

          <View style={styles.ringText}>
            <Text style={styles.pct}>{pct}%</Text>
            <Text style={styles.pctSub}>rate</Text>
          </View>
        </View>

        <Text style={styles.presentLine}>
          <Text style={styles.presentBig}>{present}</Text>
          <Text style={styles.presentSmall}> / {total} Present</Text>
        </Text>
      </View>

      <View style={styles.statsRow}>
        <Stat icon="checkmark-circle-outline" label="Present" value={String(present)} />
        <Stat icon="close-circle-outline" label="Absent" value={String(absent)} />
        <Stat icon="stats-chart-outline" label="Rate" value={`${pct}%`} />
      </View>
    </LinearGradient>
  );
}

function Stat(props: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={stylesStatic.stat}>
      <View style={stylesStatic.statIcon}>
        <Ionicons name={props.icon} size={16} color="#fff" />
      </View>
      <Text style={stylesStatic.statVal}>{props.value}</Text>
      <Text style={stylesStatic.statLbl}>{props.label}</Text>
    </View>
  );
}

const stylesStatic = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center' },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statVal: { marginTop: 8, fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: -0.2 },
  statLbl: { marginTop: 2, fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
});

function makeStyles() {
  return StyleSheet.create({
    card: {
      flex: 1,
      borderRadius: 20,
      padding: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 13, fontWeight: '900', color: 'rgba(255,255,255,0.88)', letterSpacing: 0.4 },
    center: { marginTop: 12, alignItems: 'center' },
    ringWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
    ringText: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    pct: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.6 },
    pctSub: { marginTop: -2, fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.70)' },
    presentLine: { marginTop: 10 },
    presentBig: { fontSize: 20, fontWeight: '900', color: '#fff' },
    presentSmall: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.80)' },
    statsRow: {
      marginTop: 14,
      flexDirection: 'row',
      gap: 10,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.20)',
    },
  });
}

