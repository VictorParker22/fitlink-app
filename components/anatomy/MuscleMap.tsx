// components/anatomy/MuscleMap.tsx
// Signature SVG anatomy muscle map — front and back body silhouettes with
// independently highlightable muscle regions. Region ids come from
// lib/muscles.ts. Designed to read at 72px (thumbnail), 180px (session)
// and 280px (picker) — no text inside the SVG.
//
// Each figure lives in a 200 x 400 viewBox with the body centered on x=100.
// Paired shapes are authored for the right side only and mirrored across
// the centerline with translate(200,0) scale(-1,1), which keeps the figure
// perfectly symmetric.

import React from 'react';
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { CoachColors } from '../../constants/coachDesign';
import { REGION_BY_ID, MuscleRegionId } from '../../lib/muscles';

const MIRROR = 'translate(200, 0) scale(-1, 1)';

// ── Base silhouette (shared by front and back figures) ─────────────────────
// One closed contour: head → right arm (outer, hand, inner) → torso → right
// leg (outer, foot, inner) → crotch → left leg → left arm → head.
const SILHOUETTE = [
  'M100,10',
  'C112,10 118,18 118,28',
  'C118,37 113,44 107,48',
  'L107,57',
  'C116,60 129,61 138,66',
  'C148,71 153,80 154,91',
  'C156,107 157,124 158,141',
  'C160,157 161,172 162,185',
  'C166,191 167,199 163,204',
  'C159,208 152,206 150,199',
  'C148,193 147,189 146,184',
  'C145,170 144,156 143,143',
  'C140,127 137,110 132,93',
  'C130,110 128,130 127,148',
  'C127,162 130,170 131,180',
  'C131,205 128,242 124,272',
  'C120,302 117,330 114,354',
  'C115,362 119,365 120,369',
  'C121,374 115,377 110,376',
  'C105,375 103,371 103,364',
  'C103,338 103,306 103,276',
  'C102,248 101,221 100,200',
  'C99,221 98,248 97,276',
  'C97,306 97,338 97,364',
  'C97,371 95,375 90,376',
  'C85,377 79,374 80,369',
  'C81,365 85,362 86,354',
  'C83,330 80,302 76,272',
  'C72,242 69,205 69,180',
  'C70,170 73,162 73,148',
  'C72,130 70,110 68,93',
  'C63,110 60,127 57,143',
  'C56,156 55,170 54,184',
  'C53,189 52,193 50,199',
  'C48,206 41,208 37,204',
  'C33,199 34,191 38,185',
  'C39,172 40,157 42,141',
  'C43,124 44,107 46,91',
  'C47,80 52,71 62,66',
  'C71,61 84,60 93,57',
  'L93,48',
  'C87,44 82,37 82,28',
  'C82,18 88,10 100,10',
  'Z',
].join(' ');

// ── Region shapes ───────────────────────────────────────────────────────────
// `center` paths straddle the midline; `right` paths are mirrored to the left.
interface RegionShape {
  center?: string[];
  right?: string[];
}

const NECK_SHAPE: RegionShape = {
  center: ['M93,49 C95,51 105,51 107,49 L108,58 C104,60 96,60 92,58 Z'],
};

const DELT_RIGHT =
  'M137,67 C146,72 151,80 152,90 C152,96 149,100 144,99 C137,97 133,90 133,82 C133,75 134,70 137,67 Z';

const UPPER_ARM_RIGHT =
  'M137,101 C143,99 149,103 151,110 C153,120 152,130 148,137 C144,141 139,138 138,130 C137,120 136,110 137,101 Z';

const FOREARM_RIGHT =
  'M145,147 C150,144 155,147 156,154 C158,164 159,174 159,181 C159,186 155,188 152,184 C149,177 146,162 145,147 Z';

const CALF_RIGHT =
  'M106,282 C112,278 118,283 119,292 C120,310 117,332 113,347 C110,351 106,348 105,341 C103,321 104,300 106,282 Z';

const FRONT_SHAPES: Partial<Record<MuscleRegionId, RegionShape>> = {
  neck: NECK_SHAPE,
  shoulders: { right: [DELT_RIGHT] },
  chest: {
    right: [
      'M101,64 C111,63 123,66 130,73 C133,80 132,89 127,95 C120,101 108,102 103,97 C101,93 101,84 101,74 Z',
    ],
  },
  biceps: { right: [UPPER_ARM_RIGHT] },
  forearms: { right: [FOREARM_RIGHT] },
  core: {
    center: [
      'M89,105 C93,102 107,102 111,105 C113,122 113,142 111,158 C107,163 93,163 89,158 C87,142 87,122 89,105 Z',
    ],
  },
  obliques: {
    right: [
      'M114,107 C119,109 124,113 125,119 C125,132 124,142 122,150 C119,154 115,151 114,145 C113,133 113,119 114,107 Z',
    ],
  },
  quads: {
    right: [
      'M104,196 C112,192 122,196 126,205 C129,225 128,248 123,266 C119,272 110,272 107,265 C103,244 103,218 104,196 Z',
    ],
  },
  calves: { right: [CALF_RIGHT] },
};

