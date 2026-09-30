import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Users,
  Sparkles,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  Lock,
  X,
  Settings,
  ArrowLeft,
  CheckCircle2,
  Menu,
} from 'lucide-react';
import {
  INK,
  PAPER,
  PINE,
  PINE_DARK,
  CLAY,
  BORDER,
  MUTED,
  SERIF,
  TripSummary,
  Member,
} from '../lib/constants';
import Avatar from '../components/Avatar';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { api } from '../lib/api';
import { useResponsive } from '../lib/useResponsive';
import { RequireAuth } from '../middleware';
import { CurrentUser } from '../App';

const RED = '#B3432E';

export interface PlanRun {
  version: number;
  status: 'valid' | 'partial' | 'invalid';
  createdAt: string;
  note: string;
}

function StatusBadge({ status }: { status: 'valid' | 'partial' | 'invalid' }) {
  const map = {
    valid: { bg: '#E7F0EA', fg: PINE_DARK, label: 'Valid' },
    partial: { bg: '#FBF0E8', fg: CLAY, label: 'Partial' },
    invalid: { bg: '#F7E7E3', fg: RED, label: 'Invalid' },
  };
  const s = map[status] || map.valid;
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 20,
        background: s.bg,
        color: s.fg,
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {s.label}
    </span>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h3
        style={{
          ...SERIF,
          fontSize: 20,
          fontWeight: 400,
          margin: '0 0 4px',
          color: INK,
        }}
      >
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 18px', lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 1. Trip Settings Section
// -----------------------------------------------------------------------------
interface TripSettingsProps {
  trip: TripSummary;
  onUpdateTrip: (updated: TripSummary) => void;
}

function TripSettings({ trip, onUpdateTrip }: TripSettingsProps) {
  const [title, setTitle] = useState(trip.title);
  const [destination, setDestination] = useState(trip.destination);
  const [startDate, setStartDate] = useState(trip.start_date);
  const [endDate, setEndDate] = useState(trip.end_date);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !destination.trim()) {
      setError('Title and destination are required.');
      return;
    }
    if (endDate < startDate) {
      setError('End date must be on or after start date.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const updated = await api.trips.update(trip.id, {
        title: title.trim(),
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
      });

      const fullSummary: TripSummary = {
        ...trip,
        title: updated.title,
        destination: updated.destination,
        start_date: String(updated.start_date),
        end_date: String(updated.end_date),
      };

      onUpdateTrip(fullSummary);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update trip settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title="Trip Settings"
      description="Update core trip details, destination, and traveling dates. Changes reflect for all members in the room."
    >
      <div
        style={{
          background: '#fff',
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 540,
        }}
      >
        {saveSuccess && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: '#EEF3ED',
              border: '1px solid #D5E2D4',
              color: '#3A623A',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <CheckCircle2 size={16} /> Trip details saved successfully!
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: '#FBF0E8',
              border: '1px solid #F0D7CB',
              color: CLAY,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                display: 'block',
                marginBottom: 6,
                color: INK,
              }}
            >
              Trip Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                display: 'block',
                marginBottom: 6,
                color: INK,
              }}
            >
              Destination
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
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

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: 6,
                  color: INK,
                }}
              >
                Starts
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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
            <div style={{ flex: 1 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: 6,
                  color: INK,
                }}
              >
                Ends
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
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
          </div>

          <PrimaryButton type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </PrimaryButton>
        </form>
      </div>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// 2. Members Section
// -----------------------------------------------------------------------------
interface MembersProps {
  trip: TripSummary;
  members: Member[];
  onUpdateMembers: (members: Member[]) => void;
  onUpdateTrip: (updated: TripSummary) => void;
}

