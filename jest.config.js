/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  setupFiles: ['<rootDir>/tests/setup/reanimated.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-modules-core|expo-.*|@sentry/react-native|@supabase/.*|react-navigation|@react-navigation/.*|react-native-.*|@shopify/flash-list)/)',
  ],
};
