import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  ArrowLeft,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  Server,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  PINE,
  SERIF,
} from '../../lib/constants';
import { PrimaryButton } from '../../components/Button';
import { api, setAdminToken } from '../../lib/api';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
}

export interface AdminLoginPageProps {
  onLoginSuccess: (adminUser: AdminUser) => void;
  onBackToApp: () => void;
}

export default function AdminLoginPage({
  onLoginSuccess,
  onBackToApp,
}: AdminLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [securityPin, setSecurityPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.admin.login({
        email: email.trim(),
        password: password.trim(),
      });

      setAdminToken(res.token);
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Invalid administrator credentials. Administrator privileges required.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setEmail('admin@antigravity.travel');
    setPassword('admin12345');
    setSecurityPin('9942');
    setError(null);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#181614', // Elevated dark graphite background for admin terminal
        color: '#FAF6EE',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* Back button */}
      <div style={{ maxWidth: 440, width: '100%', marginBottom: 20 }}>
        <button
          type="button"
          onClick={onBackToApp}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            border: 'none',
            background: 'transparent',
            color: '#A09888',
            fontSize: 13,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <ArrowLeft size={16} /> Return to Travel App
        </button>
      </div>

      {/* Main Card */}
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          background: '#24211C',
          border: '1px solid #3A352D',
          borderRadius: 16,
          padding: '36px 32px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          boxSizing: 'border-box',
        }}
      >
        {/* Header with Security Badge */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: PINE,
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 4px 12px rgba(43,76,63,0.4)',
            }}
          >
            <ShieldCheck size={28} />
          </div>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
              color: '#9EC4B5',
              background: 'rgba(43,76,63,0.3)',
              padding: '4px 10px',
              borderRadius: 20,
              marginBottom: 8,
            }}
          >
            <Lock size={11} /> Secured Platform Terminal
          </span>

          <h1
            style={{
              ...SERIF,
              fontSize: 26,
              fontWeight: 400,
              margin: '6px 0 6px',
              color: '#FAF6EE',
            }}
          >
            System Administration
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#A09888',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            Restricted access for platform administrators and system operators.
          </p>
        </div>

        {/* Error message banner */}
        {error && (
          <div
            style={{
              background: 'rgba(179, 67, 46, 0.15)',
              border: '1px solid #B3432E',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <AlertCircle size={16} color="#E87864" style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#FAD1C9', lineHeight: 1.4 }}>
              {error}
            </span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              htmlFor="admin-email"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#D5CDBF',
                marginBottom: 6,
              }}
            >
              Administrator Email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@antigravity.travel"
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: 8,
                border: '1px solid #484238',
                background: '#1A1815',
                color: '#FAF6EE',
                fontSize: 14,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#D5CDBF',
                marginBottom: 6,
              }}
            >
              Security Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '11px 40px 11px 14px',
                  borderRadius: 8,
                  border: '1px solid #484238',
                  background: '#1A1815',
                  color: '#FAF6EE',
                  fontSize: 14,
                  boxSizing: 'border-box',
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
                  color: '#7E7667',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <label
                htmlFor="admin-pin"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#D5CDBF',
                }}
              >
                Admin Master PIN (Optional)
              </label>
              <span style={{ fontSize: 11, color: '#7E7667' }}>2FA / Hardware Key</span>
            </div>
            <div style={{ position: 'relative' }}>
              <KeyRound
                size={15}
                color="#7E7667"
                style={{ position: 'absolute', left: 12, top: 12 }}
              />
              <input
                id="admin-pin"
                type="password"
                maxLength={6}
                value={securityPin}
                onChange={(e) => setSecurityPin(e.target.value)}
                placeholder="0000"
                style={{
                  width: '100%',
                  padding: '11px 14px 11px 36px',
                  borderRadius: 8,
                  border: '1px solid #484238',
                  background: '#1A1815',
                  color: '#FAF6EE',
                  fontSize: 14,
                  letterSpacing: '0.2em',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <PrimaryButton
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px 20px',
                fontSize: 14,
                fontWeight: 600,
                background: PINE,
                color: '#fff',
                borderRadius: 8,
                boxShadow: '0 4px 14px rgba(43,76,63,0.35)',
              }}
            >
              {loading ? 'Authenticating Terminal...' : 'Authenticate as Administrator'}
            </PrimaryButton>
          </div>
        </form>

        {/* Demo Credentials Helper */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: '1px solid #36312A',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 12, color: '#8A8272', margin: '0 0 10px' }}>
            Testing or evaluating system management?
          </p>
          <button
            type="button"
            onClick={handleFillDemo}
            style={{
              background: 'transparent',
              border: '1px dashed #524B3F',
              borderRadius: 6,
              padding: '6px 14px',
              color: '#C6BFA5',
              fontSize: 12,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <CheckCircle2 size={13} color="#9EC4B5" /> Auto-fill Demo Admin Credentials
          </button>
        </div>
      </div>

      {/* Footer info */}
      <footer
        style={{
          marginTop: 32,
          textAlign: 'center',
          fontSize: 12,
          color: '#655F55',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Server size={13} /> Node: ap-southeast-1
        </span>
        <span>•</span>
        <span>Version 1.0.0-admin</span>
        <span>•</span>
        <span>TLS 1.3 Strict</span>
      </footer>
    </div>
  );
}
