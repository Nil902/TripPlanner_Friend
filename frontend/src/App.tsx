import { useState, useEffect } from 'react';
import { Menu, Users, CalendarDays, MapPin, Wallet } from 'lucide-react';
import Sidebar from './components/Sidebar';
import WelcomePage from './pages/WelcomePage';
import AuthPage from './pages/AuthPage';
import TripsDashboardPage from './pages/TripsDashboardPage';
import OverviewPage from './pages/OverviewPage';
import PlansPage from './pages/PlansPage';
import ItineraryPage from './pages/ItineraryPage';
import CostsPage from './pages/CostsPage';
import OwnerTripPage from './pages/OwnerTripPage';
import AdminLoginPage, { AdminUser } from './pages/Admin/AdminLoginPage';
import AdminDashboardPage from './pages/Admin/AdminDashboardPage';
import JoinModal from './components/JoinModal';
import { PageMiddlewareWrapper } from './middleware';
import {
  PAPER,
  INK,
  BORDER,
  PINE,
  PINE_DARK,
  TripSummary,
  Member,
} from './lib/constants';
import {
  setAuthToken,
  getAuthToken,
  setAdminToken,
  setGuestSession,
  getGuestSession,
  api,
} from './lib/api';
import { useResponsive } from './lib/useResponsive';
import { getPathForScreen, parseRouteFromLocation } from './lib/router';

type Screen =
  | 'welcome'
  | 'auth'
  | 'dashboard'
  | 'room'
  | 'owner'
  | 'admin_login'
  | 'admin_dashboard';
type ActiveTab = 'overview' | 'plans' | 'itinerary' | 'costs';
type PlanMode = 'ai' | 'manual';

export interface CurrentUser {
  id: string;
  name: string;
  email?: string;
  role?: 'creator' | 'joiner';
}

function formatTripTitle(id: string): string {
  if (id.toLowerCase().includes('lisbon')) return 'Lisbon trip';
  if (id.toLowerCase().includes('tokyo')) return 'Tokyo Autumn Expedition';
  const clean = id.replace(/^trip-/, '');
  const part = clean.split('-')[0];
  if (part) {
    return `${part.charAt(0).toUpperCase() + part.slice(1)} trip`;
  }
  return `Trip ${id}`;
}

