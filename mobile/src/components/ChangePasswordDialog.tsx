import React, { useState } from 'react';
import {
  Button,
  Dialog,
  HelperText,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import { StyleSheet, View } from 'react-native';
import { useAuthStore } from '../stores/authStore';

interface ChangePasswordDialogProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function ChangePasswordDialog({
  visible,
  onDismiss,
}: ChangePasswordDialogProps) {
  const { changePassword } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(false);
    setLoading(false);
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  const handleSubmit = async () => {
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 4) {
      setError('New password must be at least 4 characters');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(handleDismiss, 1200);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to change password',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss}>
        <Dialog.Title>Change Password</Dialog.Title>
        <Dialog.Content>
          <View style={styles.content}>
            {error && (
              <HelperText type="error" visible>
                {error}
              </HelperText>
            )}
            {success && (
              <Text style={styles.success}>Password changed successfully!</Text>
            )}

            <TextInput
              label="Current Password"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              autoFocus
              style={styles.input}
            />
            <TextInput
              label="New Password"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              style={styles.input}
            />
            <TextInput
              label="Confirm New Password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              style={styles.input}
            />
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleDismiss}>Cancel</Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={
              loading || !currentPassword || !newPassword || !confirmPassword
            }
            loading={loading}
          >
            Change
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 8,
  },
  input: {
    marginBottom: 4,
  },
  success: {
    color: '#66bb6a',
    marginBottom: 8,
  },
});
