import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

export type BoltPose = 'Welcome' | 'Analyze' | 'Celebrate' | 'Concerned' | 'Help' | 'Flex';

interface BoltProps {
  pose?: BoltPose;
  size?: number;
  color?: string;
}

export function Bolt({ pose = 'Welcome', size = 100, color = '#FF9500' }: BoltProps) {
  // A consistent abstract visual language: 
  // 1. A central zig-zag (lightning) body
  // 2. A circular 'head'
  // 3-5 shapes max per pose.

  const renderPose = () => {
    switch (pose) {
      case 'Welcome':
        return (
          <G transform="translate(10, 10)">
            {/* Head */}
            <Circle cx="50" cy="20" r="12" fill={color} />
            {/* Body */}
            <Path d="M40 35 L60 35 L45 60 L65 60 L35 95 L45 65 L25 65 Z" fill={color} />
            {/* Floating 'arm' waving */}
            <Circle cx="75" cy="40" r="6" fill={color} />
          </G>
        );

      case 'Analyze':
        return (
          <G transform="translate(10, 10)">
            {/* Head slightly lowered and forward */}
            <Circle cx="35" cy="25" r="12" fill={color} />
            {/* Body */}
            <Path d="M40 40 L60 40 L45 65 L65 65 L35 100 L45 70 L25 70 Z" fill={color} />
            {/* Floating scanning 'dot' */}
            <Circle cx="20" cy="45" r="4" fill={color} />
          </G>
        );

      case 'Celebrate':
        return (
          <G transform="translate(10, 5)">
            {/* Head high and centered */}
            <Circle cx="50" cy="15" r="14" fill={color} />
            {/* Body elongated / leaping */}
            <Path d="M40 32 L60 32 L48 55 L68 55 L40 90 L48 60 L28 60 Z" fill={color} />
            {/* Two floating dots for confetti/energy */}
            <Circle cx="25" cy="25" r="5" fill={color} />
            <Circle cx="75" cy="25" r="5" fill={color} />
          </G>
        );

      case 'Concerned':
        return (
          <G transform="translate(10, 15)">
            {/* Head low and tucked */}
            <Circle cx="30" cy="35" r="12" fill={color} />
            {/* Body shrunk/bent */}
            <Path d="M45 45 L65 45 L50 65 L70 65 L40 95 L50 70 L30 70 Z" fill={color} />
          </G>
        );

      case 'Help':
        return (
          <G transform="translate(10, 10)">
            {/* Head tilted */}
            <Circle cx="60" cy="25" r="12" fill={color} />
            {/* Body */}
            <Path d="M35 40 L55 40 L40 65 L60 65 L30 100 L40 70 L20 70 Z" fill={color} />
            {/* Floating question mark / raised hand equivalent */}
            <Rect x="70" y="45" width="8" height="8" rx="4" fill={color} />
            <Circle cx="74" cy="62" r="4" fill={color} />
          </G>
        );

      case 'Flex':
        return (
          <G transform="translate(10, 10)">
            {/* Head centered */}
            <Circle cx="50" cy="20" r="12" fill={color} />
            {/* Body */}
            <Path d="M40 35 L60 35 L45 60 L65 60 L35 95 L45 65 L25 65 Z" fill={color} />
            {/* Flexing 'arms' (capsules) */}
            <Rect x="15" y="35" width="16" height="8" rx="4" fill={color} transform="rotate(-30 23 39)" />
            <Rect x="69" y="35" width="16" height="8" rx="4" fill={color} transform="rotate(30 77 39)" />
          </G>
        );

      default:
        return null;
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 100 110">
      {renderPose()}
    </Svg>
  );
}
