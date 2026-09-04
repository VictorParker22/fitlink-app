import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useAppBusiness } from '../../../context/AppContext';
import { useRenderCount } from '../../../lib/devRenderCount';
import CheckInInbox from '../CheckInInbox';

interface CheckInInboxSectionProps {
  /** Stable callback from the shell; records the section's y for scroll-to. */
  onLayout: (e: LayoutChangeEvent) => void;
}

/**
 * Check-in inbox — full detail, scrolled to from "Between sessions".
 * Business slice only (the trainer id).
 */
const CheckInInboxSection = React.memo(function CheckInInboxSection({ onLayout }: CheckInInboxSectionProps) {
  useRenderCount('CheckInInboxSection');
  const { trainer } = useAppBusiness();
  if (!trainer?.id) return null;
  return (
    <View onLayout={onLayout}>
      <CheckInInbox trainerId={trainer.id} />
    </View>
  );
});

export default CheckInInboxSection;
