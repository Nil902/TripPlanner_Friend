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
              Active Group Trips ({trips.length})
            </h2>
          </div>

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
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 270px), 1fr))',
                gap: 16,
              }}
            >
              {trips.map((trip) => {
                const isCollecting = trip.status === 'collecting_constraints';
                return (
                  <div
                    key={trip.id}
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
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '3px 8px',
                            borderRadius: 20,
                            background: isCollecting ? '#FEF7ED' : '#EEF3ED',
                            color: isCollecting ? '#C1683F' : PINE,
                            border: `1px solid ${isCollecting ? '#F6DEC8' : '#D1DFCE'}`,
                          }}
                        >
                          {isCollecting ? 'Collecting constraints' : 'Itinerary planned'}
                        </span>
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
                        {onManageTrip && trip.creator_id === creatorUser?.id && (
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
