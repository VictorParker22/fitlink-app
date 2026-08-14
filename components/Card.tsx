import React, { type PropsWithChildren } from 'react';
import { View, type ViewStyle, type ViewProps } from 'react-native';
import { Radius, Spacing } from '../constants/theme';
import { CoachColors } from '../constants/coachDesign';

interface CardProps extends ViewProps, PropsWithChildren {
  noPadding?: boolean;
}

export default function Card({ children, style, noPadding, ...rest }: CardProps) {
  return (
    <View
      style={[
        { backgroundColor: CoachColors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: CoachColors.borderMuted, padding: Spacing.base },
        noPadding && { padding: 0 },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
