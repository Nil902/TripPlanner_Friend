import React, { useState } from 'react';
import { MapPin, ArrowRight, Sparkles, LogIn } from 'lucide-react';
import {
  PAPER,
  INK,
  PINE,
  BORDER,
  MUTED,
  SERIF,
} from '../lib/constants';
import { PrimaryButton, SecondaryButton } from '../components/Button';

export interface WelcomePageProps {
  onStart: () => void;
  onJoin: (code: string) => void;
  onGoToAuth?: () => void;
  onLogout?: () => void;
  currentUser?: {
    name: string;
    email?: string;
    role?: 'creator' | 'joiner';
  } | null;
}

export default function WelcomePage({
  onStart,
  onJoin,
  onGoToAuth,
  onLogout,
  currentUser,
}: WelcomePageProps) {
  const [code, setCode] = useState('');

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onJoin(code.trim());
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: PAPER,
        color: INK,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          width: '100%',
          maxWidth: 500,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        {currentUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: MUTED }}>
              {currentUser.role === 'joiner' ? (
                <>
                  Joined as <strong>{currentUser.name}</strong>
                </>
              ) : (
                <>
                  Signed in as <strong>{currentUser.name}</strong>
                </>
              )}
            </span>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                style={{
                  padding: '4px 10px',
                  borderRadius: 16,
                  border: `1px solid ${BORDER}`,
                  background: '#fff',
                  fontSize: 12,
                  color: MUTED,
                  cursor: 'pointer',
                }}
              >
                {currentUser.role === 'joiner' ? 'Leave trip' : 'Sign out'}
              </button>
            )}
          </div>
        ) : onGoToAuth ? (
          <button
            type="button"
            onClick={onGoToAuth}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 20,
              border: `1px solid ${BORDER}`,
              background: '#fff',
              color: INK,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <LogIn size={13} color={PINE} /> Creator Sign In
          </button>
        ) : null}
      </div>

      <div style={{ maxWidth: 500, width: '100%', textAlign: 'center' }}>
        {/* Brand Icon */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: PINE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(43,76,63,0.2)',
            }}
          >
            <MapPin color="#fff" size={26} />
          </div>
        </div>

        {/* Headline */}
        <h1
          style={{
            ...SERIF,
            fontSize: 'clamp(26px, 6vw, 36px)',
            fontWeight: 400,
            lineHeight: 1.25,
            margin: '0 0 14px',
            color: INK,
          }}
        >
          Plan the trip, not the group chat
        </h1>

        <p
          style={{
            fontSize: 16,
            color: MUTED,
            lineHeight: 1.6,
            margin: '0 0 32px',
          }}
        >
          Everyone drops their dates, budget, and food needs. Our agent loop
          proposes and validates with map APIs, so you're not crossing town twice.
        </p>

        {/* Creator / Joiner CTA */}
        <PrimaryButton
          onClick={onStart}
          style={{
            width: '100%',
            justifyContent: 'center',
            marginBottom: 16,
            padding: '13px 20px',
            fontSize: 16,
          }}
        >
          <Sparkles size={16} />{' '}
          {currentUser?.role === 'joiner'
            ? 'Resume trip room'
            : 'Start a trip room'}{' '}
          <ArrowRight size={16} />
        </PrimaryButton>

        {/* Public Join Form */}
        <form
          onSubmit={handleJoinSubmit}
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 8,
            background: '#fff',
            padding: 6,
            borderRadius: 12,
            border: `1px solid ${BORDER}`,
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter trip code (e.g. lisbon-202)"
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: 14,
              background: 'transparent',
              outline: 'none',
            }}
          />
          <SecondaryButton
            type="submit"
            style={{ border: `1px solid ${BORDER}`, padding: '10px 18px' }}
          >
            Join
          </SecondaryButton>
        </form>

        {/* Clarification note requested in travel-itinerary-agent.md */}
        <div
          style={{
            marginTop: 20,
            padding: '12px 16px',
            borderRadius: 10,
            background: '#FAF6EE',
            border: `1px solid ${BORDER}`,
            fontSize: 13,
            color: MUTED,
            textAlign: 'left',
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 600, color: INK, display: 'block', marginBottom: 2 }}>
            Public & Creator Roles:
          </span>
          Joining a trip with a code doesn't require an account. Creating and managing
          itineraries requires an account so your trips remain securely saved.
        </div>
      </div>
    </div>
  );
}