function formatDestination(id: string): string {
  if (id.toLowerCase().includes('lisbon')) return 'Lisbon, Portugal';
  if (id.toLowerCase().includes('tokyo')) return 'Tokyo, Japan';
  const clean = id.replace(/^trip-/, '');
  const part = clean.split('-')[0];
  if (part) {
    return part.charAt(0).toUpperCase() + part.slice(1);
  }
  return 'Destination';
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [active, setActive] = useState<ActiveTab>('overview');
  const [planMode, setPlanMode] = useState<PlanMode>('ai');

  // Responsive state
  const { isMobile } = useResponsive();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // User auth & role state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [, setAdminUser] = useState<AdminUser | null>(null);

  // Trips state
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [activeTrip, setActiveTrip] = useState<TripSummary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  // Join modal state for public guests
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCodeParam, setJoinCodeParam] = useState('');

  // Detect initial URL path, query params, or hash on page load / refresh
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const parsed = parseRouteFromLocation(
      window.location.pathname,
      window.location.search,
      window.location.hash,
    );

    if (parsed.screen !== 'welcome') {
      setScreen(parsed.screen);
    }
    if (parsed.tab) {
      setActive(parsed.tab);
    }
    if (parsed.joinCode) {
      setJoinCodeParam(parsed.joinCode);
      setIsJoinModalOpen(true);
    }

    // Restore active trip from URL on hard refresh (e.g. /room?trip=xxx or /manage?trip=xxx)
    if (parsed.tripId && (parsed.screen === 'room' || parsed.screen === 'owner')) {
      api.trips
        .get(parsed.tripId)
        .then((t) => {
          if (t?.id) {
            setActiveTrip({
              id: t.id,
              title: t.title,
              destination: t.destination,
              start_date: String(t.start_date),
              end_date: String(t.end_date),
              creator_id: t.creator_id,
              status: t.status as TripSummary['status'],
              member_ids: t.member_ids || [],
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  // Synchronize screen & active tab state with browser address bar across all pages
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const targetUrl = getPathForScreen(screen, active, activeTrip?.id);
    const currentUrl =
      window.location.pathname + (window.location.search || '');

    // Only update if targetUrl differs to prevent duplicate history states
    if (currentUrl !== targetUrl) {
      window.history.pushState(
        { screen, active, tripId: activeTrip?.id },
        '',
        targetUrl,
      );
    }
  }, [screen, active, activeTrip?.id]);

  // Support browser Back and Forward navigation buttons across all pages
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const parsed = parseRouteFromLocation(
        window.location.pathname,
        window.location.search,
        window.location.hash,
      );

      setScreen(parsed.screen);
      if (parsed.tab) {
        setActive(parsed.tab);
      }
      if (parsed.tripId) {
        const found = trips.find((t) => t.id === parsed.tripId);
        if (found) {
          setActiveTrip(found);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [trips]);

  // Verify existing token on initial load from backend or restore guest session
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      api.auth
        .me()
        .then((user) => {
          if (user?.id) {
            setCurrentUser({
              id: user.id,
              name: user.name,
              email: user.email,
              role: 'creator',
            });
          }
        })
        .catch(() => {
          setAuthToken(null);
        });
    } else {
      // Check for saved guest session (so closing browser doesn't re-prompt for code)
      const guest = getGuestSession();
      if (guest && guest.tripId && guest.memberId) {
        setCurrentUser({
          id: guest.memberId,
          name: guest.name,
          role: 'joiner',
        });

        // Set initial active trip immediately so tripSessionMiddleware doesn't kick user to welcome
        setActiveTrip({
          id: guest.tripId,
          title: formatTripTitle(guest.tripId),
          destination: formatDestination(guest.tripId),
          start_date: '2026-06-12',
          end_date: '2026-06-14',
          creator_id: 'creator',
          status: 'collecting_constraints',
          member_ids: [guest.memberId],
        });

        setScreen('room');
        setActive('overview');

        // Load members from backend for this trip
        api.trips
          .getMembers(guest.tripId)
          .then((memList) => {
            if (Array.isArray(memList) && memList.length > 0) {
              setMembers(memList);
            }
          })
          .catch(() => {});

        // Fetch real trip details from backend API
        api.trips
          .get(guest.tripId)
          .then((t) => {
            if (t?.id) {
              setActiveTrip({
                id: t.id,
                title: t.title,
                destination: t.destination,
                start_date: String(t.start_date),
                end_date: String(t.end_date),
                creator_id: t.creator_id,
                status: t.status as TripSummary['status'],
                member_ids: t.member_ids || [],
              });
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  // Fetch real trip members from backend whenever active trip changes
  useEffect(() => {
    if (activeTrip?.id) {
      api.trips
        .getMembers(activeTrip.id)
        .then((freshMembers) => {
          if (Array.isArray(freshMembers) && freshMembers.length > 0) {
            setMembers(freshMembers);
          }
        })
        .catch(() => {
          // Keep current members fallback
        });
    }
  }, [activeTrip?.id]);

  // Auto-detect invite code in query parameters (?code=lisbon-202)
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code') || urlParams.get('trip');
      if (code) {
        setJoinCodeParam(code);
        const guest = getGuestSession();
        // If already in this trip room, do not force modal
        if (!guest || guest.tripId !== code) {
          setIsJoinModalOpen(true);
        }
      }
    } catch {
      // Ignore in non-browser environments
    }
  }, []);

  // Fetch trips from backend whenever the creator logs in
  useEffect(() => {
    if (currentUser?.role === 'creator') {
      api.trips
        .list()
        .then((fetchedTrips) => {
          if (Array.isArray(fetchedTrips)) {
            setTrips(fetchedTrips as unknown as TripSummary[]);
          }
        })
        .catch(() => {
          setTrips([]);
        });
    }
  }, [currentUser?.role, currentUser?.id]);

  // Handle public guest joining via code (no login required)
  const handleJoinGuest = (member: {
    id: string;
    name: string;
    initials: string;
    tripId: string;
  }) => {
    const guestUser: CurrentUser = {
      id: member.id,
      name: member.name,
      role: 'joiner',
    };
    setCurrentUser(guestUser);

    // Save session in localStorage so closing the browser remembers them
    setGuestSession({
      tripId: member.tripId,
      memberId: member.id,
      name: member.name,
      initials: member.initials,
    });

    // Optimistically set active trip immediately so room screen can render
    const found = trips.find((t) => t.id === member.tripId);
    setActiveTrip(
      found || {
        id: member.tripId,
        title: formatTripTitle(member.tripId),
        destination: formatDestination(member.tripId),
        start_date: '2026-06-12',
        end_date: '2026-06-14',
        creator_id: 'creator',
        status: 'collecting_constraints',
        member_ids: [member.id],
      },
    );

    // Optimistically add member
    setMembers((prev) => {
      if (prev.some((m) => m.id === member.id)) return prev;
      return [
        ...prev,
        {
          id: member.id,
          name: member.name,
          initials: member.initials,
          submitted: false,
          role: 'joiner',
        },
      ];
    });

    // Immediately enter the room
    setScreen('room');
    setActive('overview');

    // Sync with backend API in the background
    void api.trips
      .join(member.tripId, {
        name: member.name,
        user_id: member.id,
      })
      .then(async () => {
        const [fetchedTrip, fetchedMembers] = await Promise.all([
          api.trips.get(member.tripId).catch(() => null),
          api.trips.getMembers(member.tripId).catch(() => null),
        ]);

        if (fetchedTrip?.id) {
          setActiveTrip({
            id: fetchedTrip.id,
            title: fetchedTrip.title,
            destination: fetchedTrip.destination,
            start_date: String(fetchedTrip.start_date),
            end_date: String(fetchedTrip.end_date),
            creator_id: fetchedTrip.creator_id,
            status: fetchedTrip.status as TripSummary['status'],
            member_ids: fetchedTrip.member_ids || [],
          });
        }

        if (Array.isArray(fetchedMembers) && fetchedMembers.length > 0) {
          setMembers(fetchedMembers);
        }
      })
      .catch(() => {});
  };

  // Handle creator signup or login
  const handleAuthSuccess = (user: { id: string; email: string; name: string }) => {
    const creatorUser: CurrentUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: 'creator',
    };
    setCurrentUser(creatorUser);
    setScreen('dashboard');
  };

  const handleLogout = () => {
    setAuthToken(null);
    setGuestSession(null);
    setCurrentUser(null);
    setScreen('welcome');
  };

  // Mobile Bottom Tab Navigation Items
  const navItems = [
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'plans', label: 'Plans', icon: CalendarDays },
    { id: 'itinerary', label: 'Itinerary', icon: MapPin },
    { id: 'costs', label: 'Costs', icon: Wallet },
  ];

  const renderScreen = () => {
    switch (screen) {
      case 'welcome':
        return (
          <WelcomePage
            onStart={() => {
              if (currentUser?.role === 'creator') {
                setScreen('dashboard');
              } else if (currentUser?.role === 'joiner') {
                setScreen('room');
              } else {
                // No user logged in — send them to auth to sign in or create an account
                setScreen('auth');
              }
            }}
            onJoin={(code) => {
              setJoinCodeParam(code);
              setIsJoinModalOpen(true);
            }}
            onGoToAuth={() => setScreen('auth')}
            onLogout={handleLogout}
            currentUser={currentUser}
          />
        );

      case 'auth':
        return (
          <AuthPage
            onSuccess={handleAuthSuccess}
            onCancel={() => setScreen('welcome')}
            onJoinCode={() => {
              setScreen('welcome');
              setIsJoinModalOpen(true);
            }}
          />
        );

      case 'dashboard':
        return (
          <TripsDashboardPage
            user={
              currentUser && currentUser.email
                ? {
                    id: currentUser.id,
                    name: currentUser.name,
                    email: currentUser.email ?? '',
                  }
                : { id: '', name: '', email: '' }
            }
            currentUser={currentUser}
            onRequireLogin={() => setScreen('auth')}
            trips={trips}
            onSelectTrip={(trip) => {
              setActiveTrip(trip);
              setScreen('room');
              setActive('overview');
            }}
            onCreateTrip={(newTrip) => {
              setTrips((prev) => [newTrip, ...prev]);
            }}
            onLogout={handleLogout}
            onManageTrip={(trip) => {
              setActiveTrip(trip);
              setScreen('owner');
            }}
          />
        );

      case 'owner':
        if (!activeTrip) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F3EEE2' }}>
              <span style={{ fontSize: 14, color: '#8A8272' }}>Loading trip settings...</span>
            </div>
          );
        }
        return (
          <OwnerTripPage
            trip={activeTrip}
            members={members}
            currentUser={currentUser}
            onRequireLogin={() => setScreen('auth')}
            onUpdateTrip={(updated) => {
              setActiveTrip(updated);
              setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            }}
            onUpdateMembers={(updatedMembers) => {
              setMembers(updatedMembers);
            }}
            onDeleteTrip={(tripId) => {
              const remaining = trips.filter((t) => t.id !== tripId);
              setTrips(remaining);
              if (remaining.length > 0) {
                setActiveTrip(remaining[0]);
              }
              if (currentUser?.role === 'creator') {
                setScreen('dashboard');
              } else {
                setScreen('welcome');
              }
            }}
            onBackToRoom={() => setScreen('room')}
            onBackToDashboard={
              currentUser?.role === 'creator'
                ? () => setScreen('dashboard')
                : undefined
            }
          />
        );

      case 'admin_login':
        return (
          <AdminLoginPage
            onLoginSuccess={(user) => {
              setAdminUser(user);
              setScreen('admin_dashboard');
            }}
            onBackToApp={() => setScreen('welcome')}
          />
        );

      case 'admin_dashboard':
        return (
          <AdminDashboardPage
            onLogout={() => {
              setAdminToken(null);
              setAdminUser(null);
              setScreen('admin_login');
            }}
            onSwitchToUserApp={() => {
              if (currentUser?.role === 'creator') {
                setScreen('dashboard');
              } else {
                setScreen('welcome');
              }
            }}
          />
        );

      case 'room':
      default:
        if (!activeTrip) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#F3EEE2' }}>
              <span style={{ fontSize: 14, color: '#8A8272' }}>Loading trip room...</span>
            </div>
          );
        }
        return (
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
            {/* Mobile Top App Bar */}
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
                <button
                  type="button"
                  onClick={() => setIsMobileNavOpen(true)}
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
                  aria-label="Open menu"
                >
                  <Menu size={18} />
                </button>

                <div
                  style={{
                    textAlign: 'center',
                    minWidth: 0,
                    flex: 1,
                    padding: '0 12px',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: INK,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={activeTrip.title}
                  >
                    {activeTrip.title}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: PINE,
                      fontWeight: 500,
                      textTransform: 'capitalize',
                      display: 'block',
                    }}
                  >
                    {active}
                  </span>
                </div>

                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: PINE,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {currentUser?.name ? currentUser.name[0].toUpperCase() : 'U'}
                </div>
              </header>
            )}

            {/* Sidebar: Desktop permanent or Mobile drawer */}
            {!isMobile ? (
              <Sidebar
                active={active}
                setActive={(id) => setActive(id as ActiveTab)}
                tripName={activeTrip.title}
                currentUser={currentUser}
                onOpenAdmin={
                  currentUser?.role === 'creator'
                    ? () => setScreen('owner')
                    : undefined
                }
                onExitRoom={() => {
                  if (currentUser?.role === 'creator') {
                    setScreen('dashboard');
                  } else {
                    setGuestSession(null);
                    setCurrentUser(null);
                    setScreen('welcome');
                  }
                }}
              />
            ) : (
              <Sidebar
                active={active}
                setActive={(id) => setActive(id as ActiveTab)}
                tripName={activeTrip.title}
                currentUser={currentUser}
                isMobileOpen={isMobileNavOpen}
                onCloseMobile={() => setIsMobileNavOpen(false)}
                onOpenAdmin={
                  currentUser?.role === 'creator'
                    ? () => {
                        setIsMobileNavOpen(false);
                        setScreen('owner');
                      }
                    : undefined
                }
                onExitRoom={() => {
                  setIsMobileNavOpen(false);
                  if (currentUser?.role === 'creator') {
                    setScreen('dashboard');
                  } else {
                    setGuestSession(null);
                    setCurrentUser(null);
                    setScreen('welcome');
                  }
                }}
              />
            )}

            {/* Main Content Area */}
            <main
              style={{
                flex: 1,
                padding: isMobile ? '16px 16px 84px 16px' : '32px 40px',
                overflowY: 'auto',
                maxWidth: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <div style={{ width: '100%', maxWidth: 780, margin: '0 auto' }}>
                {active === 'overview' && (
                  <OverviewPage
                    trip={activeTrip}
                    members={members}
                    setActive={(id) => setActive(id as ActiveTab)}
                    planMode={planMode}
                    setPlanMode={setPlanMode}
                    isCreator={currentUser?.role === 'creator'}
                    onOpenAdmin={
                      currentUser?.role === 'creator'
                        ? () => setScreen('owner')
                        : undefined
                    }
                  />
                )}
                {active === 'plans' && (
                  <PlansPage
                    tripId={activeTrip.id}
                    members={members}
                    currentMemberId={currentUser?.id || members[0]?.id || ''}
                  />
                )}
                {active === 'itinerary' && <ItineraryPage tripId={activeTrip.id} />}
                {active === 'costs' && (
                  <CostsPage tripId={activeTrip.id} members={members} />
                )}
              </div>
            </main>

            {/* Mobile Bottom Tab Bar */}
            {isMobile && (
              <nav
                style={{
                  position: 'fixed',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: '#fff',
                  borderTop: `1px solid ${BORDER}`,
                  display: 'flex',
                  justifyContent: 'space-around',
                  padding: '8px 4px',
                  boxShadow: '0 -2px 10px rgba(36,33,28,0.05)',
                }}
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActive(item.id as ActiveTab)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 3,
                        border: 'none',
                        background: 'transparent',
                        color: isActive ? PINE_DARK : INK,
                        fontSize: 11,
                        fontWeight: isActive ? 600 : 400,
                        cursor: 'pointer',
                        padding: '4px 12px',
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 20,
                          borderRadius: 12,
                          background: isActive ? '#EFEAE0' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon size={16} color={isActive ? PINE : '#8A8272'} />
                      </div>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        );
    }
  };

  return (
    <PageMiddlewareWrapper
      screen={screen}
      currentUser={currentUser}
      activeTrip={activeTrip}
      setScreen={setScreen}
    >
      {renderScreen()}

      <JoinModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        initialCode={joinCodeParam}
        onJoin={handleJoinGuest}
      />
    </PageMiddlewareWrapper>
  );
}
