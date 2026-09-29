import React, { useState } from 'react';
import { MapPin, ArrowRight, Lock, Mail, User, AlertCircle, Eye, EyeOff } from 'lucide-react';
import {
  PAPER,
  INK,
  PINE,
  BORDER,
  MUTED,
  CLAY,
  SERIF,
} from '../lib/constants';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { api, setAuthToken } from '../lib/api';

export interface AuthPageProps {
  onSuccess: (user: { id: string; email: string; name: string }) => void;
  onCancel: () => void;
  onJoinCode?: () => void;
  initialMode?: 'login' | 'signup';
}

export default function AuthPage({
  onSuccess,
  onCancel,
  onJoinCode,
  initialMode = 'login',
}: AuthPageProps) {
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!name.trim()) {
          throw new Error('Name is required');
        }
        const res = await api.auth.signup({
          email: email.trim(),
          password,
          name: name.trim(),
        });
        setAuthToken(res.token);
        onSuccess(res.user);
      } else {
        const res = await api.auth.login({
          email: email.trim(),
          password,
        });
        setAuthToken(res.token);
        onSuccess(res.user);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Authentication failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Quick fill for testing
  const handleQuickDemo = (userEmail: string, userName: string) => {
    setEmail(userEmail);
    setPassword('demopass123');
    setName(userName);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: PAPER,
        color: INK,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: '#fff',
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          boxShadow: '0 4px 20px rgba(36,33,28,0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '28px 32px 20px',
            borderBottom: `1px solid ${BORDER}`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 12,
              background: PINE,
              marginBottom: 16,
            }}
          >
            <MapPin color="#fff" size={22} />
          </div>
          <h1
            style={{
              ...SERIF,
              fontSize: 26,
              fontWeight: 400,
              margin: '0 0 8px',
            }}
          >
            {isSignUp ? 'Create your creator account' : 'Welcome back'}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: MUTED,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Trip creators need an account to create and manage group plans. Friends
            joining with a code do not need an account.
          </p>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${BORDER}`,
            background: '#FAF6EE',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError(null);
              setShowPassword(false);
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: !isSignUp ? '#fff' : 'transparent',
              fontWeight: !isSignUp ? 600 : 400,
              color: !isSignUp ? INK : MUTED,
              fontSize: 14,
              cursor: 'pointer',
              borderBottom: !isSignUp ? `2px solid ${PINE}` : 'none',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError(null);
              setShowPassword(false);
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              background: isSignUp ? '#fff' : 'transparent',
              fontWeight: isSignUp ? 600 : 400,
              color: isSignUp ? INK : MUTED,
              fontSize: 14,
              cursor: 'pointer',
              borderBottom: isSignUp ? `2px solid ${PINE}` : 'none',
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '10px 14px',
              borderRadius: 8,
              background: '#FBF0E8',
              border: `1px solid ${CLAY}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: CLAY,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 32px 32px' }}>
          {isSignUp && (
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="auth-name"
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: INK,
                }}
              >
                Your Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User
                  size={16}
                  color={MUTED}
                  style={{ position: 'absolute', left: 12, top: 12 }}
                />
                <input
                  id="auth-name"
                  type="text"
                  required={isSignUp}
                  placeholder="e.g. Alice Martin"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    background: '#fff',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="auth-email"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail
                size={16}
                color={MUTED}
                style={{ position: 'absolute', left: 12, top: 12 }}
              />
              <input
                id="auth-email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  background: '#fff',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="auth-password"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={16}
                color={MUTED}
                style={{ position: 'absolute', left: 12, top: 12 }}
              />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 38px',
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  background: '#fff',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: MUTED,
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <PrimaryButton
            type="submit"
            disabled={isLoading}
            style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
          >
            {isLoading ? (
              'Authenticating...'
            ) : isSignUp ? (
              <>
                Create Creator Account <ArrowRight size={16} />
              </>
            ) : (
              <>
                Sign In to Trips <ArrowRight size={16} />
              </>
            )}
          </PrimaryButton>

          <SecondaryButton
            type="button"
            onClick={onCancel}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Back to Home
          </SecondaryButton>

          {/* Quick Demo Personas */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: `1px dashed ${BORDER}`,
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: MUTED,
                display: 'block',
                marginBottom: 8,
              }}
            >
              Quick Test: Fill sample trip creator
            </span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => handleQuickDemo('alice@example.com', 'Alice')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: '#FAF6EE',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: INK,
                }}
              >
                Alice (Creator)
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('bob@example.com', 'Bob')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: '#FAF6EE',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: INK,
                }}
              >
                Bob (Member)
              </button>
            </div>
          </div>

          {onJoinCode && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                type="button"
                onClick={onJoinCode}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: PINE,
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Have a trip code instead? Join without an account
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
