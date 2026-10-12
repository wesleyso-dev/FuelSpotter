// components/Countdown.tsx
import React from 'react';
import { Text, type TextProps } from 'react-native';
import { useNow } from '../hooks/useNow';

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Self-ticking, so only this tiny component re-renders every second. */
export function Countdown({ until, ...rest }: { until: string | number } & TextProps) {
  const now = useNow(1000);
  const target = typeof until === 'number' ? until : Date.parse(until);
  return <Text {...rest}>{format(target - now)}</Text>;
}