function MemberRow({
  m,
  creatorId,
  onRemove,
}: {
  m: Member;
  creatorId?: string;
  onRemove: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const isCreator = m.role === 'creator' || (creatorId ? m.id === creatorId : false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 4px',
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <Avatar initials={m.initials} submitted={m.submitted} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{m.name}</span>
          {isCreator && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: PINE,
                fontWeight: 600,
                background: '#E7F0EA',
                padding: '2px 8px',
                borderRadius: 12,
              }}
            >
              <ShieldCheck size={12} /> Creator
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: MUTED }}>
          {m.submitted ? 'Submitted plans & constraints' : 'Pending constraint submission'}
        </span>
      </div>

      {!isCreator && (
        <div>
          {confirming ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: MUTED }}>Remove {m.name}?</span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: INK,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemove(m.id);
                  setConfirming(false);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: `1px solid ${RED}`,
                  background: '#fff',
                  color: RED,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              style={{
                background: 'none',
                border: 'none',
                color: MUTED,
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
              }}
            >
              <X size={14} /> Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Members({
  trip,
  members,
  onUpdateMembers,
  onUpdateTrip,
}: MembersProps) {
  const [error, setError] = useState<string | null>(null);
  const handleRemove = async (memberId: string) => {
    const updatedMemberIds = (trip.member_ids || []).filter((id) => id !== memberId);
    setError(null);
    try {
      await api.trips.update(trip.id, { member_ids: updatedMemberIds });
      onUpdateMembers(members.filter((m) => m.id !== memberId));
      onUpdateTrip({ ...trip, member_ids: updatedMemberIds });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove the member.');
    }
  };

  return (
    <Section
      title="Trip Members"
      description="Anyone with the trip code can join and submit preferences. As creator, you can review submissions and manage the room."
    >
      {error && <p role="alert" style={{ color: CLAY }}>{error}</p>}
      <div
        style={{
          background: '#fff',
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '8px 20px',
          maxWidth: 540,
        }}
      >
        {members.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTED, padding: '16px 0' }}>
            No members have joined yet. Share your trip code to invite friends.
          </p>
        ) : (
          members.map((m) => (
            <MemberRow
              key={m.id}
              m={m}
              creatorId={trip.creator_id}
              onRemove={handleRemove}
            />
          ))
        )}
      </div>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// 3. Agent Runs & Versions Section
// -----------------------------------------------------------------------------
interface AgentRunsProps {
  tripId: string;
}

