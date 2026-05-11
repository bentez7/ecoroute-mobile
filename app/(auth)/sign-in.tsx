import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';

export default function SignInScreen() {
  const { login, signInWithGoogle, signInWithApple } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  function extractError(err: unknown, fallback: string): string {
    return (
      (err as { message?: string })?.message ??
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
      fallback
    );
  }

  async function handleSignIn() {
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: unknown) {
      setError(extractError(err, 'Sign in failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setError('');
    setOauthLoading(provider);
    try {
      if (provider === 'google') await signInWithGoogle();
      else await signInWithApple();
    } catch (err: unknown) {
      setError(extractError(err, `${provider === 'google' ? 'Google' : 'Apple'} sign in failed.`));
    } finally {
      setOauthLoading(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <MaterialIcons color="#FFFFFF" name="navigation" size={28} />
          </View>
          <Text style={styles.brand}>EcoRoute</Text>
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue tracking your carbon footprint</Text>

        {/* Form */}
        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <MaterialIcons color="#DC2626" name="error-outline" size={16} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="driver@example.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}>
                <MaterialIcons
                  color="#6B7280"
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={20}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.btn, (loading || !!oauthLoading) && styles.btnDisabled]}
            onPress={handleSignIn}
            disabled={loading || !!oauthLoading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.btnText}>Sign In</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={[styles.oauthBtn, (loading || !!oauthLoading) && styles.btnDisabled]}
            onPress={() => handleOAuth('google')}
            disabled={loading || !!oauthLoading}>
            {oauthLoading === 'google' ? (
              <ActivityIndicator color="#1B2B45" />
            ) : (
              <>
                <FontAwesome color="#DB4437" name="google" size={18} />
                <Text style={styles.oauthBtnText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {Platform.OS === 'ios' ? (
            <Pressable
              style={[styles.appleBtn, (loading || !!oauthLoading) && styles.btnDisabled]}
              onPress={() => handleOAuth('apple')}
              disabled={loading || !!oauthLoading}>
              {oauthLoading === 'apple' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <FontAwesome color="#FFFFFF" name="apple" size={20} />
                  <Text style={styles.appleBtnText}>Continue with Apple</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up" style={styles.link}>
            Sign up
          </Link>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1B2B45' },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 32 },
  logoBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },

  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 15, marginBottom: 32, lineHeight: 22 },

  form: { gap: 16 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: '#DC2626', fontSize: 14, flex: 1 },

  field: { gap: 6 },
  label: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  btn: {
    backgroundColor: '#16A34A',
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  dividerText: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },

  oauthBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  oauthBtnText: { color: '#1B2B45', fontSize: 15, fontWeight: '700' },

  appleBtn: {
    backgroundColor: '#000000',
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  appleBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { color: 'rgba(255,255,255,0.55)', fontSize: 15 },
  link: { color: '#4ADE80', fontSize: 15, fontWeight: '700' },
});
