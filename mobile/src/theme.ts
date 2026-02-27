/**
 * Dark theme configuration for the mobile app.
 *
 * Uses React Native Paper's MD3DarkTheme as a base
 * with a custom primary color and merged navigation theme.
 */
import {
  MD3DarkTheme,
  adaptNavigationTheme,
} from 'react-native-paper';
import {
  DarkTheme as NavigationDarkTheme,
} from '@react-navigation/native';

const customColors = {
  ...MD3DarkTheme.colors,
  primary: '#90caf9',
  primaryContainer: '#1565c0',
  secondary: '#ce93d8',
  secondaryContainer: '#7b1fa2',
  surface: '#1e1e1e',
  surfaceVariant: '#2c2c2c',
  background: '#121212',
  error: '#ef5350',
  errorContainer: '#93000a',
  onPrimary: '#003258',
  onPrimaryContainer: '#d1e4ff',
  onSecondary: '#1b0329',
  onSecondaryContainer: '#ffd6fe',
  onSurface: '#e6e1e5',
  onSurfaceVariant: '#cac4d0',
  onBackground: '#e6e1e5',
  onError: '#601410',
  outline: '#938f99',
};

/** Paper theme — MD3 dark with custom accent. */
export const paperTheme = {
  ...MD3DarkTheme,
  colors: customColors,
  roundness: 8,
};

/** Navigation theme adapted from Paper's colors. */
const { DarkTheme: adaptedNavDark } = adaptNavigationTheme({
  reactNavigationDark: NavigationDarkTheme,
  materialDark: paperTheme,
});

export const navigationTheme = {
  ...adaptedNavDark,
  colors: {
    ...adaptedNavDark.colors,
    background: customColors.background,
    card: customColors.surface,
    text: customColors.onSurface,
    primary: customColors.primary,
  },
  fonts: NavigationDarkTheme.fonts,
};

/** Status chip color mapping. */
export const statusColors: Record<string, string> = {
  pending: '#9e9e9e',
  running: '#42a5f5',
  completed: '#66bb6a',
  failed: '#ef5350',
};