function AgentRuns({ tripId }: AgentRunsProps) {
  const [runs, setRuns] = useState<PlanRun[]>([]);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // Fetch saved versions and their actual notes.
  useEffect(() => {
    setLoading(true);
    api.plan.versions(tripId)
      .then(async (versions) => {
        const plans = await Promise.all(versions.map((version) => api.plan.get(tripId, version.version)));
        setRuns(plans.map((plan) => ({
          version: plan.version,
          status: plan.validation_status as PlanRun['status'],
          createdAt: new Date(plan.created_at).toLocaleString(),
          note: plan.notes.join('; ') || 'No plan notes recorded.',
        })));
        setExpandedVersion(plans[0]?.version ?? null);
      })
      .catch((err: unknown) => {
        setRuns([]);
        setMessage(err instanceof Error ? err.message : 'Could not load plan versions.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [tripId]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    setMessage(null);
    try {
      const newPlan = await api.plan.generate(tripId);
      const newRun: PlanRun = {
        version: newPlan.version,
        status: newPlan.validation_status as PlanRun['status'],
        createdAt: new Date(newPlan.created_at).toLocaleString(),
        note: newPlan.notes.join('; ') || 'No plan notes recorded.',
      };
      setRuns((prev) => [newRun, ...prev.filter((r) => r.version !== newRun.version)]);
      setExpandedVersion(newRun.version);
      setMessage(`Version ${newPlan.version} synthesized successfully!`);
      setTimeout(() => setMessage(null), 4000);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Planning failed.');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Section
      title="Agent Runs & Version History"
      description="Each saved itinerary version is available for review with its validation status and notes."
    >
      <div style={{ maxWidth: 580 }}>
        <div style={{ marginBottom: 20 }}>
          <PrimaryButton onClick={handleRegenerate} disabled={regenerating}>
            <Sparkles size={16} />{' '}
            {regenerating ? 'Running agent loop...' : 'Regenerate Itinerary'}
          </PrimaryButton>
        </div>

        {message && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: '#EEF3ED',
              border: '1px solid #D5E2D4',
              color: '#3A623A',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {message}
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: MUTED, padding: '12px 0' }}>Loading plan versions from server...</p>
        ) : runs.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              borderRadius: 8,
              border: `1px dashed ${BORDER}`,
              textAlign: 'center',
              color: MUTED,
              fontSize: 13,
              background: '#fff',
            }}
          >
            No plan versions generated yet. Click "Regenerate Itinerary" above to run the agent planning loop.
          </div>
        ) : (
          runs.map((run) => {
          const isExpanded = expandedVersion === run.version;
          return (
            <div
              key={run.version}
              style={{
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                marginBottom: 12,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedVersion(isExpanded ? null : run.version)
                }
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                    Version {run.version}
                  </span>
                  <StatusBadge status={run.status} />
                  <span style={{ fontSize: 12, color: MUTED }}>{run.createdAt}</span>
                </div>
                <ChevronDown
                  size={16}
                  color={MUTED}
                  style={{
                    transform: isExpanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}
                />
              </button>

              {isExpanded && (
                <div
                  style={{
                    padding: '0 18px 16px',
                    borderTop: `1px solid ${BORDER}`,
                    background: '#FAF8F5',
                  }}
                >
                  <p style={{ fontSize: 13, color: INK, margin: '14px 0 16px', lineHeight: 1.5 }}>
                    <strong>Plan notes:</strong>{' '}
                    <span style={{ color: MUTED }}>{run.note}</span>
                  </p>
                </div>
              )}
            </div>
          );
        }))}
      </div>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// 4. Danger Zone Section
// -----------------------------------------------------------------------------
interface DangerZoneProps {
  trip: TripSummary;
  onUpdateTrip: (updated: TripSummary) => void;
  onDeleteTrip: (tripId: string) => void;
}

function DangerZone({ trip, onUpdateTrip, onDeleteTrip }: DangerZoneProps) {
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClosed = trip.status === 'completed';

  const handleCloseTrip = async () => {
    setClosing(true);
    setError(null);
    try {
      const updated = await api.trips.update(trip.id, { status: 'completed' });
      onUpdateTrip({ ...trip, status: updated.status });
      setConfirmingClose(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not close the trip.');
    } finally {
      setClosing(false);
    }
  };

  const handleDeleteTrip = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.trips.delete(trip.id);
      onDeleteTrip(trip.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete the trip.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Section title="Danger Zone">
      {error && <p role="alert" style={{ color: RED }}>{error}</p>}
      <div style={{ maxWidth: 580, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Close Trip Card */}
        <div
          style={{
            border: '1px solid #EBD3CB',
            borderRadius: 10,
            padding: '18px 20px',
            background: '#FBF3F0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertTriangle size={18} color={RED} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px', color: INK }}>
                {isClosed ? 'Trip is Closed' : 'Close this trip'}
              </p>
              <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.5 }}>
                {isClosed
                  ? 'This trip is currently marked as completed. Members have read-only access.'
                  : 'Members will retain read-only access to the final plan and costs. No one will be able to submit new constraints or trigger new agent runs.'}
              </p>
            </div>
          </div>

          {!isClosed && (
            <div style={{ marginTop: 14, paddingLeft: 30 }}>
              {confirmingClose ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleCloseTrip}
                    disabled={closing}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: RED,
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {closing ? 'Closing...' : 'Yes, close the trip'}
                  </button>
                  <SecondaryButton
                    onClick={() => setConfirmingClose(false)}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    Cancel
                  </SecondaryButton>
                </div>
              ) : (
                <SecondaryButton
                  onClick={() => setConfirmingClose(true)}
                  style={{
                    color: RED,
                    borderColor: RED,
                    fontSize: 13,
                    padding: '6px 14px',
                  }}
                >
                  <Trash2 size={14} /> Close trip
                </SecondaryButton>
              )}
            </div>
          )}
        </div>

        {/* Delete Trip Card */}
        <div
          style={{
            border: '1px solid #EBD3CB',
            borderRadius: 10,
            padding: '18px 20px',
            background: '#FBF3F0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Trash2 size={18} color={RED} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px', color: INK }}>
                Permanently delete trip
              </p>
              <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.5 }}>
                Irrevocably remove this trip, its itineraries, member constraints, and expense records from the database.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 14, paddingLeft: 30 }}>
            {confirmingDelete ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleDeleteTrip}
                  disabled={deleting}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: RED,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {deleting ? 'Deleting...' : 'Yes, delete permanently'}
                </button>
                <SecondaryButton
                  onClick={() => setConfirmingDelete(false)}
                  style={{ padding: '6px 12px', fontSize: 13 }}
                >
                  Cancel
                </SecondaryButton>
              </div>
            ) : (
              <SecondaryButton
                onClick={() => setConfirmingDelete(true)}
                style={{
                  color: RED,
                  borderColor: RED,
                  fontSize: 13,
                  padding: '6px 14px',
                }}
              >
                <Trash2 size={14} /> Delete trip permanently
              </SecondaryButton>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Admin Sidebar
// -----------------------------------------------------------------------------
interface AdminSidebarProps {
  active: 'settings' | 'members' | 'runs' | 'danger';
  setActive: (tab: 'settings' | 'members' | 'runs' | 'danger') => void;
  tripTitle: string;
  onBackToRoom: () => void;
  onBackToDashboard?: () => void;
  onCloseMobile?: () => void;
  isMobileOpen?: boolean;
}

function AdminSidebar({
  active,
  setActive,
  tripTitle,
  onBackToRoom,
  onBackToDashboard,
  onCloseMobile,
  isMobileOpen = false,
}: AdminSidebarProps) {
  const items = [
    { id: 'settings', label: 'Trip settings', icon: Settings },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'runs', label: 'Agent runs', icon: Sparkles },
    { id: 'danger', label: 'Danger zone', icon: AlertTriangle },
  ] as const;

  const content = (
    <div
      style={{
        width: 250,
        maxWidth: '100%',
        height: '100%',
        padding: '24px 16px',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 8px',
            marginBottom: 4,
            minWidth: 0,
            width: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: PINE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MapPin color="#fff" size={15} />
          </div>
          <span
            style={{
              ...SERIF,
              fontSize: 17,
              fontWeight: 600,
              color: INK,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
            title={tripTitle}
          >
            {tripTitle}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '0 8px',
            marginBottom: 24,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <Lock size={12} color={MUTED} style={{ flexShrink: 0 }} />
          <span
            style={{
              fontSize: 12,
              color: MUTED,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            Admin — visible to creator
          </span>
        </div>

        {/* Navigation items */}
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                setActive(it.id);
                if (onCloseMobile) onCloseMobile();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                background: isActive ? '#EFEAE0' : 'transparent',
                color: isActive ? PINE_DARK : INK,
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                marginBottom: 3,
                textAlign: 'left',
                transition: 'background 0.15s ease',
              }}
            >
              <Icon size={17} color={isActive ? PINE : MUTED} />
              {it.label}
            </button>
          );
        })}
      </div>

      {/* Back to Room / Dashboard Footer */}
      <div
        style={{
          paddingTop: 16,
          borderTop: `1px solid ${BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {onBackToDashboard && (
          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              onBackToDashboard();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: MUTED,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (onCloseMobile) onCloseMobile();
            onBackToRoom();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: MUTED,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} /> Back to Trip Room
        </button>
      </div>
    </div>
  );

  // Mobile Drawer
  if (onCloseMobile) {
    if (!isMobileOpen) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex' }}>
        <div
          role="presentation"
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(36, 33, 28, 0.4)',
            backdropFilter: 'blur(2px)',
          }}
        />
        <div
          style={{
            position: 'relative',
            zIndex: 91,
            height: '100%',
            boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
            background: '#fff',
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  // Desktop inline sidebar
  return (
    <div
      style={{
        width: 250,
        minWidth: 250,
        maxWidth: 250,
        flexShrink: 0,
        borderRight: `1px solid ${BORDER}`,
        background: '#fff',
        height: '100vh',
        position: 'sticky',
        top: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {content}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main OwnerTripPage Export
// -----------------------------------------------------------------------------
export interface OwnerTripPageProps {
  trip: TripSummary;
  members: Member[];
  onUpdateTrip: (updated: TripSummary) => void;
  onUpdateMembers: (members: Member[]) => void;
  onDeleteTrip: (tripId: string) => void;
  onBackToRoom: () => void;
  onBackToDashboard?: () => void;
  currentUser?: CurrentUser | null;
  onRequireLogin?: () => void;
}

export default function OwnerTripPage({
  trip,
  members,
  onUpdateTrip,
  onUpdateMembers,
  onDeleteTrip,
  onBackToRoom,
  onBackToDashboard,
  currentUser,
  onRequireLogin,
}: OwnerTripPageProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'members' | 'runs' | 'danger'>('settings');
  const { isMobile } = useResponsive();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  return (
    <RequireAuth
      currentUser={currentUser}
      requiredRole="creator"
      screen="owner"
      onRedirect={onRequireLogin || onBackToRoom}
    >
      <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        background: PAPER,
        color: INK,
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* Mobile Top Header */}
      {isMobile && (
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            background: '#fff',
            borderBottom: `1px solid ${BORDER}`,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                background: '#FAF6EE',
                color: INK,
                cursor: 'pointer',
              }}
              aria-label="Open admin navigation"
            >
              <Menu size={18} />
            </button>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: INK, display: 'block' }}>
                {trip.title}
              </span>
              <span style={{ fontSize: 11, color: PINE, fontWeight: 500, textTransform: 'capitalize' }}>
                Admin: {activeTab}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToRoom}
            style={{
              fontSize: 12,
              color: MUTED,
              background: 'transparent',
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            Back to Room
          </button>
        </header>
      )}

      {/* Admin Sidebar */}
      {!isMobile ? (
        <AdminSidebar
          active={activeTab}
          setActive={setActiveTab}
          tripTitle={trip.title}
          onBackToRoom={onBackToRoom}
          onBackToDashboard={onBackToDashboard}
        />
      ) : (
        <AdminSidebar
          active={activeTab}
          setActive={setActiveTab}
          tripTitle={trip.title}
          onBackToRoom={onBackToRoom}
          onBackToDashboard={onBackToDashboard}
          isMobileOpen={isMobileDrawerOpen}
          onCloseMobile={() => setIsMobileDrawerOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: isMobile ? '20px 16px 40px 16px' : '36px 48px',
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 760, margin: '0 auto' }}>
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 28,
              borderBottom: `1px solid ${BORDER}`,
              paddingBottom: 16,
            }}
          >
            <div>
              <h2
                style={{
                  ...SERIF,
                  fontSize: 24,
                  fontWeight: 400,
                  margin: '0 0 4px',
                  color: INK,
                }}
              >
                Manage: {trip.title}
              </h2>
              <span style={{ fontSize: 13, color: MUTED }}>
                Creator Admin Panel · Full CRUD access
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {onBackToDashboard && (
                <SecondaryButton
                  onClick={onBackToDashboard}
                  style={{ fontSize: 13, padding: '6px 12px' }}
                >
                  All Trips
                </SecondaryButton>
              )}
              <SecondaryButton
                onClick={onBackToRoom}
                style={{ fontSize: 13, padding: '6px 12px' }}
              >
                <ArrowLeft size={14} /> Back to Room
              </SecondaryButton>
            </div>
          </div>

          {activeTab === 'settings' && (
            <TripSettings trip={trip} onUpdateTrip={onUpdateTrip} />
          )}
          {activeTab === 'members' && (
            <Members
              trip={trip}
              members={members}
              onUpdateMembers={onUpdateMembers}
              onUpdateTrip={onUpdateTrip}
            />
          )}
          {activeTab === 'runs' && <AgentRuns tripId={trip.id} />}
          {activeTab === 'danger' && (
            <DangerZone
              trip={trip}
              onUpdateTrip={onUpdateTrip}
              onDeleteTrip={onDeleteTrip}
            />
          )}
        </div>
      </main>
      </div>
    </RequireAuth>
  );
}
