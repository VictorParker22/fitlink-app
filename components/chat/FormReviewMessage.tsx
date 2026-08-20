/**
 * FormReviewMessage — a coach comment pinned to a second of a video.
 *
 * Message content format: [FORM_REVIEW:<seconds>:<comment>]
 * carried on a message whose attachment_url/attachment_type point at the video
 * under review. Rendered identically on the coach thread (app/chat/[id].tsx)
 * and the athlete thread (app/(client-tabs)/my-messages.tsx).
 *
 * Tapping the timestamp chip seeks the inline player to the pinned second.
 * When no video attachment is present, the pinned pairing still renders
 * (timestamp chip + comment) so the format degrades gracefully.
 */

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

export const FORM_REVIEW_PREFIX = '[FORM_REVIEW:';

export function parseFormReview(content: string): { seconds: number; comment: string } | null {
  const m = content.match(/^\[FORM_REVIEW:(\d+):([\s\S]*)\]$/);
  if (!m) return null;
  return { seconds: parseInt(m[1], 10), comment: m[2] };
}

function fmtTimestamp(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function PinnedVideo({ videoUrl, seconds }: { videoUrl: string; seconds: number }) {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
  });

  const seekToPin = () => {
    player.currentTime = seconds;
    player.play();
  };

  return (
    <View style={styles.videoWrap}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls
      />
      <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }}
        style={styles.pinChipOverVideo}
        onPress={seekToPin}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Jump to ${fmtTimestamp(seconds)}`}
      >
        <Text style={styles.pinChipTime}>{fmtTimestamp(seconds)}</Text>
        <Text style={styles.pinChipLabel}>jump to pin</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function FormReviewMessage({
  seconds,
  comment,
  videoUrl,
  isMine,
}: {
  seconds: number;
  comment: string;
  videoUrl?: string;
  isMine: boolean;
}) {
  return (
    <View style={{ minWidth: 220, gap: 10 }}>
      <Text style={[styles.tag, { color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }]}>
        FORM REVIEW
      </Text>

      {videoUrl ? (
        <PinnedVideo videoUrl={videoUrl} seconds={seconds} />
      ) : (
        <View style={styles.pinRow}>
          <Text style={styles.pinTime}>{fmtTimestamp(seconds)}</Text>
          <View style={styles.pinTrack}>
            <View style={styles.pinDot} />
          </View>
          <Text style={styles.pinnedWord}>pinned</Text>
        </View>
      )}

      <Text
        style={[
          styles.comment,
          { color: isMine ? CoachColors.onAccent : CoachColors.textPrimary },
        ]}
      >
        {comment}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  videoWrap: {
    borderRadius: 11,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  video: { width: 220, height: 150 },
  pinChipOverVideo: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16,18,16,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.4)',
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pinChipTime: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.accent,
  },
  pinChipLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textMuted,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(16,18,16,0.55)',
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 11,
    borderCurve: 'continuous',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  pinTime: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.accent,
  },
  pinTrack: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.border,
    justifyContent: 'center',
  },
  pinDot: {
    position: 'absolute',
    left: '56%',
    width: 9,
    height: 9,
    borderRadius: 5,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  pinnedWord: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
  },
  comment: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 15,
    lineHeight: 22.5,
  },
});
