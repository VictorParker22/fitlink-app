/**
 * BASE / web DateTimePicker.
 *
 * `@react-native-community/datetimepicker` has no web entry: its `main` is
 * `src/index.js`, which resolves to `datetimepicker.js` and reaches into
 * `codegenNativeComponent`. Importing it on web fails the build outright, so
 * this has to be a module split, not a runtime branch. `.native.tsx` carries
 * the real picker; the base is web-safe so a resolution miss degrades rather
 * than detonating.
 *
 * The browser already HAS a date/time picker — the OS one, behind
 * `<input type="date">` — and it is better here than a re-implemented modal
 * wheel: keyboard-typeable, locale-aware, and screen-reader correct for free.
 * That is the browser earning its place, which is turn 28's whole argument.
 *
 * Prop-compatible with the call sites in create-plan.tsx and
 * create-live-class.tsx: { value, mode, display?, onChange, minimumDate? }.
 * `display`, `textColor` and `themeVariant` are native-only styling hints and
 * are accepted-and-ignored so the call sites need no platform branch.
 */

import React from 'react';
import { Platform } from 'react-native';

type Mode = 'date' | 'time' | 'datetime';

export interface DateTimePickerProps {
  value: Date;
  mode?: Mode;
  display?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  textColor?: string;
  themeVariant?: string;
  /** Matches the native signature: (event, selectedDate). */
  onChange?: (event: { type: string; nativeEvent?: any }, date?: Date) => void;
  [key: string]: any;
}

/** `2026-08-18` / `14:30` — the value shapes the native inputs expect. */
function toInputValue(d: Date, mode: Mode): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (mode === 'time') return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function DateTimePicker({
  value,
  mode = 'date',
  minimumDate,
  maximumDate,
  onChange,
}: DateTimePickerProps) {
  // Rendered through React DOM: on web, react-native-web passes unknown
  // element types straight through, so a real <input> is available here.
  const Input: any = 'input';

  const handle = (e: any) => {
    const raw = e?.target?.value;
    if (!raw) return;
    const next = new Date(value);
    if (mode === 'time') {
      const [h, m] = raw.split(':').map(Number);
      if (Number.isFinite(h) && Number.isFinite(m)) next.setHours(h, m, 0, 0);
    } else {
      const [y, mo, d] = raw.split('-').map(Number);
      if (Number.isFinite(y)) next.setFullYear(y, (mo || 1) - 1, d || 1);
    }
    // Native fires { type: 'set' } plus the date; mirrored so callers that
    // check event.type keep working unchanged.
    onChange?.({ type: 'set' }, next);
  };

  if (Platform.OS !== 'web') {
    // Should be unreachable — .native.tsx wins on native — but if some
    // resolution path lands here, render nothing rather than a broken input.
    return null;
  }

  return (
    <Input
      type={mode === 'time' ? 'time' : 'date'}
      value={toInputValue(value, mode)}
      min={minimumDate ? toInputValue(minimumDate, mode) : undefined}
      max={maximumDate ? toInputValue(maximumDate, mode) : undefined}
      onChange={handle}
      style={{
        // Tokens are not reachable from a raw DOM node's style object, so the
        // few values here are the literal design-system colours.
        background: '#1A1D19',
        color: '#F5F7F3',
        border: '1px solid #2A2F27',
        borderRadius: 12,
        padding: '10px 12px',
        font: '15px Epilogue, system-ui, sans-serif',
        colorScheme: 'dark',
      }}
    />
  );
}
