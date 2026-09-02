import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    // Silent by contract: this only REGISTERS when permission already exists.
    // The system prompt is owned by the onboarding primer (lib/permissions.ts,
    // requestNotifications) — firing it cold at launch burned iOS's one-shot
    // prompt before the user had seen anything notifications are about.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      return undefined;
    }
    
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      
      if (!projectId) {
        console.warn('Project ID not found. Push notifications may not work in standalone builds without EAS config.');
      }
      
      token = (await Notifications.getExpoPushTokenAsync({
        projectId,
      })).data;
      
      if (__DEV__) console.log('Expo Push Token:', token);
    } catch (e) {
      console.warn('Error fetching push token:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}
