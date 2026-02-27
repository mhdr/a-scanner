import React, { useEffect } from 'react';
import { StatusBar, StyleSheet, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, Text, Button } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { paperTheme, navigationTheme } from './theme';
import { useAppStore } from './stores/appStore';

// Screens
import ScansScreen from './screens/ScansScreen';
import ScanDetailScreen from './screens/ScanDetailScreen';
import ProvidersScreen from './screens/ProvidersScreen';
import ResultsScreen from './screens/ResultsScreen';
import IpDetailScreen from './screens/IpDetailScreen';

// ─────────────────────────────────────────
// Navigation type definitions
// ─────────────────────────────────────────

export type ScansStackParamList = {
  ScansList: undefined;
  ScanDetail: { scanId: string };
};

export type ResultsStackParamList = {
  ResultsList: undefined;
  IpDetail: { ip: string };
};

// ─────────────────────────────────────────
// Stack navigators
// ─────────────────────────────────────────

const ScansStack = createNativeStackNavigator<ScansStackParamList>();
const ResultsStack = createNativeStackNavigator<ResultsStackParamList>();

function ScansStackNavigator() {
  return (
    <ScansStack.Navigator screenOptions={{ headerShown: false }}>
      <ScansStack.Screen name="ScansList" component={ScansScreen} />
      <ScansStack.Screen name="ScanDetail" component={ScanDetailScreen} />
    </ScansStack.Navigator>
  );
}

function ResultsStackNavigator() {
  return (
    <ResultsStack.Navigator screenOptions={{ headerShown: false }}>
      <ResultsStack.Screen name="ResultsList" component={ResultsScreen} />
      <ResultsStack.Screen name="IpDetail" component={IpDetailScreen} />
    </ResultsStack.Navigator>
  );
}

// ─────────────────────────────────────────
// Drawer navigator
// ─────────────────────────────────────────

type DrawerParamList = {
  ScansTab: undefined;
  ProvidersTab: undefined;
  ResultsTab: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { rootAvailable } = useAppStore();

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerContent}>
      <View style={styles.drawerHeader}>
        <Icon name="shield-search" size={40} color="#90caf9" />
        <Text variant="titleMedium" style={styles.appTitle}>
          α-scanner
        </Text>
        {!rootAvailable && (
          <Text variant="bodySmall" style={styles.warningText}>
            ⚠ Root access unavailable
          </Text>
        )}
      </View>

      <View style={styles.drawerItems}>
        <Button
          icon="magnify-scan"
          mode={getActiveRoute(props) === 'ScansTab' ? 'contained-tonal' : 'text'}
          contentStyle={styles.drawerButton}
          onPress={() => props.navigation.navigate('ScansTab')}
        >
          Scans
        </Button>
        <Button
          icon="dns"
          mode={getActiveRoute(props) === 'ProvidersTab' ? 'contained-tonal' : 'text'}
          contentStyle={styles.drawerButton}
          onPress={() => props.navigation.navigate('ProvidersTab')}
        >
          Providers
        </Button>
        <Button
          icon="chart-line"
          mode={getActiveRoute(props) === 'ResultsTab' ? 'contained-tonal' : 'text'}
          contentStyle={styles.drawerButton}
          onPress={() => props.navigation.navigate('ResultsTab')}
        >
          Results
        </Button>
      </View>
    </DrawerContentScrollView>
  );
}

function getActiveRoute(props: DrawerContentComponentProps): string {
  const state = props.state;
  return state.routes[state.index]?.name ?? '';
}

function MainApp() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: '#1e1e2e' },
        headerTintColor: '#e0e0e0',
        drawerStyle: { backgroundColor: '#1e1e2e', width: 260 },
      }}
    >
      <Drawer.Screen
        name="ScansTab"
        component={ScansStackNavigator}
        options={{ title: 'Scans' }}
      />
      <Drawer.Screen
        name="ProvidersTab"
        component={ProvidersScreen}
        options={{ title: 'Providers' }}
      />
      <Drawer.Screen
        name="ResultsTab"
        component={ResultsStackNavigator}
        options={{ title: 'Results' }}
      />
    </Drawer.Navigator>
  );
}

// ─────────────────────────────────────────
// Root App
// ─────────────────────────────────────────

export default function App() {
  const {
    isInitialised,
    isInitialising,
    initApp,
  } = useAppStore();

  useEffect(() => {
    initApp();
  }, [initApp]);

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <StatusBar barStyle="light-content" backgroundColor="#1e1e2e" />
        <NavigationContainer theme={navigationTheme}>
          {isInitialising || !isInitialised ? (
            <View style={styles.splash}>
              <Icon name="shield-search" size={64} color="#90caf9" />
              <Text variant="headlineMedium" style={styles.splashTitle}>
                α-scanner
              </Text>
              <ActivityIndicator
                size="large"
                color="#90caf9"
                style={styles.splashLoader}
              />
              <Text variant="bodySmall" style={styles.dimText}>
                Initializing...
              </Text>
            </View>
          ) : (
            <MainApp />
          )}
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  splashTitle: {
    color: '#90caf9',
    marginTop: 12,
  },
  splashLoader: {
    marginTop: 24,
  },
  drawerContent: {
    flex: 1,
  },
  drawerHeader: {
    padding: 20,
    paddingTop: 40,
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  appTitle: {
    color: '#90caf9',
    marginTop: 4,
  },
  drawerItems: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 8,
    gap: 4,
  },
  drawerButton: {
    justifyContent: 'flex-start',
  },
  dimText: {
    color: '#9e9e9e',
  },
  warningText: {
    color: '#ff9800',
    marginTop: 4,
  },
});
