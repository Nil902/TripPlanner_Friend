import React, { useEffect, useState } from 'react';
import { X, Users, ArrowRight, CheckCircle2 } from 'lucide-react';
import { BORDER, INK, MUTED, PINE, SERIF } from '../lib/constants';
import { PrimaryButton, SecondaryButton } from './Button';

export interface JoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
  onJoin: (member: { name: string; initials: string; tripId: string }) => Promise<void>;
}

function tripIdFromInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const url = new URL(value);
    return url.searchParams.get('code')?.trim() || null;
  } catch {
    return null;
  }
}

export default function JoinModal({
  isOpen,
  onClose,
  initialCode = '',
  onJoin,
}: JoinModalProps) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (isOpen) setCode(initialCode);
  }, [isOpen, initialCode]);

  if (!isOpen) return null;

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }

    const cleanName = name.trim();
    const initials = cleanName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || cleanName.slice(0, 2).toUpperCase();

    const tripId = tripIdFromInput(code);
    if (!tripId) {
      setError('Enter a trip code or a valid invitation link.');
      return;
    }
    setIsJoining(true);
    setError(null);
    try {
      await onJoin({ name: cleanName, initials, tripId });
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to join this trip.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(36, 33, 28, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-modal-title"
        aria-describedby="join-modal-description"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        style={{
          background: '#fff',
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          maxWidth: 440,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FAF6EE',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: PINE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users color="#fff" size={16} />
            </div>
            <div>
              <h2
                id="join-modal-title"
                style={{
                  ...SERIF,
                  fontSize: 20,
                  fontWeight: 400,
                  margin: 0,
                  color: INK,
                }}
              >
                Join Trip Room
              </h2>
              <span id="join-modal-description" style={{ fontSize: 12, color: MUTED }}>
                No account required to join and submit constraints
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close join modal"
            title="Close"
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            style={{
              border: 'none',
              background: 'transparent',
              color: MUTED,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Reassurance Banner */}
        <div
          style={{
            margin: '16px 24px 0',
            padding: '10px 14px',
            borderRadius: 8,
            background: '#EEF3ED',
            border: `1px solid #D5E2D4`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: '#3A623A',
          }}
        >
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span>Public access: You can set your dates, budget, and dietary preferences instantly.</span>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              margin: '12px 24px 0',
              padding: '8px 12px',
              borderRadius: 8,
              background: '#FBF0E8',
              color: '#C1683F',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleJoin} style={{ padding: 24, overflowY: 'auto' }}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="join-code"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              Trip Code or Invitation Link
            </label>
            <input
              id="join-code"
              type="text"
              placeholder="Paste a trip code or invitation link"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus={!initialCode}
              className="focus-visible:ring-2 focus-visible:ring-emerald-700"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                fontSize: 14,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="join-name"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              Your Name
            </label>
            <input
              id="join-name"
              type="text"
              required
              placeholder="e.g. Cara"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={Boolean(initialCode)}
              className="focus-visible:ring-2 focus-visible:ring-emerald-700"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                fontSize: 14,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <SecondaryButton type="button" onClick={onClose}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isJoining}>
              {isJoining ? 'Joining…' : 'Enter Trip Room'} <ArrowRight size={16} />
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
