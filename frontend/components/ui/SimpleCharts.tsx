import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Line, Rect, Circle } from 'react-native-svg';

/**
 * SimpleCharts (no external chart lib)
 * - Uses react-native-svg (already installed) to render minimal charts.
 * - Keep UI clean: no heavy gridlines/labels.
 */

export function LineChart(props: {
  width: number;
  height: number;
  values: number[];
  stroke: string;
  fill?: string;
}) {
  const { width, height, values, stroke } = props;

  const d = useMemo(() => {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const max = Math.max(1, ...values);
    const stepX = values.length > 1 ? w / (values.length - 1) : 0;
    return values
      .map((v, i) => {
        const x = i * stepX;
        const y = h - (v / max) * h;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [width, height, values]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Path d={d} stroke={stroke} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

export function BarChart(props: {
  width: number;
  height: number;
  values: number[];
  colors: string[];
}) {
  const { width, height, values, colors } = props;
  const max = Math.max(1, ...values);
  const gap = 10;
  const barW = values.length > 0 ? (width - gap * (values.length - 1)) / values.length : width;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {/* baseline */}
        <Line x1={0} y1={height - 1} x2={width} y2={height - 1} stroke="rgba(15,23,42,0.08)" strokeWidth={2} />
        {values.map((v, i) => {
          const h = (v / max) * (height - 6);
          const x = i * (barW + gap);
          const y = height - h;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={10}
              fill={colors[i] || '#CBD5E1'}
            />
          );
        })}
      </Svg>
    </View>
  );
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(
    2
  )} ${end.y.toFixed(2)}`;
}

export function DonutChart(props: {
  size: number;
  thickness?: number;
  values: number[];
  colors: string[];
  trackColor?: string;
}) {
  const { size, thickness = 14, values, colors, trackColor = 'rgba(15,23,42,0.08)' } = props;
  const total = values.reduce((a, b) => a + Math.max(0, Number(b || 0)), 0);
  const r = Math.max(1, (size - thickness) / 2);
  const cx = size / 2;
  const cy = size / 2;

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let start = 0;
    return values.map((v, i) => {
      const p = clamp01(Math.max(0, Number(v || 0)) / total);
      const sweep = p * 360;
      const end = start + sweep;
      const path = arcPath(cx, cy, r, start, end);
      const item = { key: String(i), path, color: colors[i] || '#CBD5E1' };
      start = end;
      return item;
    });
  }, [values, colors, total, cx, cy, r]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={thickness} fill="none" />
        {arcs.map((a) => (
          <Path
            key={a.key}
            d={a.path}
            stroke={a.color}
            strokeWidth={thickness}
            fill="none"
            strokeLinecap="round"
          />
        ))}
      </Svg>
    </View>
  );
}

