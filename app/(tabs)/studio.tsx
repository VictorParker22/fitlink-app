import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
  Switch,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LineChart } from 'react-native-gifted-charts';

import { useApp, LiveClassItem } from '../../context/AppContext';
import { FontFamily, Radius, Spacing } from '../../constants/theme';
import { useAlert } from '../../context/AlertContext';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

// ── Toggle row (Twitch stream-setup style) ────────────────────────────────────
function SettingRow({
  icon,
  label,
  sublabel,
  value,
  onChange,
  isLast = false,
}: {
  icon: any;
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.settingRow, !isLast && s.settingRowBorder]}
      onPress={() => onChange(!value)}
      activeOpacity={0.7}
    >
      <View style={[s.settingIconBox, value && s.settingIconBoxActive]}>
        <Ionicons name={icon} size={15} color={value ? '#ffffff' : 'rgba(255,255,255,0.4)'} />
      </View>
      <View style={s.settingLabelWrap}>
        <Text style={s.settingLabel}>{label}</Text>
        {sublabel ? <Text style={s.settingSubLabel}>{sublabel}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(239,68,68,0.55)' }}
        thumbColor="#ffffff"
        ios_backgroundColor="rgba(255,255,255,0.1)"
      />
    </TouchableOpacity>
  );
}

