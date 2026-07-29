import React, { type PropsWithChildren } from 'react';
import { View, StyleSheet, type ViewStyle, type ViewProps } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Radius, Spacing } from '../constants/theme';

interface CardProps extends ViewProps, PropsWithChildren {
  noPadding?: boolean;
}

export default function Card({ children, style, noPadding, ...rest }: CardProps) {
  const { colors } = useTheme();

  return (
    <View 
      style={[
        { backgroundColor: colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.base },
        noPadding && { padding: 0 },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
