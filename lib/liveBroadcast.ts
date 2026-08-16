/**
 * Live broadcasting — platform support.
 *
 * The RTMP publisher (expo-camera-rtmp-publisher) ships an iOS native view
 * only. There is no Android implementation, so a coach on Android cannot
 * broadcast at all. That is a real product limitation, not a bug to route
 * around, and the app must be honest about it BEFORE a coach invests time or
 * money: the Elite paywall in the Studio tab sells "go live", and charging an
 * Android coach for a feature their device cannot run is both dishonest and a
 * Google Play problem.
 *
 * Every entry point into broadcasting checks this flag. When Android RTMP
 * support lands, flipping this one constant re-enables the whole path.
 */
import { Platform } from 'react-native';

export const liveBroadcastSupported = Platform.OS === 'ios';

/** Copy shown wherever broadcasting is offered but cannot run on this device. */
export const liveBroadcastUnsupportedTitle = 'Not available on Android';

export const liveBroadcastUnsupportedMessage =
  'Broadcasting live runs on iPhone only right now, so scheduling one here would promise your athletes a class you could not deliver. Watching live classes and replays works normally on Android.';
