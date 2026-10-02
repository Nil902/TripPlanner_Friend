import { useState, useEffect, useCallback } from 'react';
import { Check, ChevronDown, Users, Sparkles } from 'lucide-react';
import type { Constraint } from '@shared/types';
import {
  BORDER,
  CLAY,
  DIETARY,
  INK,
  MUTED,
  PINE,
  SERIF,
  STYLES,
  Member,
} from '../lib/constants';
import Chip from '../components/Chip';
import { PrimaryButton } from '../components/Button';
import { api } from '../lib/api';

export interface PlansPageProps {
  tripId: string;
  members: Member[];
  currentMemberId: string;
}

export default function PlansPage({
  tripId,
  members,
  currentMemberId,
}: PlansPageProps) {
  const [activeUser, setActiveUser] = useState(currentMemberId);
  const [budget, setBudget] = useState(50);
  const [dietary, setDietary] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [mustSee, setMustSee] = useState('');
  const [mustAvoid, setMustAvoid] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [constraints, setConstraints] = useState<Constraint[]>([]);

  useEffect(() => {
    if (currentMemberId) {
      setActiveUser(currentMemberId);
    } else if (members.length > 0 && !activeUser) {
      setActiveUser(members[0].id);
    }
  }, [currentMemberId, members, activeUser]);

  const loadConstraints = useCallback(() => {
    if (!tripId) return;
    setIsLoading(true);
    api.constraints
      .list(tripId)
      .then((data) => {
        if (Array.isArray(data)) {
          setLoadError(null);
          setConstraints(data);
          const current = data.find((c) => c.user_id === activeUser);
          if (current) {
            setBudget(current.budget_per_day);
            setDietary(current.dietary || []);
            setStyles(current.style_tags || []);
            setMustSee((current.must_see || []).join(', '));
            setMustAvoid((current.must_avoid || []).join(', '));
          }
        }
      })
      .catch(() => {
        setLoadError('Could not load saved preferences. Please try again.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [tripId, activeUser]);

  useEffect(() => {
    loadConstraints();
  }, [loadConstraints]);

  useEffect(() => {
    const current = constraints.find((c) => c.user_id === activeUser);
    if (current) {
      setBudget(current.budget_per_day);
      setDietary(current.dietary || []);
      setStyles(current.style_tags || []);
      setMustSee((current.must_see || []).join(', '));
      setMustAvoid((current.must_avoid || []).join(', '));
    }
  }, [activeUser, constraints]);

  const toggleDietary = (d: string) => {
    setDietary((curr) =>
      curr.includes(d) ? curr.filter((x) => x !== d) : [...curr, d],
    );
  };

  const toggleStyle = (s: string) => {
    setStyles((curr) =>
      curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s],
    );
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.constraints.submit(tripId, {
        user_id: currentMemberId,
        budget_per_day: budget,
        dietary,
        style_tags: styles,
        must_see: mustSee ? mustSee.split(',').map((s) => s.trim()).filter(Boolean) : [],
        must_avoid: mustAvoid ? mustAvoid.split(',').map((s) => s.trim()).filter(Boolean) : [],
      });
      loadConstraints();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Could not save your constraints.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 700, margin: '0 auto' }}>
      <h1
        style={{
          ...SERIF,
          fontSize: 26,
          fontWeight: 400,
          margin: '0 0 6px',
          color: INK,
        }}
      >
        Your Plans & Constraints
      </h1>
      <p style={{ color: MUTED, fontSize: 14, margin: '0 0 24px' }}>
        Drop your budget, food restrictions, and style tags. The agent uses this
        ground truth to satisfy everyone without endless back-and-forth.
      </p>
      {isLoading && <p role="status" style={{ color: MUTED }}>Loading saved preferences...</p>}
      {loadError && (
        <div role="alert" style={{ color: CLAY }}>
          {loadError}{' '}
          <button type="button" onClick={loadConstraints}>Retry</button>
        </div>
      )}

      {/* Persona Selector */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: '#fff',
          border: `1px solid ${BORDER}`,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>
          Submitting as:
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {members.length === 0 ? (
            <span style={{ fontSize: 13, color: MUTED }}>
              {activeUser || 'Current member'}
            </span>
          ) : (
            members.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={m.id !== currentMemberId}
                onClick={() => setActiveUser(m.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  border: `1px solid ${activeUser === m.id ? PINE : BORDER}`,
                  background: activeUser === m.id ? '#EFEAE0' : '#fff',
                  color: activeUser === m.id ? PINE : INK,
                  fontSize: 13,
                  fontWeight: activeUser === m.id ? 600 : 400,
                  cursor: m.id === currentMemberId ? 'pointer' : 'not-allowed',
                }}
              >
                {m.name} {activeUser === m.id ? '✓' : ''}
              </button>
            ))
          )}
        </div>
      </div>

      {saveError && <p role="alert" style={{ color: CLAY }}>{saveError}</p>}

      {/* Budget Per Day */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <label style={{ fontSize: 14, fontWeight: 600, color: INK }}>
            Target Budget per Day
          </label>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: PINE,
              fontFamily: 'monospace',
              background: '#EFEAE0',
              padding: '2px 8px',
              borderRadius: 6,
            }}
          >
            ${budget} / day
          </span>
        </div>
        <p style={{ fontSize: 12, color: MUTED, margin: '0 0 10px' }}>
          Includes lunch, dinner, drinks, and daily attraction admissions.
        </p>
        <input
          type="range"
          min="20"
          max="200"
          step="5"
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          style={{ width: '100%', accentColor: PINE, cursor: 'pointer' }}
        />
      </div>

      {/* Dietary Needs */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            fontSize: 14,
            fontWeight: 600,
            display: 'block',
            marginBottom: 8,
            color: INK,
          }}
        >
          Dietary Restrictions & Allergies
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DIETARY.map((d) => (
            <Chip
              key={d}
              label={d}
              active={dietary.includes(d)}
              onClick={() => toggleDietary(d)}
            />
          ))}
        </div>
      </div>

      {/* Travel Style */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            fontSize: 14,
            fontWeight: 600,
            display: 'block',
            marginBottom: 8,
            color: INK,
          }}
        >
          Travel Style Preferences
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STYLES.map((s) => (
            <Chip
              key={s}
              label={s}
              active={styles.includes(s)}
              onClick={() => toggleStyle(s)}
              accent={CLAY}
            />
          ))}
        </div>
      </div>

      {/* Must-See */}
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            fontSize: 14,
            fontWeight: 600,
            display: 'block',
            marginBottom: 6,
            color: INK,
          }}
        >
          Anything you don't want to miss? (Must-See)
        </label>
        <textarea
          value={mustSee}
          onChange={(e) => setMustSee(e.target.value)}
          placeholder="e.g. Pasteis de Belem, Jeronimos Monastery, Sunset wine viewpoint"
          rows={2}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>

      {/* Must-Avoid (Key Section 9.1 spec feature) */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            fontSize: 14,
            fontWeight: 600,
            display: 'block',
            marginBottom: 6,
            color: INK,
          }}
        >
          Anything to avoid? (Must-Avoid)
        </label>
        <textarea
          value={mustAvoid}
          onChange={(e) => setMustAvoid(e.target.value)}
          placeholder="e.g. Steep hills / stairs, late-night nightclubs, loud tourist traps"
          rows={2}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>

      <PrimaryButton
        onClick={handleSave}
        disabled={isSubmitting}
        style={{ padding: '11px 24px' }}
      >
        {saved ? <Check size={16} /> : <Sparkles size={16} />}
        {saved ? 'Saved Successfully' : isSubmitting ? 'Saving...' : 'Save Your Constraints'}
      </PrimaryButton>

      {/* Group Submitted Constraints Snapshot */}
      <details className="group mt-9 rounded-xl border border-stone-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-5 py-4 text-sm font-semibold text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
          <Users size={16} aria-hidden="true" className="text-emerald-800" />
          <span>Group Constraints Overview</span>
          <span className="ml-auto text-xs font-normal text-stone-500">
            {constraints.length} {constraints.length === 1 ? 'member' : 'members'}
          </span>
          <ChevronDown size={16} aria-hidden="true" className="text-stone-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5">
          {constraints.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm italic text-stone-600">
              No constraints submitted yet. Submit your preferences above to add your voice to the plan.
            </p>
          ) : (
            <ul className="list-disc space-y-3 pl-5 text-sm text-stone-800">
              {constraints.map((c) => {
                const matchedMember = members.find((m) => m.id === c.user_id);
                const displayName = matchedMember?.name || c.user_id.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
                return (
                  <li key={c.id || c.user_id}>
                    <strong>{displayName}</strong>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-stone-600">
                      <li>Budget: ${c.budget_per_day} per day</li>
                      {c.dietary?.length > 0 && <li>Dietary: {c.dietary.join(', ')}</li>}
                      {c.style_tags?.length > 0 && <li>Travel style: {c.style_tags.join(', ')}</li>}
                      {c.must_see?.length > 0 && <li>Must-see: {c.must_see.join(', ')}</li>}
                      {c.must_avoid?.length > 0 && <li>Avoid: {c.must_avoid.join(', ')}</li>}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
