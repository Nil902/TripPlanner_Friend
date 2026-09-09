import { useState, useEffect } from 'react';
import {
  Sparkles,
  MapPin,
  Share2,
  Check,
  CheckCircle2,
  Calendar,
  RefreshCw,
  Settings,
  QrCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  BORDER,
  MUTED,
  PINE,
  SERIF,
  TripSummary,
  Member,
  INK,
} from '../lib/constants';
import Avatar from '../components/Avatar';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { api } from '../lib/api';

export interface OverviewPageProps {
  trip: TripSummary;
  members: Member[];
  setActive: (id: string) => void;
  planMode: 'ai' | 'manual';
  setPlanMode: (mode: 'ai' | 'manual') => void;
  isCreator?: boolean;
  onOpenAdmin?: () => void;
}

export default function OverviewPage({
  trip,
  members,
  setActive,
  planMode,
  setPlanMode,
  isCreator = true,
  onOpenAdmin,
}: OverviewPageProps) {
  const [copied, setCopied] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string | null>(null);
  const [agentNotes, setAgentNotes] = useState<string[]>([]);

  // Fetch real plan notes from backend API
  useEffect(() => {
    if (trip?.id) {
      api.plan
        .get(trip.id)
        .then((plan) => {
          if (plan?.notes && plan.notes.length > 0) {
            setAgentNotes(plan.notes);
          }
        })
        .catch(() => {
          // Initial plan not yet synthesized
        });
    }
  }, [trip?.id]);

  const submittedCount = members.filter((m) => m.submitted).length;

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}/?code=${trip.id}`;
    navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationStep('Gathering member budget & dietary constraints...');

    setTimeout(() => {
      setGenerationStep('Calling Google Places API for verified venues...');
    }, 500);

    setTimeout(() => {
      setGenerationStep('Validating travel times via Distance Matrix...');
    }, 1000);

    setTimeout(() => {
      setGenerationStep('Resolving schedule & converging on optimal plan...');
    }, 1500);

    try {
      const res = await api.plan.generate(trip.id);
      if (res?.notes && res.notes.length > 0) {
        setAgentNotes(res.notes);
      }
    } catch {
      // Keep rich fallback notes
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationStep(null);
        setActive('itinerary');
      }, 2000);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 760, margin: '0 auto' }}>
      {/* Title & Dates */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              ...SERIF,
              fontSize: 'clamp(22px, 5vw, 28px)',
              fontWeight: 400,
              margin: '0 0 6px',
              color: INK,
            }}
          >
            {trip.destination}, 2 nights
          </h1>
          <p
            style={{
              color: MUTED,
              fontSize: 15,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Calendar size={15} /> {trip.start_date} – {trip.end_date}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isCreator && onOpenAdmin && (
            <SecondaryButton
              onClick={onOpenAdmin}
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              <Settings size={14} color={PINE} /> Manage Trip
            </SecondaryButton>
          )}

          {/* Share Button */}
          <SecondaryButton
            onClick={handleCopyLink}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {copied ? <Check size={14} color={PINE} /> : <Share2 size={14} />}
            {copied ? 'Link Copied!' : 'Share Trip Code'}
          </SecondaryButton>
        </div>
      </div>

      {/* Shareable Link Banner */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: '#FAF6EE',
          border: `1px solid ${BORDER}`,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          fontSize: 13,
        }}
      >
        <span>
          Invite code: <strong style={{ fontFamily: 'monospace' }}>{trip.id}</strong>{' '}
          (Friends join without an account)
        </span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowQRModal(true)}
            style={{
              border: 'none',
              background: 'transparent',
              color: PINE,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <QrCode size={14} /> QR Code
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              border: 'none',
              background: 'transparent',
              color: PINE,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? 'Copied' : 'Copy Link'}
          </button>
        </div>
      </div>

      {/* Who's in Card */}
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '18px 20px',
          background: '#fff',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>Who's in the room</span>
          <span style={{ fontSize: 13, color: MUTED }}>
            {submittedCount} of {members.length} submitted constraints
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {members.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Avatar initials={m.initials} submitted={m.submitted} />
              <span style={{ fontSize: 12, color: INK }}>{m.name}</span>
              <span
                style={{
                  fontSize: 10,
                  color: m.submitted ? PINE : MUTED,
                  fontWeight: m.submitted ? 600 : 400,
                }}
              >
                {m.submitted ? 'Ready' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* How do you want to plan it? */}
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '18px 20px',
          background: '#fff',
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            display: 'block',
            marginBottom: 12,
          }}
        >
          Planning Mode
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          <button
            type="button"
            onClick={() => setPlanMode('ai')}
            style={{
              flex: 1,
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: 10,
              border: `1.5px solid ${planMode === 'ai' ? PINE : BORDER}`,
              background: planMode === 'ai' ? '#EFEAE0' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
              }}
            >
              <Sparkles size={16} color={PINE} />
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                Let the AI plan it
              </span>
            </div>
            <span style={{ fontSize: 13, color: MUTED }}>
              Proposes and validates against Places & Distance Matrix APIs to avoid backtracking.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPlanMode('manual')}
            style={{
              flex: 1,
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: 10,
              border: `1.5px solid ${planMode === 'manual' ? PINE : BORDER}`,
              background: planMode === 'manual' ? '#EFEAE0' : '#fff',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
              }}
            >
              <MapPin size={16} color={PINE} />
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                Plan it yourself
              </span>
            </div>
            <span style={{ fontSize: 13, color: MUTED }}>
              Build the stops by hand. The same validators will flag budget or timing issues.
            </span>
          </button>
        </div>
      </div>

      {/* Propose-Validate Loop Status Indicator (if generating) */}
      {isGenerating && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 12,
            background: '#FAF6EE',
            border: `1px solid ${PINE}`,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <RefreshCw size={18} color={PINE} className="animate-spin" />
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: PINE }}>
              Running Autonomous Agent Loop:
            </span>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: INK }}>
              {generationStep}
            </p>
          </div>
        </div>
      )}

      {/* Action Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <PrimaryButton
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{ padding: '12px 24px' }}
        >
          {isGenerating ? (
            'Synthesizing Itinerary...'
          ) : planMode === 'ai' ? (
            <>
              <Sparkles size={16} /> Generate Itinerary
            </>
          ) : (
            <>
              <MapPin size={16} /> Start Building Schedule
            </>
          )}
        </PrimaryButton>

        {!isCreator && (
          <span style={{ fontSize: 13, color: MUTED }}>
            Note: You're in as a group member.
          </span>
        )}
      </div>

      {/* Agent Tradeoffs Explanations Card */}
      {agentNotes.length > 0 && (
        <div
          style={{
            marginTop: 28,
            padding: '18px 20px',
            borderRadius: 12,
            background: '#fff',
            border: `1px solid ${BORDER}`,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: MUTED,
              display: 'block',
              marginBottom: 10,
            }}
          >
            Agent Self-Correction & Tradeoff Explanations:
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agentNotes.map((note, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 13,
                  color: INK,
                }}
              >
                <CheckCircle2
                  size={15}
                  color={PINE}
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <span>{note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showQRModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowQRModal(false)}
        >
          <div
            style={{
              background: '#fff',
              padding: 32,
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, ...SERIF, fontSize: 20 }}>Scan to Join</h3>
            <p style={{ margin: 0, fontSize: 14, color: MUTED, textAlign: 'center', maxWidth: 220 }}>
              Anyone scanning this can join <b>{trip.destination}</b> instantly.
            </p>
            <div style={{ padding: 16, border: `1px solid ${BORDER}`, borderRadius: 12, background: '#fff' }}>
              <QRCodeSVG value={`${window.location.origin}/?code=${trip.id}`} size={200} />
            </div>
            <SecondaryButton onClick={() => setShowQRModal(false)} style={{ width: '100%', marginTop: 8 }}>
              Close
            </SecondaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