const BACK_SHAPES: Partial<Record<MuscleRegionId, RegionShape>> = {
  neck: NECK_SHAPE,
  traps: {
    center: [
      'M100,58 C90,60 78,63 68,67 C76,72 84,76 89,83 C94,91 97,102 100,110 C103,102 106,91 111,83 C116,76 124,72 132,67 C122,63 110,60 100,58 Z',
    ],
  },
  shoulders: { right: [DELT_RIGHT] },
  triceps: { right: [UPPER_ARM_RIGHT] },
  forearms: { right: [FOREARM_RIGHT] },
  lats: {
    right: [
      'M105,100 C112,97 122,94 129,91 C131,105 129,124 122,143 C117,151 109,153 106,147 C104,132 104,115 105,100 Z',
    ],
  },
  lower_back: {
    center: [
      'M91,132 C96,128 104,128 109,132 C110,143 110,155 109,164 C104,168 96,168 91,164 C90,155 90,143 91,132 Z',
    ],
  },
  glutes: {
    right: [
      'M101,170 C110,166 121,169 125,178 C127,188 123,196 115,198 C107,199 101,194 101,186 Z',
    ],
  },
  hamstrings: {
    right: [
      'M104,204 C112,200 122,203 126,211 C128,230 127,251 122,267 C118,273 110,273 107,266 C103,246 103,224 104,204 Z',
    ],
  },
  calves: { right: [CALF_RIGHT] },
};

// ── Fill states ─────────────────────────────────────────────────────────────

type RegionState = 'selected' | 'primary' | 'secondary' | 'neutral';

interface RegionStyle {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
}

const REGION_STYLES: Record<RegionState, RegionStyle> = {
  selected: { fill: CoachColors.accent, fillOpacity: 0.9, stroke: CoachColors.accent, strokeWidth: 1.75 },
  primary: { fill: CoachColors.accent, fillOpacity: 0.92, stroke: 'none', strokeWidth: 0 },
  secondary: { fill: CoachColors.accent, fillOpacity: 0.35, stroke: 'none', strokeWidth: 0 },
  neutral: { fill: CoachColors.surface, fillOpacity: 1, stroke: CoachColors.borderMuted, strokeWidth: 1 },
};

// ── Props (contract is fixed — strength-session mounts this as-is) ─────────

export interface MuscleMapProps {
  primary?: string[];
  secondary?: string[];
  selected?: string[];
  onToggle?: (id: string) => void;
  view?: 'front' | 'back' | 'both';
  height?: number;
}

interface FigureProps {
  shapes: Partial<Record<MuscleRegionId, RegionShape>>;
  height: number;
  stateFor: (id: MuscleRegionId) => RegionState;
  onToggle?: (id: string) => void;
}

function Figure({ shapes, height, stateFor, onToggle }: FigureProps) {
  const width = height / 2;
  const regionIds = Object.keys(shapes) as MuscleRegionId[];

  return (
    <Svg width={width} height={height} viewBox="0 0 200 400">
      <Path
        d={SILHOUETTE}
        fill={CoachColors.surface}
        stroke={CoachColors.borderMuted}
        strokeWidth={1.5}
      />
      {regionIds.map((id) => {
        const shape = shapes[id];
        if (!shape) return null;
        const state = stateFor(id);
        const style = REGION_STYLES[state];
        const label = REGION_BY_ID[id]?.label ?? id;
        const pressable = !!onToggle;

        return (
          <G
            key={id}
            onPress={pressable ? () => onToggle(id) : undefined}
            accessible={pressable}
            accessibilityRole={pressable ? 'button' : undefined}
            accessibilityLabel={
              pressable
                ? `${label}, ${state === 'selected' ? 'selected' : 'not selected'}`
                : label
            }
          >
            {shape.center?.map((d, i) => (
              <Path
                key={`c${i}`}
                d={d}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
              />
            ))}
            {shape.right?.map((d, i) => (
              <React.Fragment key={`r${i}`}>
                <Path
                  d={d}
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                />
                <Path
                  d={d}
                  transform={MIRROR}
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                />
              </React.Fragment>
            ))}
          </G>
        );
      })}
    </Svg>
  );
}

export default function MuscleMap({
  primary,
  secondary,
  selected,
  onToggle,
  view = 'both',
  height = 180,
}: MuscleMapProps) {
  const stateFor = (id: MuscleRegionId): RegionState => {
    if (selected?.includes(id)) return 'selected';
    if (primary?.includes(id)) return 'primary';
    if (secondary?.includes(id)) return 'secondary';
    return 'neutral';
  };

  const gap = Math.max(4, Math.round(height * 0.05));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      {(view === 'front' || view === 'both') && (
        <Figure shapes={FRONT_SHAPES} height={height} stateFor={stateFor} onToggle={onToggle} />
      )}
      {(view === 'back' || view === 'both') && (
        <Figure shapes={BACK_SHAPES} height={height} stateFor={stateFor} onToggle={onToggle} />
      )}
    </View>
  );
}
