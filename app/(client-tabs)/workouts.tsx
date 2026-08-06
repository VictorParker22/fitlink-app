import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useClient } from '../../context/ClientContext';
import { supabase } from '../../lib/supabase';

import ExploreDashboard from '../../components/client-tabs/explore/ExploreDashboard';
import WorkoutList from '../../components/client-tabs/explore/WorkoutList';
import ActiveWorkoutPlayer from '../../components/client-tabs/explore/ActiveWorkoutPlayer';
import WorkoutSummary from '../../components/client-tabs/explore/WorkoutSummary';

export default function ClientWorkoutsScreen() {
  const { trainer, clientData, workouts, completeWorkoutWithLog } = useClient();
  const params = useLocalSearchParams<{ view?: string; startWorkoutId?: string }>();

  // Navigation / View modes
  const [exploreView, setExploreView] = useState<'explore' | 'workouts_list'>('explore');

  // Search & Modals state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<any | null>(null);
  const [showBookModal, setShowBookModal] = useState(false);
  // bookingCoach is SEPARATE from selectedCoach.
  // selectedCoach drives CoachDetailModal visibility (cleared when detail modal closes).
  // bookingCoach drives BookSessionModal and persists until the booking modal itself closes.
  // Without this, BookSessionModal receives coach=null because CoachDetailModal
  // clears selectedCoach when it dismisses, before BookSessionModal can open.
  const [bookingCoach, setBookingCoach] = useState<any | null>(null);
  const [dbTrainers, setDbTrainers] = useState<any[]>([]);

  // Active workout state
  const [activeWorkout, setActiveWorkout] = useState<any | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryElapsedSeconds, setSummaryElapsedSeconds] = useState(0);
  const [summaryExerciseStates, setSummaryExerciseStates] = useState<any[]>([]);

  // Handle route params (e.g. view='workouts_list' or startWorkoutId='...')
  useEffect(() => {
    if (params?.view === 'workouts_list') {
      setExploreView('workouts_list');
    } else if (params?.view === 'explore') {
      setExploreView('explore');
    }

    if (params?.startWorkoutId) {
      // Find workout in assigned client workouts or fetch from Supabase
      const found = (workouts || []).find((w: any) => w.id === params.startWorkoutId || w.workout_id === params.startWorkoutId || w.workouts?.id === params.startWorkoutId);
      if (found) {
        setActiveWorkout(found);
      } else {
        // Fallback fetch single workout with exercises
        supabase
          .from('workouts')
          .select('*, workout_exercises(*, exercises(*))')
          .eq('id', params.startWorkoutId)
          .single()
          .then(({ data }) => {
            if (data) {
              setActiveWorkout({
                id: `preview-${data.id}`,
                workout_id: data.id,
                workouts: data,
                status: 'assigned',
              });
            }
          });
      }
    }
  }, [params?.view, params?.startWorkoutId, workouts]);

  // Fetch trainers from Supabase
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('trainers').select('*');
        if (data && data.length > 0) setDbTrainers(data);
      } catch (err) {
        console.log('Error fetching trainers:', err);
      }
    })();
  }, []);

  // Compute full coach directory list
  const allCoaches = useMemo(() => {
    const dbList = [...(dbTrainers || [])].map((t) => ({
      id: t.id,
      name: t.name || 'Coach',
      role: t.role || 'Elite Trainer',
      avatar: t.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      specialty: t.specializations?.join(', ') || 'Strength & Conditioning',
      bio: t.bio || 'Professional fitness coach dedicated to your progress.',
    }));

    const combined = [...dbList];

    if (trainer) {
      const idx = combined.findIndex((c) => c.id === trainer.id || (c.name || '').toLowerCase() === (trainer.name || '').toLowerCase());
      if (idx !== -1) {
        const [trainerObj] = combined.splice(idx, 1);
        trainerObj.role = 'Your Personal Coach';
        combined.unshift(trainerObj);
      } else {
        combined.unshift({
          id: trainer.id,
          name: trainer.name || 'Your Trainer',
          role: 'Your Personal Coach',
          avatar: trainer.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
          specialty: trainer.specializations?.join(', ') || 'Strength & Conditioning',
          bio: trainer.bio || 'Your dedicated coach for reaching health and fitness goals.',
        });
      }
    }
    return combined;
  }, [dbTrainers, trainer]);

  // Finish active workout handler
  const handleFinishWorkout = (elapsedSeconds: number, exerciseStates: any[]) => {
    setSummaryElapsedSeconds(elapsedSeconds);
    setSummaryExerciseStates(exerciseStates);
    setShowSummary(true);
  };

  const handleConfirmFinish = async () => {
    if (!activeWorkout) return;
    await completeWorkoutWithLog(activeWorkout.id, summaryElapsedSeconds);
    setActiveWorkout(null);
    setShowSummary(false);
    setSummaryExerciseStates([]);
    setSummaryElapsedSeconds(0);
  };

  // Render post-workout summary view
  if (activeWorkout && showSummary) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <WorkoutSummary
          activeWorkout={activeWorkout}
          elapsedSeconds={summaryElapsedSeconds}
          exerciseStates={summaryExerciseStates}
          onConfirmFinish={handleConfirmFinish}
          onContinueWorkout={() => setShowSummary(false)}
        />
      </SafeAreaView>
    );
  }

  // Render live active workout player
  if (activeWorkout) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <ActiveWorkoutPlayer
          activeWorkout={activeWorkout}
          onFinishWorkout={handleFinishWorkout}
          onCancelWorkout={() => setActiveWorkout(null)}
        />
      </SafeAreaView>
    );
  }

  // Render Explore Dashboard or Assigned Workout List
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      {exploreView === 'explore' ? (
        <ExploreDashboard
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          showSearchInput={showSearchInput}
          setShowSearchInput={setShowSearchInput}
          allCoaches={allCoaches}
          selectedCoach={selectedCoach}
          setSelectedCoach={setSelectedCoach}
          showBookModal={showBookModal}
          setShowBookModal={setShowBookModal}
          bookingCoach={bookingCoach}
          setBookingCoach={setBookingCoach}
          selectedCategoryLabel={selectedCategoryLabel}
          setSelectedCategoryLabel={setSelectedCategoryLabel}
          onWorkoutsListPress={() => setExploreView('workouts_list')}
          hasActivePlan={!!clientData?.plan_id}
        />
      ) : (
        <WorkoutList
          onBackToExplore={() => setExploreView('explore')}
          onStartActiveWorkout={(workout) => setActiveWorkout(workout)}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
