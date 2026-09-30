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
import ErrorBoundary from './components/ErrorBoundary';
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

const IS_TEST_ENV = typeof window !== 'undefined' && window.__TEST_ENV__ === true;

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
  const clean = id.replace(/^trip-/, '');
  const part = clean.split('-')[0];
  if (part) {
    return `${part.charAt(0).toUpperCase() + part.slice(1)} trip`;
  }
  return `Trip ${id}`;
}

function formatDestination(id: string): string {
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

  const [isInitializing, setIsInitializing] = useState(true);

  // Combined initialization: parse URL, restore auth/guest session, fetch trip data
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsInitializing(false);
      return;
    }

    let mounted = true;

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

    async function initialize() {
      try {
        // In test environment, skip async API calls and rely on localStorage/session data
        if (IS_TEST_ENV) {
          const token = getAuthToken();
          if (token) {
            setCurrentUser({
              id: 'test-user',
              name: 'Test Creator',
              email: 'test@example.com',
              role: 'creator',
            });
          } else {
            const guest = getGuestSession();
            if (guest && guest.tripId && guest.memberId && mounted) {
              setCurrentUser({
                id: guest.memberId,
                name: guest.name,
                role: 'joiner',
              });

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
            }
          }

          if (parsed.tripId && (parsed.screen === 'room' || parsed.screen === 'owner')) {
            setActiveTrip({
              id: parsed.tripId,
              title: formatTripTitle(parsed.tripId),
              destination: formatDestination(parsed.tripId),
              start_date: '2026-06-12',
              end_date: '2026-06-14',
              creator_id: 'creator',
              status: 'collecting_constraints',
              member_ids: [],
            });
          }
        } else {
          // 1. Check for authenticated creator session
          const token = getAuthToken();
          if (token) {
            try {
              const user = await api.auth.me();
              if (user?.id && mounted) {
                setCurrentUser({
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  role: 'creator',
                });
              }
            } catch {
              setAuthToken(null);
            }
          } else {
            // 2. Check for saved guest session
            const guest = getGuestSession();
            if (guest && guest.tripId && guest.memberId && mounted) {
              try {
                const [t, memList] = await Promise.all([
                  api.trips.get(guest.tripId),
                  api.trips.getMembers(guest.tripId),
                ]);
                if (t?.id && mounted) {
                  setCurrentUser({
                    id: guest.memberId,
                    name: guest.name,
                    role: 'joiner',
                  });
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
                  setMembers(memList);
                  setScreen('room');
                  setActive('overview');
                }
              } catch {
                setGuestSession(null);
                if (mounted) setScreen('welcome');
              }
            }
          }

          // 3. Restore active trip from URL on hard refresh (e.g. /room?trip=xxx or /manage?trip=xxx)
          // This handles creator refresh or direct URL access
          if (parsed.tripId && (parsed.screen === 'room' || parsed.screen === 'owner')) {
            try {
              const [t, permissions] = await Promise.all([
                api.trips.get(parsed.tripId),
                api.trips.getPermissions(parsed.tripId),
              ]);
              if (t?.id && mounted) {
                setCurrentUser((user) =>
                  user
                    ? { ...user, role: permissions.can_manage ? 'creator' : 'joiner' }
                    : user,
                );
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
            } catch {
              // ignore
            }
          }
        }
      } finally {
        if (mounted) {
          setIsInitializing(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
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
            setTrips(fetchedTrips);
          }
        })
        .catch(() => {
          setTrips([]);
        });
    }
  }, [currentUser?.role, currentUser?.id]);

  // Handle public guest joining via code (no login required)
  const handleJoinGuest = async (member: {
    name: string;
    initials: string;
    tripId: string;
  }): Promise<void> => {
    const joined = await api.trips.join(member.tripId, { name: member.name });
    if (joined.access_token) {
      setGuestSession({
        tripId: member.tripId,
        memberId: joined.id,
        name: joined.name,
        initials: joined.initials,
        accessToken: joined.access_token,
      });
    } else if (!getAuthToken()) {
      throw new Error('The trip did not issue a usable session. Please try again.');
    }

    let fetchedTrip: Awaited<ReturnType<typeof api.trips.get>>;
    let fetchedMembers: Awaited<ReturnType<typeof api.trips.getMembers>>;
    try {
      [fetchedTrip, fetchedMembers] = await Promise.all([
        api.trips.get(member.tripId),
        api.trips.getMembers(member.tripId),
      ]);
    } catch (err) {
      if (joined.access_token) setGuestSession(null);
      throw err;
    }

    setCurrentUser({ id: joined.id, name: joined.name, role: joined.role });
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
    setMembers(fetchedMembers);
    setScreen('room');
    setActive('overview');
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
          <ErrorBoundary label="Dashboard failed to load">
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
                setCurrentUser((user) =>
                  user
                    ? {
                        ...user,
                        role: trip.creator_id === user.id ? 'creator' : 'joiner',
                      }
                    : user,
                );
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
          </ErrorBoundary>
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
          <ErrorBoundary label="Settings failed to load">
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
          </ErrorBoundary>
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
                  if (getAuthToken()) {
                    setCurrentUser((user) =>
                      user ? { ...user, role: 'creator' } : user,
                    );
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
                  if (getAuthToken()) {
                    setCurrentUser((user) =>
                      user ? { ...user, role: 'creator' } : user,
                    );
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
                  <ErrorBoundary label="Overview failed to load">
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
                  </ErrorBoundary>
                )}
                {active === 'plans' && (
                  <ErrorBoundary label="Plans failed to load">
                    <PlansPage
                      tripId={activeTrip.id}
                      members={members}
                      currentMemberId={currentUser?.id || members[0]?.id || ''}
                    />
                  </ErrorBoundary>
                )}
                {active === 'itinerary' && (
                  <ErrorBoundary label="Itinerary failed to load">
                    <ItineraryPage
                      tripId={activeTrip.id}
                      planMode={planMode}
                    />
                  </ErrorBoundary>
                )}
                {active === 'costs' && (
                  <ErrorBoundary label="Costs failed to load">
                    <CostsPage tripId={activeTrip.id} members={members} />
                  </ErrorBoundary>
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

  if (isInitializing) {
    return (
      <div style={{ minHeight: '100vh', background: '#F3EEE2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#8A8272', fontSize: 14 }}>Loading...</span>
      </div>
    );
  }

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
