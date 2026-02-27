import React, { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform } from 'react-native';
import {
  Button,
  Card,
  HelperText,
  Text,
  TextInput,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuthStore } from '../stores/authStore';

export default function LoginScreen() {
  const { login, isLoading, error, clearError } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      await login(username, password);
    } catch {
      // Error is captured in the store
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'android' ? 'height' : 'padding'}
      style={styles.container}
    >
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.header}>
            <Icon name="radar" size={48} color="#90caf9" />
            <Text variant="headlineMedium" style={styles.title}>
              a-scanner
            </Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              Sign in to continue
            </Text>
          </View>

          {error && (
            <HelperText type="error" visible onPress={clearError}>
              {error}
            </HelperText>
          )}

          <TextInput
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            onSubmitEditing={handleLogin}
          />

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading || !username || !password}
            style={styles.button}
          >
            Sign In
          </Button>
        </Card.Content>
      </Card>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#121212',
  },
  card: {
    width: '100%',
    maxWidth: 380,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontWeight: 'bold',
    marginTop: 8,
  },
  subtitle: {
    color: '#9e9e9e',
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
});