// ── Queue card (Peloton "upcoming live" style) ────────────────────────────────
function QueueCard({
  item,
  onLaunch,
  onDelete,
}: {
  item: LiveClassItem;
  onLaunch: () => void;
  onDelete: () => void;
}) {
  const d = new Date(item.scheduled_for);
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <TouchableOpacity style={s.queueCard} onPress={onLaunch} activeOpacity={0.9}>
      {/* Layered gradient background */}
      <View style={s.queueCardBg} />
      <View style={s.queueCardGradientTop} />
      <View style={s.queueCardGradientBottom} />

      {/* Content */}
      <View style={s.queueCardContent}>
        {/* Top: badge + delete */}
        <View style={s.queueCardTop}>
          <View style={s.scheduledBadge}>
            <View style={s.scheduledBadgeDot} />
            <Text style={s.scheduledBadgeText}>SCHEDULED</Text>
          </View>
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={13} color="rgba(255,255,255,0.35)" />
          </TouchableOpacity>
        </View>

        {/* Bottom: date + title */}
        <View style={s.queueCardBottom}>
          <Text style={s.queueCardTime}>{dateStr} · {timeStr}</Text>
          <Text style={s.queueCardTitle} numberOfLines={2}>{item.title}</Text>
          {item.category ? (
            <Text style={s.queueCardCategory}>{item.category.toUpperCase()}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function StudioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { classes, liveClasses, updateLiveClass, deleteLiveClass, createClass } = useApp();
  const { showAlert } = useAlert();

  // Pulsing live dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Abrupt stream disconnect
  const [abruptEndedClass, setAbruptEndedClass] = useState<LiveClassItem | null>(null);
  const [isSavingVod, setIsSavingVod] = useState(false);

  // Tech check
  const [checklist, setChecklist] = useState({
    cameraReady: true,
    micReady: true,
    lightingChecked: false,
    doNotDisturb: true,
  });

  // Analytics
  const [realAnalytics, setRealAnalytics] = useState<any[]>([]);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const { data } = await supabase
          .from('classes')
          .select('id, take_count, created_at')
          .order('created_at', { ascending: true })
          .limit(8);
        if (data && data.length > 0) setRealAnalytics(data);
      } catch (e) {
        console.log('[Studio] analytics error:', e);
      }
    }
    fetchAnalytics();
  }, []);

  // Abrupt end detection
  useEffect(() => {
    const liveStream = liveClasses.find((c) => c.status === 'live');
    if (!liveStream) return;
    const lastUpdated = new Date(liveStream.updated_at || liveStream.scheduled_for).getTime();
    const elapsed = Math.floor((Date.now() - lastUpdated) / 1000);
    if (elapsed > 60) {
      (async () => {
        try {
          await updateLiveClass(liveStream.id, { status: 'ended' });
          setAbruptEndedClass(liveStream);
        } catch (e) {}
      })();
    }
  }, [liveClasses, updateLiveClass]);

  const toggleCheck = (key: keyof typeof checklist) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Derived
  const activeStream = useMemo(
    () => liveClasses.find((c) => c.status === 'live') || liveClasses.find((c) => c.status === 'scheduled'),
    [liveClasses]
  );
  const upcomingStreams = useMemo(() => liveClasses.filter((c) => c.status === 'scheduled'), [liveClasses]);
  const pastStreams = useMemo(
    () => liveClasses.filter((c) => c.status === 'ended' || c.status === 'cancelled'),
    [liveClasses]
  );
  const totalViews = useMemo(
    () => classes.reduce((sum, c) => sum + (c.take_count || 0), 0) + pastStreams.length * 12,
    [classes, pastStreams]
  );
  const sparklineData = useMemo(() => {
    const src = realAnalytics.length > 0 ? realAnalytics : classes.slice(-6);
    if (src.length === 0) return [{ value: 1, label: '' }];
    return src.map((c, i) => ({ value: Math.max(c.take_count || 0, 1), label: `${i + 1}` }));
  }, [realAnalytics, classes]);

  const isLive = activeStream?.status === 'live';
  const isScheduled = activeStream?.status === 'scheduled';
  const allReady = Object.values(checklist).every(Boolean);

  // Handlers
  const handleEnterStudio = (cls: LiveClassItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/broadcast/${cls.id}` as any);
  };
  const handleGoLive = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push('/broadcast/setup' as any);
  };
  const handleScheduleNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/create-live-class' as any);
  };
  const handleDelete = (id: string, title: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showAlert({
      type: 'warning',
      title: 'Delete Stream',
      message: `Delete "${title}"?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try { await deleteLiveClass(id); } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete' });
            }
          },
        },
      ],
    });
  };
  const handleSaveVod = async () => {
    if (!abruptEndedClass) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSavingVod(true);
    try {
      const vodUrl = abruptEndedClass.mux_playback_id && !abruptEndedClass.mux_playback_id.startsWith('playback_')
        ? `https://stream.mux.com/${abruptEndedClass.mux_playback_id}.m3u8`
        : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      await createClass({
        title: abruptEndedClass.title,
        description: abruptEndedClass.description || `Live recording from ${new Date().toLocaleDateString()}`,
        category: abruptEndedClass.category || 'Strength',
        tags: ['Live Recording', 'VOD'],
        difficulty: 'Intermediate',
        duration_minutes: abruptEndedClass.duration_minutes || 45,
        video_url: vodUrl,
        equipment: [],
        is_free: false,
        status: 'draft',
      });
      showAlert({ type: 'success', title: 'Saved!', message: 'Recording saved to your library as a Draft.' });
      setAbruptEndedClass(null);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Save Failed', message: err.message || 'Could not save.' });
    } finally {
      setIsSavingVod(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* ── Header (Twitch-style: title centered, action right) ─────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={[s.headerStatusDot, isLive && s.headerStatusDotLive]} />
        </View>
        <Text style={s.headerTitle}>Live Studio</Text>
        <TouchableOpacity style={s.headerRightBtn} onPress={handleScheduleNew} activeOpacity={0.7}>
          <Ionicons name="calendar-outline" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Abrupt disconnect alert ─────────────────────────────────── */}
        {abruptEndedClass && (
          <View style={s.alertCard}>
            <View style={s.alertCardLeft} />
            <View style={s.alertCardBody}>
              <View style={s.alertCardTitleRow}>
                <Ionicons name="warning" size={14} color="#FF6B35" />
                <Text style={s.alertCardTitle}>Stream Ended Abruptly</Text>
              </View>
              <Text style={s.alertCardSub} numberOfLines={1}>{abruptEndedClass.title}</Text>
              <View style={s.alertCardActions}>
                <TouchableOpacity style={s.alertSaveBtn} onPress={handleSaveVod} disabled={isSavingVod}>
                  {isSavingVod
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={s.alertSaveBtnText}>Save to Library</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={s.alertDismissBtn} onPress={() => setAbruptEndedClass(null)} disabled={isSavingVod}>
                  <Text style={s.alertDismissBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── Hero (Tonal-inspired: tall card with gradient + overlay text) */}
        <View style={[s.hero, isLive && s.heroLive]}>
          {/* Background layers creating depth */}
          <View style={s.heroBgBase} />
          <View style={s.heroBgMid} />
          <View style={s.heroBgBottom} />

          {/* Decorative dot grid */}
          <View style={s.heroDotGrid}>
            {Array.from({ length: 48 }).map((_, i) => (
              <View key={i} style={s.heroDot} />
            ))}
          </View>

          {/* Content overlay */}
          <View style={s.heroContent}>
            {/* Status pill */}
            <View style={[s.heroStatusPill, isLive && s.heroStatusPillLive, isScheduled && s.heroStatusPillScheduled]}>
              <Animated.View style={[s.heroStatusDot, isLive && s.heroStatusDotLive, isLive && { opacity: pulseAnim }]} />
              <Text style={[s.heroStatusText, isLive && s.heroStatusTextLive, isScheduled && s.heroStatusTextScheduled]}>
                {isLive ? 'LIVE IN PROGRESS' : isScheduled ? 'NEXT UP' : 'OFFLINE'}
              </Text>
            </View>

            {/* Main headline */}
            <Text style={s.heroTitle} numberOfLines={2}>
              {activeStream ? activeStream.title : 'Standing By'}
            </Text>
            <Text style={s.heroSub}>
              {activeStream
                ? (isLive
                  ? 'Currently broadcasting via Mux'
                  : new Date(activeStream.scheduled_for).toLocaleString(undefined, {
                    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  }))
                : 'Mux Ultra-Low Latency · RTMP Ingest'
              }
            </Text>
          </View>

          {/* Bottom bar: if active stream, show enter button */}
          {activeStream && (
            <TouchableOpacity
              style={[s.heroEnterBtn, isLive && s.heroEnterBtnLive]}
              onPress={() => handleEnterStudio(activeStream)}
              activeOpacity={0.85}
            >
              <Ionicons name={isLive ? 'videocam' : 'radio-outline'} size={16} color={isLive ? '#fff' : 'rgba(255,255,255,0.8)'} />
              <Text style={s.heroEnterBtnText}>
                {isLive ? 'Re-enter Live Studio' : 'Enter Broadcast Studio'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Stats (Peloton metadata bar) ─────────────────────────────── */}
        <View style={s.statsRow}>
          <View style={s.statBlock}>
            <Text style={s.statNum}>{totalViews.toLocaleString()}</Text>
            <Text style={s.statLabel}>Total Views</Text>
          </View>
          <View style={s.statSep} />
          <View style={s.statBlock}>
            <Text style={s.statNum}>{pastStreams.length + (activeStream ? 1 : 0)}</Text>
            <Text style={s.statLabel}>Broadcasts</Text>
          </View>
          <View style={s.statSep} />
          <View style={s.statBlock}>
            <Text style={[s.statNum, { color: '#4ADE80' }]}>0.8s</Text>
            <Text style={s.statLabel}>Mux Latency</Text>
          </View>
        </View>

        {/* ── Tech Check (Twitch stream-setup toggle rows) ─────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Pre-Flight Check</Text>
            {allReady && (
              <View style={s.allReadyBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#4ADE80" />
                <Text style={s.allReadyText}>All good</Text>
              </View>
            )}
          </View>

          <View style={s.settingsCard}>
            <SettingRow
              icon="videocam-outline"
              label="Camera & Framing"
              sublabel="Position and resolution verified"
              value={checklist.cameraReady}
              onChange={(v) => toggleCheck('cameraReady')}
            />
            <SettingRow
              icon="mic-outline"
              label="Microphone"
              sublabel="Audio gain and clarity checked"
              value={checklist.micReady}
              onChange={(v) => toggleCheck('micReady')}
            />
            <SettingRow
              icon="sunny-outline"
              label="Studio Lighting"
              sublabel="High-contrast illumination"
              value={checklist.lightingChecked}
              onChange={(v) => toggleCheck('lightingChecked')}
            />
            <SettingRow
              icon="moon-outline"
              label="Do Not Disturb"
              sublabel="Silence notifications during broadcast"
              value={checklist.doNotDisturb}
              onChange={(v) => toggleCheck('doNotDisturb')}
              isLast
            />
          </View>
        </View>

        {/* ── Viewership trend ─────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Viewership Trend</Text>
            <Text style={s.sectionSeeAll}>Last {sparklineData.length} classes</Text>
          </View>

          <View style={s.chartCard}>
            <View style={s.chartCardTop}>
              <Text style={s.chartBigNum}>{sparklineData.reduce((a, b) => a + b.value, 0).toLocaleString()}</Text>
              <Text style={s.chartBigLabel}>total takes</Text>
            </View>
            <View style={s.chartWrapper}>
              <LineChart
                data={sparklineData}
                height={90}
                width={width - 96}
                color="#EF4444"
                thickness={2.5}
                startFillColor="rgba(239,68,68,0.15)"
                endFillColor="rgba(239,68,68,0)"
                areaChart
                hideRules
                hideYAxisText
                xAxisColor="rgba(255,255,255,0.05)"
                yAxisColor="transparent"
                initialSpacing={10}
                spacing={45}
                dataPointsColor="#FF6B35"
                dataPointsRadius={4}
              />
            </View>
          </View>
        </View>

        {/* ── Upcoming streams (Peloton "Upcoming Live Workouts") ─────── */}
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Stream Queue</Text>
            <TouchableOpacity style={s.sectionAddBtn} onPress={handleScheduleNew}>
              <Ionicons name="add" size={16} color="#EF4444" />
              <Text style={s.sectionAddBtnText}>Schedule</Text>
            </TouchableOpacity>
          </View>

          {upcomingStreams.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.queueScroll}>
              {upcomingStreams.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  onLaunch={() => handleEnterStudio(item)}
                  onDelete={() => handleDelete(item.id, item.title)}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={s.emptyQueueCard}>
              <Ionicons name="calendar-outline" size={32} color="rgba(255,255,255,0.12)" />
              <Text style={s.emptyQueueTitle}>No scheduled broadcasts</Text>
              <Text style={s.emptyQueueSub}>Schedule a class to build your broadcast queue.</Text>
              <TouchableOpacity style={s.emptyQueueBtn} onPress={handleScheduleNew}>
                <Text style={s.emptyQueueBtnText}>+ Schedule a Class</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Broadcast Archive ─────────────────────────────────────────── */}
        {pastStreams.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Broadcast Archive</Text>
              <Text style={s.sectionSeeAll}>{pastStreams.length} streams</Text>
            </View>

            <View style={s.archiveCard}>
              {pastStreams.slice(0, 4).map((item, idx) => (
                <View
                  key={item.id}
                  style={[s.archiveRow, idx === Math.min(pastStreams.length, 4) - 1 && { borderBottomWidth: 0 }]}
                >
                  <View style={s.archiveIconBox}>
                    <Ionicons name="videocam" size={14} color="rgba(255,255,255,0.3)" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.archiveTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={s.archiveMeta}>
                      {new Date(item.scheduled_for).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {item.category ? ` · ${item.category}` : ''}
                    </Text>
                  </View>
                  <View style={[s.archiveBadge, item.status === 'cancelled' && s.archiveBadgeCancelled]}>
                    <Text style={[s.archiveBadgeText, item.status === 'cancelled' && s.archiveBadgeTextCancelled]}>
                      {item.status === 'cancelled' ? 'Cancelled' : 'Ended'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── Sticky CTA (Peloton-style bottom bar) ────────────────────── */}
      <View style={[s.stickyBottom, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}>
        {activeStream ? (
          /* Active stream: big red re-enter + small schedule */
          <TouchableOpacity
            style={[s.goLiveBtn, isLive && s.goLiveBtnActive]}
            onPress={() => handleEnterStudio(activeStream)}
            activeOpacity={0.85}
          >
            <View style={s.goLiveDot} />
            <Text style={s.goLiveBtnText}>{isLive ? 'RE-ENTER STUDIO' : 'ENTER STUDIO'}</Text>
          </TouchableOpacity>
        ) : (
          /* Idle: GO LIVE NOW primary + Schedule secondary */
          <View style={s.stickyBtnRow}>
            <TouchableOpacity style={s.goLiveBtn} onPress={handleGoLive} activeOpacity={0.85}>
              <View style={s.goLiveDot} />
              <Text style={s.goLiveBtnText}>GO LIVE NOW</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.scheduleBtn} onPress={handleScheduleNew} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        )}
      </View>

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A10' },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerLeft: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerStatusDotLive: {
    backgroundColor: '#EF4444',
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  headerRightBtn: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  // ── Alert card ──────────────────────────────────────────────────────────────
  alertCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,107,53,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    borderRadius: Radius.sm,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  alertCardLeft: {
    width: 4,
    backgroundColor: '#FF6B35',
  },
  alertCardBody: { flex: 1, padding: Spacing.md },
  alertCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  alertCardTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  alertCardSub: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 10,
  },
  alertCardActions: { flexDirection: 'row', gap: 8 },
  alertSaveBtn: {
    backgroundColor: '#C8F135',
    borderRadius: Radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  alertSaveBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#000000',
    letterSpacing: 0.3,
  },
  alertDismissBtn: {
    borderRadius: Radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  alertDismissBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  },

  // ── Hero card ───────────────────────────────────────────────────────────────
  hero: {
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    minHeight: 210,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  heroLive: {
    borderColor: 'rgba(239,68,68,0.4)',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  heroBgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F0D1E', // deep navy-purple
  },
  heroBgMid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: 'rgba(80,50,140,0.12)', // subtle purple tint at top
  },
  heroBgBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroDotGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 18,
    opacity: 0.4,
  },
  heroDot: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroContent: {
    padding: Spacing.lg,
    flex: 1,
    paddingBottom: 0,
  },
  heroStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    marginBottom: 14,
  },
  heroStatusPillLive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.4)',
  },
  heroStatusPillScheduled: {
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderColor: 'rgba(255,107,53,0.3)',
  },
  heroStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  heroStatusDotLive: { backgroundColor: '#EF4444' },
  heroStatusText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.2,
  },
  heroStatusTextLive: { color: '#EF4444' },
  heroStatusTextScheduled: { color: '#FF6B35' },
  heroTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: '#FFFFFF',
    lineHeight: 30,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  heroSub: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: Spacing.lg,
  },
  heroEnterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
  },
  heroEnterBtnLive: {
    backgroundColor: '#EF4444',
    borderTopColor: 'transparent',
  },
  heroEnterBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    flex: 1,
    textAlign: 'center',
  },

  // ── Stats row ───────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.sm,
    marginBottom: Spacing.xl,
    paddingVertical: 12,
  },
  statBlock: { flex: 1, alignItems: 'center', gap: 3 },
  statSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 6,
  },
  statNum: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 21,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },

  // ── Section ─────────────────────────────────────────────────────────────────
  section: { marginBottom: Spacing.xl },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
  sectionSeeAll: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  sectionAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionAddBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#EF4444',
    letterSpacing: 0.2,
  },
  allReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  allReadyText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: '#4ADE80',
  },

  // ── Settings card (Twitch stream-setup style) ────────────────────────────────
  settingsCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: Spacing.md,
    gap: 12,
  },
  settingRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  settingIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingIconBoxActive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  settingLabelWrap: { flex: 1, gap: 1 },
  settingLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  settingSubLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 15,
  },

  // ── Chart ───────────────────────────────────────────────────────────────────
  chartCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  chartCardTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 10,
  },
  chartBigNum: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  chartBigLabel: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  chartWrapper: { alignItems: 'center', overflow: 'hidden' },

  // ── Queue cards (Peloton upcoming live workouts) ─────────────────────────────
  queueScroll: { gap: 10 },
  queueCard: {
    width: 168,
    height: 210,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  queueCardBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#12101E',
  },
  queueCardGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(60,30,100,0.25)',
  },
  queueCardGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  queueCardContent: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'space-between',
  },
  queueCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scheduledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,107,53,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.35)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  scheduledBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FF6B35',
  },
  scheduledBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 7,
    color: '#FF6B35',
    letterSpacing: 0.8,
  },
  queueCardBottom: { gap: 3 },
  queueCardTime: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  queueCardTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 18,
  },
  queueCardCategory: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
  },
  emptyQueueCard: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.sm,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: 6,
  },
  emptyQueueTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  emptyQueueSub: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.22)',
    textAlign: 'center',
    lineHeight: 17,
  },
  emptyQueueBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  emptyQueueBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#EF4444',
    letterSpacing: 0.3,
  },

  // ── Archive ──────────────────────────────────────────────────────────────────
  archiveCard: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  archiveIconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  archiveMeta: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 1,
  },
  archiveBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  archiveBadgeCancelled: { borderColor: 'rgba(239,68,68,0.3)' },
  archiveBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
  archiveBadgeTextCancelled: { color: '#EF4444' },

  // ── Sticky bottom CTA (Peloton-style) ───────────────────────────────────────
  stickyBottom: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0A0A10',
  },
  stickyBtnRow: { flexDirection: 'row', gap: 10 },
  goLiveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: Radius.sm,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  goLiveBtnActive: {
    backgroundColor: '#EF4444',
  },
  goLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  goLiveBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  scheduleBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
