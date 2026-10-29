import { useState } from 'react';
import {
  MapPin,
  Calendar,
  Users,
  Plus,
  ArrowRight,
  LogOut,
  Sparkles,
  Settings,
} from 'lucide-react';
import {
  PAPER,
  INK,
  BORDER,
  MUTED,
  PINE,
  SERIF,
  TripSummary,
} from '../lib/constants';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import CreateTripModal from '../components/CreateTripModal';
import { RequireAuth } from '../middleware';
import { CurrentUser } from '../App';
import type { TripLifecycleStatus } from '@shared/types';
import TripStatusBadge from '../components/TripStatusBadge';
import { getTripLifecycleStatus, TRIP_LIFECYCLE_LABELS } from '../lib/tripLifecycle';
import { useToday } from '../lib/useToday';

export interface TripsDashboardPageProps {
  user: { id: string; email: string; name: string };
  trips: TripSummary[];
  onSelectTrip: (trip: TripSummary) => void;
  onCreateTrip: (trip: TripSummary) => void;
  onLogout: () => void;
  onManageTrip?: (trip: TripSummary) => void;
  currentUser?: CurrentUser | null;
  onRequireLogin?: () => void;
}

export default function TripsDashboardPage({
  user,
  trips,
  onSelectTrip,
  onCreateTrip,
  onLogout,
  onManageTrip,
  currentUser,
  onRequireLogin,
}: TripsDashboardPageProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | TripLifecycleStatus>('all');
  const today = useToday();
  const counts: Record<TripLifecycleStatus, number> = { upcoming: 0, in_progress: 0, completed: 0 };
  for (const trip of trips) counts[getTripLifecycleStatus(trip, today)]++;
  const filteredTrips = statusFilter === 'all'
    ? trips
    : trips.filter((trip) => getTripLifecycleStatus(trip, today) === statusFilter);

  const creatorUser =
    currentUser ||
    (user?.email
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: 'creator' as const,
        }
      : null);

  return (
    <RequireAuth
      currentUser={creatorUser}
      requiredRole="creator"
      screen="dashboard"
      onRedirect={onRequireLogin || onLogout}
    >
      <div
      style={{
        minHeight: '100vh',
        background: PAPER,
        color: INK,
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ maxWidth: 960, width: '100%', margin: '0 auto' }}>
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 36,
            paddingBottom: 20,
            borderBottom: `1px solid ${BORDER}`,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: PINE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MapPin color="#fff" size={20} />
            </div>
            <div>
              <h1
                style={{
                  ...SERIF,
                  fontSize: 22,
                  fontWeight: 400,
                  margin: 0,
                  color: INK,
                }}
              >
                My Trip Rooms
              </h1>
              <span style={{ fontSize: 13, color: MUTED }}>
                Logged in as <strong>{user.name}</strong> ({user.email})
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <PrimaryButton onClick={() => setIsCreateOpen(true)}>
              <Plus size={16} /> Plan a New Trip
            </PrimaryButton>
            <SecondaryButton onClick={onLogout} style={{ padding: '8px 14px', fontSize: 13 }}>
              <LogOut size={14} /> Sign out
            </SecondaryButton>
          </div>
        </div>

        {/* Trips Grid */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                margin: 0,
                color: INK,
              }}
            >
              Group Trips ({trips.length})
            </h2>
          </div>

          <div aria-label="Filter trips by progress" className="mb-3 flex flex-wrap gap-2">
            {(['all', 'upcoming', 'in_progress', 'completed'] as const).map((filter) => (
              <button key={filter} type="button" aria-pressed={statusFilter === filter}
                onClick={() => setStatusFilter(filter)}
                className={`rounded-full border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2B4C3F] ${statusFilter === filter ? 'border-[#2B4C3F] bg-[#2B4C3F] text-white' : 'border-[#DDD5C4] bg-white text-[#24211C]'}`}>
                {filter === 'all' ? 'All' : TRIP_LIFECYCLE_LABELS[filter]} ({filter === 'all' ? trips.length : counts[filter]})
              </button>
            ))}
          </div>
          <p className="mb-4 text-xs text-[#595347]">
            Progress updates automatically from your travel dates (UTC). Trips remain in progress through their end date.
          </p>

          {trips.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                background: '#fff',
                borderRadius: 16,
                border: `1px dashed ${BORDER}`,
              }}
            >
              <Sparkles size={28} color={PINE} style={{ margin: '0 auto 12px' }} />
              <h3 style={{ ...SERIF, fontSize: 20, margin: '0 0 6px' }}>
                No trips planned yet
              </h3>
              <p style={{ fontSize: 14, color: MUTED, margin: '0 0 20px' }}>
                Start a trip room to invite friends, collect dietary and budget constraints,
                and generate an AI itinerary.
              </p>
              <PrimaryButton onClick={() => setIsCreateOpen(true)}>
                <Plus size={16} /> Create Your First Trip
              </PrimaryButton>
            </div>
          ) : filteredTrips.length === 0 ? (
            <p role="status" className="rounded-xl border border-[#DDD5C4] bg-white p-6 text-sm text-[#595347]">
              No {statusFilter === 'all' ? '' : TRIP_LIFECYCLE_LABELS[statusFilter].toLowerCase()} trips.
              Choose another filter to see your trip rooms.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 270px), 1fr))',
                gap: 16,
              }}
            >
              {filteredTrips.map((trip) => {
                const lifecycle = getTripLifecycleStatus(trip, today);
                return (
                  <div
                    key={trip.id}
                    role="group"
                    aria-label={trip.title}
                    style={{
                      background: '#fff',
                      borderRadius: 14,
                      border: `1px solid ${BORDER}`,
                      padding: 20,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 8px rgba(36,33,28,0.03)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: 12,
                        }}
                      >
                        <TripStatusBadge status={lifecycle} />
                        <span style={{ fontSize: 12, color: MUTED, fontFamily: 'monospace' }}>
                          #{trip.id.slice(-6)}
                        </span>
                      </div>

                      <h3
                        style={{
                          ...SERIF,
                          fontSize: 19,
                          fontWeight: 400,
                          margin: '0 0 6px',
                          color: INK,
                        }}
                      >
                        {trip.title}
                      </h3>

                      {trip.status === 'flagged' ? (
                        <p className="mb-2 text-xs font-semibold text-[#8E4726]">Flagged for review</p>
                      ) : lifecycle !== 'completed' && (
                        <p className="mb-2 text-xs text-[#595347]">
                          {trip.status === 'collecting_constraints' ? 'Collecting constraints' : trip.status === 'planned' ? 'Itinerary planned' : 'Travel underway'}
                        </p>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 13,
                          color: MUTED,
                          marginBottom: 6,
                        }}
                      >
                        <MapPin size={14} color={PINE} /> {trip.destination}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 13,
                          color: MUTED,
                          marginBottom: 14,
                        }}
                      >
                        <Calendar size={14} /> {trip.start_date} – {trip.end_date}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 14,
                        borderTop: `1px solid ${BORDER}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          color: MUTED,
                        }}
                      >
                        <Users size={14} /> {trip.member_ids.length} members
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {onManageTrip && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onManageTrip(trip);
                            }}
                            title="Manage Trip Settings"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: `1px solid ${BORDER}`,
                              background: '#fff',
                              color: INK,
                              cursor: 'pointer',
                            }}
                          >
                            <Settings size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectTrip(trip)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#EFEAE0',
                            color: PINE,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Open Room <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CreateTripModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        creatorId={user.id}
        onCreated={(newTrip) => {
          onCreateTrip(newTrip);
          onSelectTrip(newTrip);
        }}
      />
      </div>
    </RequireAuth>
  );
}
