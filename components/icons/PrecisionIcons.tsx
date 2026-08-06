import React from 'react';
import Svg, { Path, Polyline, Rect, Circle } from 'react-native-svg';

export interface PrecisionIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: any;
}

const defaultProps = {
  size: 24,
  color: '#FFFFFF',
  strokeWidth: 2.5,
};

export const Sparkles = ({ size = defaultProps.size, color = defaultProps.color, strokeWidth = defaultProps.strokeWidth, style }: PrecisionIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" style={style}>
    {/* Sharp geometric nova */}
    <Path d="M12 1 L14.5 9.5 L23 12 L14.5 14.5 L12 23 L9.5 14.5 L1 12 L9.5 9.5 Z" />
    <Path d="M19 2 L20.5 5.5 L24 7 L20.5 8.5 L19 12 L17.5 8.5 L14 7 L17.5 5.5 Z" strokeWidth={Math.max(1, strokeWidth - 1)} />
  </Svg>
);

export const TrendingUp = ({ size = defaultProps.size, color = defaultProps.color, strokeWidth = defaultProps.strokeWidth, style }: PrecisionIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" style={style}>
    {/* Bold isometric trajectory with origin dot */}
    <Path d="M4 18 L10 12 L14 16 L22 4" />
    <Path d="M14 4 L22 4 L22 12" />
    <Circle cx="4" cy="18" r="2.5" fill={color} stroke="none" />
  </Svg>
);

export const Calendar = ({ size = defaultProps.size, color = defaultProps.color, strokeWidth = defaultProps.strokeWidth, style }: PrecisionIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" style={style}>
    {/* Offset floating time blocks */}
    <Rect x="4" y="8" width="12" height="12" />
    <Path d="M8 4 L20 4 L20 16" opacity="0.6" />
    <Circle cx="10" cy="14" r="2" fill={color} stroke="none" />
  </Svg>
);

export const Activity = ({ size = defaultProps.size, color = defaultProps.color, strokeWidth = defaultProps.strokeWidth, style }: PrecisionIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {/* Data wave / Equalizer */}
    <Rect x="3" y="12" width="4.5" height="8" rx="2" />
    <Rect x="9.75" y="4" width="4.5" height="16" rx="2" />
    <Rect x="16.5" y="8" width="4.5" height="12" rx="2" />
  </Svg>
);

export const Heartbeat = ({ size = defaultProps.size, color = defaultProps.color, strokeWidth = defaultProps.strokeWidth, style }: PrecisionIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {/* Tech radar / Client node ping */}
    <Circle cx="12" cy="12" r="3" fill={color} stroke="none" />
    <Path d="M12 4 A8 8 0 0 1 20 12" />
    <Path d="M4 12 A8 8 0 0 1 12 4" strokeDasharray="4 4" opacity="0.7" />
    <Path d="M12 20 A8 8 0 0 1 4 12" />
    <Path d="M20 12 A8 8 0 0 1 12 20" strokeDasharray="4 4" opacity="0.7" />
  </Svg>
);

export const Lightning = ({ size = defaultProps.size, color = defaultProps.color, strokeWidth = defaultProps.strokeWidth, style }: PrecisionIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" style={style}>
    <Path d="M13 2 L3 14 L12 14 L11 22 L21 10 L12 10 Z" />
  </Svg>
);

export const Shield = ({ size = defaultProps.size, color = defaultProps.color, strokeWidth = defaultProps.strokeWidth, style }: PrecisionIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" style={style}>
    {/* Alert Hexagon */}
    <Path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z" />
    <Path d="M12 7 L12 13" />
    <Circle cx="12" cy="17" r="1.5" fill={color} stroke="none" />
  </Svg>
);

export const PrecisionIcons = {
  Sparkles,
  TrendingUp,
  Calendar,
  Activity,
  Heartbeat,
  Lightning,
  Shield,
};
