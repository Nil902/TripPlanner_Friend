import { useState, useEffect } from 'react';
import {
  MapPin,
  Users,
  DollarSign,
  Activity,
  Database,
  Server,
  Cloud,
  CheckCircle2,
  Search,
  MoreHorizontal,
  LogOut,
  ArrowLeft,
  Shield,
  RefreshCw,
  Trash2,
  Flag,
  Check,
  Menu,
  X,
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
} from '../../lib/constants';
import {
  api,
  setAdminToken,
  AdminTripItem,
  AdminUserItem,
  AdminApiUsageItem,
  AdminSystemHealthNode,
} from '../../lib/api';
import { useResponsive } from '../../lib/useResponsive';
import { SecondaryButton } from '../../components/Button';
import { RequireAuth } from '../../middleware';

const RED = '#B3432E';

interface AuditLog {
  id: string;
  time: string;
  level: "info" | "warn" | "error";
  service: string;
  message: string;
}

const AUDIT_LOGS: AuditLog[] = [];

export interface AdminDashboardPageProps {
  onLogout: () => void;
  onSwitchToUserApp: () => void;
}

export default function AdminDashboardPage({
  onLogout,
  onSwitchToUserApp,
}: AdminDashboardPageProps) {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'trips' | 'users' | 'usage' | 'health'
  >('overview');
  const { isMobile } = useResponsive();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Live state
  const [metrics, setMetrics] = useState<Array<{ label: string; value: string; sub: string }>>([]);
  const [trips, setTrips] = useState<AdminTripItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [apiUsage, setApiUsage] = useState<AdminApiUsageItem[]>([]);
  const [systemHealth, setSystemHealth] = useState<AdminSystemHealthNode[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Trips filtering
  const [tripSearch, setTripSearch] = useState('');
  const [tripStatusFilter, setTripStatusFilter] = useState<'all' | 'active' | 'flagged' | 'closed'>('all');
  const [activeTripActionId, setActiveTripActionId] = useState<string | null>(null);

  // Users filtering
  const [userSearch, setUserSearch] = useState('');

  // Fetch telemetry from backend
  const loadAdminData = async () => {
    setRefreshing(true);
    setAdminError(null);
    try {
      const [ovData, tripsData, usersData, usageData, healthData] =
        await Promise.allSettled([
          api.admin.overview(),
          api.admin.trips(),
          api.admin.users(),
          api.admin.apiUsage(),
          api.admin.systemHealth(),
        ]);

      setMetrics(ovData.status === 'fulfilled' ? ovData.value.metrics : []);
      setTrips(tripsData.status === 'fulfilled' ? tripsData.value : []);
      setUsers(usersData.status === 'fulfilled' ? usersData.value : []);
      setApiUsage(usageData.status === 'fulfilled' ? usageData.value : []);
      setSystemHealth(healthData.status === 'fulfilled' ? healthData.value : []);
      if ([ovData, tripsData, usersData, usageData, healthData].some((item) => item.status === 'rejected')) {
        setAdminError('Some dashboard data could not be loaded. Refresh to try again.');
      }
    } catch (err: unknown) {
      setAdminError(err instanceof Error ? err.message : 'Dashboard could not be loaded.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleUpdateTripStatus = async (tripId: string, newStatus: string) => {
    try {
      await api.admin.updateTripStatus(tripId, newStatus);
      setTrips((prev) =>
        prev.map((t) => (t.id === tripId ? { ...t, status: newStatus } : t)),
      );
    } catch (err: unknown) {
      setAdminError(err instanceof Error ? err.message : 'Trip status update failed.');
    }
    setActiveTripActionId(null);
  };

  const handleDeleteTrip = async (tripId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this trip room?')) return;
    try {
      await api.admin.deleteTrip(tripId);
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
    } catch (err: unknown) {
      setAdminError(err instanceof Error ? err.message : 'Trip deletion failed.');
    }
    setActiveTripActionId(null);
  };

  const filteredTrips = trips.filter((t) => {
    const matchesQuery =
      t.name.toLowerCase().includes(tripSearch.toLowerCase()) ||
      t.creator.toLowerCase().includes(tripSearch.toLowerCase()) ||
      t.destination.toLowerCase().includes(tripSearch.toLowerCase());
    const matchesFilter =
      tripStatusFilter === 'all' ? true : t.status === tripStatusFilter;
    return matchesQuery && matchesFilter;
  });

  const filteredUsers = users.filter((u) => {
    return (
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
    );
  });

  // Nav Items
  const navItems = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'trips', label: 'Trips Management', icon: MapPin },
    { id: 'users', label: 'Creators & Users', icon: Users },
    { id: 'usage', label: 'API Usage & Cost', icon: DollarSign },
    { id: 'health', label: 'System Health & Logs', icon: Server },
  ] as const;

  const sidebarContent = (
    <div
      style={{
        width: 240,
        height: '100%',
        padding: '24px 16px',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
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
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: INK,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Shield size={16} />
          </div>
          <span style={{ ...SERIF, fontSize: 17, fontWeight: 600, color: INK }}>
            Platform Admin
          </span>
        </div>

        <p
          style={{
            fontSize: 12,
            color: MUTED,
            padding: '0 8px',
            margin: '0 0 24px',
            lineHeight: 1.4,
          }}
        >
          Internal control center — restricted system access.
        </p>

        {/* Navigation Items */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setIsMobileDrawerOpen(false);
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
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Footer Navigation: Switch to user view & Logout */}
      <div
        style={{
          paddingTop: 16,
          borderTop: `1px solid ${BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={onSwitchToUserApp}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: INK,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={15} color={PINE} /> Switch to User App
        </button>

        <button
          type="button"
          onClick={() => {
            setAdminToken(null);
            onLogout();
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
            color: RED,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <LogOut size={15} color={RED} /> Exit Admin Portal
        </button>
      </div>
    </div>
  );

  return (
    <RequireAuth
      requiredRole="admin"
      screen="admin_dashboard"
      onRedirect={onLogout}
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
            <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>
              Platform Admin
            </span>
          </div>

          <button
            type="button"
            onClick={onSwitchToUserApp}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${BORDER}`,
              background: '#FAF6EE',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            User App
          </button>
        </header>
      )}

      {/* Sidebar: Desktop permanent or Mobile drawer */}
      {!isMobile ? (
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: `1px solid ${BORDER}`,
            background: '#fff',
            height: '100vh',
            position: 'sticky',
            top: 0,
          }}
        >
          {sidebarContent}
        </div>
      ) : isMobileDrawerOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            display: 'flex',
          }}
        >
          <div
            role="presentation"
            onClick={() => setIsMobileDrawerOpen(false)}
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
              zIndex: 100,
              width: 260,
              height: '100%',
              background: '#fff',
              boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                zIndex: 110,
              }}
            >
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                aria-label="Close admin menu"
                title="Close"
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: MUTED,
                }}
              >
                <X size={20} />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      ) : null}

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: isMobile ? '20px 16px 40px 16px' : '36px 48px',
          overflowY: 'auto',
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          {adminError && <p role="alert" style={{ color: RED }}>{adminError}</p>}
          {/* Top Info Bar */}
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
              <span
                style={{
                  fontSize: 12,
                  color: PINE,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  display: 'block',
                  marginBottom: 2,
                }}
              >
                Global System Oversight
              </span>
              <h1
                style={{
                  ...SERIF,
                  fontSize: 26,
                  fontWeight: 400,
                  margin: 0,
                  color: INK,
                }}
              >
                {activeTab === 'overview' && 'Platform Overview'}
                {activeTab === 'trips' && 'Trips Moderation & Management'}
                {activeTab === 'users' && 'Creator Accounts & Members'}
                {activeTab === 'usage' && 'API Quotas & External Costs'}
                {activeTab === 'health' && 'System Health & Infrastructure'}
              </h1>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SecondaryButton
                onClick={loadAdminData}
                disabled={refreshing}
                style={{
                  padding: '7px 12px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <RefreshCw
                  size={14}
                  className={refreshing ? 'animate-spin' : ''}
                />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </SecondaryButton>
            </div>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div>
              {/* Metrics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? '1fr 1fr'
                    : 'repeat(4, 1fr)',
                  gap: 14,
                  marginBottom: 32,
                }}
              >
                {metrics.map((m) => (
                  <div
                    key={m.label}
                    style={{
                      border: `1px solid ${BORDER}`,
                      borderRadius: 12,
                      padding: '18px 20px',
                      background: '#fff',
                      boxShadow: '0 1px 3px rgba(36,33,28,0.03)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: MUTED,
                        display: 'block',
                        marginBottom: 6,
                      }}
                    >
                      {m.label}
                    </span>
                    <span
                      style={{
                        ...SERIF,
                        fontSize: 28,
                        fontWeight: 600,
                        color: INK,
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      {m.value}
                    </span>
                    <span style={{ fontSize: 12, color: MUTED }}>
                      {m.sub}
                    </span>
                  </div>
                ))}
              </div>

              {/* Quick Health Indicator Banner */}
              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: '20px 24px',
                  background: '#fff',
                  marginBottom: 32,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}
                >
                  <h3
                    style={{
                      ...SERIF,
                      fontSize: 18,
                      fontWeight: 400,
                      margin: 0,
                    }}
                  >
                    Live Infrastructure Nodes
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('health')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: PINE,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    View detailed health & logs &rarr;
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile
                      ? '1fr 1fr'
                      : 'repeat(4, 1fr)',
                    gap: 12,
                  }}
                >
                  {systemHealth.map((s) => (
                    <div
                      key={s.name}
                      style={{
                        background: '#FAF8F3',
                        border: `1px solid ${BORDER}`,
                        borderRadius: 8,
                        padding: '12px 14px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: INK,
                          display: 'block',
                          marginBottom: 4,
                        }}
                      >
                        {s.name}
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: PINE_DARK,
                          fontWeight: 500,
                        }}
                      >
                        <CheckCircle2 size={13} color={PINE} /> Operational
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Audit Logs snippet */}
              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  background: '#fff',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: `1px solid ${BORDER}`,
                    background: '#FAF8F3',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                    Recent System Events & Agent Actions
                  </span>
                  <span style={{ fontSize: 12, color: MUTED }}>
                    No event feed configured
                  </span>
                </div>
                <div>
                  {AUDIT_LOGS.length === 0 && (
                    <p style={{ padding: '12px 20px', color: MUTED }}>Event logs are unavailable.</p>
                  )}
                  {AUDIT_LOGS.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '12px 20px',
                        borderBottom: `1px solid ${BORDER}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{
                          color: MUTED,
                          fontSize: 12,
                          fontFamily: 'monospace',
                          width: 60,
                        }}
                      >
                        {log.time}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background:
                            log.level === 'warn'
                              ? '#FBF0E8'
                              : '#E7F0EA',
                          color:
                            log.level === 'warn'
                              ? CLAY
                              : PINE_DARK,
                          textTransform: 'uppercase',
                        }}
                      >
                        {log.service}
                      </span>
                      <span style={{ color: INK, flex: 1 }}>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TRIPS MANAGEMENT */}
          {activeTab === 'trips' && (
            <div>
              {/* Search & Status Filters */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: 12,
                  justifyContent: 'space-between',
                  alignItems: isMobile ? 'stretch' : 'center',
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: isMobile ? '100%' : 320,
                  }}
                >
                  <Search
                    size={14}
                    color={MUTED}
                    style={{ position: 'absolute', left: 10, top: 11 }}
                  />
                  <input
                    value={tripSearch}
                    onChange={(e) => setTripSearch(e.target.value)}
                    placeholder="Search trips, creators, or cities..."
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 32px',
                      borderRadius: 8,
                      border: `1px solid ${BORDER}`,
                      fontSize: 13,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['all', 'active', 'flagged', 'closed'] as const).map(
                    (filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setTripStatusFilter(filter)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 20,
                          border: `1px solid ${
                            tripStatusFilter === filter
                              ? PINE
                              : BORDER
                          }`,
                          background:
                            tripStatusFilter === filter
                              ? '#EFEAE0'
                              : '#fff',
                          color:
                            tripStatusFilter === filter
                              ? PINE_DARK
                              : INK,
                          fontSize: 12,
                          fontWeight:
                            tripStatusFilter === filter ? 600 : 400,
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {filter}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Trips Table */}
              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.2fr 1fr 0.8fr 1fr 1fr 40px',
                    padding: '12px 16px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: MUTED,
                    borderBottom: `1px solid ${BORDER}`,
                    background: '#FAF8F3',
                  }}
                >
                  <span>Trip Name</span>
                  <span>Destination</span>
                  <span>Creator</span>
                  <span>Members</span>
                  <span>Dates</span>
                  <span>Status</span>
                  <span></span>
                </div>

                {filteredTrips.map((t) => {
                  const isMenuOpen = activeTripActionId === t.id;
                  return (
                    <div
                      key={t.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          '2fr 1.2fr 1fr 0.8fr 1fr 1fr 40px',
                        padding: '14px 16px',
                        fontSize: 13,
                        alignItems: 'center',
                        borderBottom: `1px solid ${BORDER}`,
                        position: 'relative',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: INK }}>
                        {t.name}
                      </span>
                      <span style={{ color: MUTED }}>{t.destination}</span>
                      <div>
                        <span
                          style={{
                            fontWeight: 500,
                            color: INK,
                            display: 'block',
                          }}
                        >
                          {t.creator}
                        </span>
                        <span style={{ fontSize: 11, color: MUTED }}>
                          {t.creator_email}
                        </span>
                      </div>
                      <span style={{ color: MUTED }}>
                        {t.members} people
                      </span>
                      <span style={{ fontSize: 12, color: MUTED }}>
                        {t.created}
                      </span>

                      {/* Status badge */}
                      <div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '3px 10px',
                            borderRadius: 20,
                            background:
                              t.status === 'active'
                                ? '#E7F0EA'
                                : t.status === 'flagged'
                                  ? '#FBF0E8'
                                  : '#F1EFE8',
                            color:
                              t.status === 'active'
                                ? PINE_DARK
                                : t.status === 'flagged'
                                  ? CLAY
                                  : MUTED,
                            textTransform: 'capitalize',
                            display: 'inline-block',
                          }}
                        >
                          {t.status}
                        </span>
                      </div>

                      {/* Actions Menu */}
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveTripActionId(
                              isMenuOpen ? null : t.id,
                            )
                          }
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: MUTED,
                            padding: 4,
                          }}
                          aria-label="Trip actions"
                        >
                          <MoreHorizontal size={16} />
                        </button>

                        {isMenuOpen && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 26,
                              zIndex: 60,
                              background: '#fff',
                              border: `1px solid ${BORDER}`,
                              borderRadius: 8,
                              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                              width: 170,
                              overflow: 'hidden',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateTripStatus(
                                  t.id,
                                  t.status === 'flagged'
                                    ? 'active'
                                    : 'flagged',
                                )
                              }
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                border: 'none',
                                background: 'transparent',
                                textAlign: 'left',
                                fontSize: 13,
                                color: CLAY,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <Flag size={13} />
                              {t.status === 'flagged'
                                ? 'Unflag Trip'
                                : 'Flag Trip'}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateTripStatus(
                                  t.id,
                                  t.status === 'closed'
                                    ? 'active'
                                    : 'closed',
                                )
                              }
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                border: 'none',
                                background: 'transparent',
                                textAlign: 'left',
                                fontSize: 13,
                                color: INK,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <Check size={13} />
                              {t.status === 'closed'
                                ? 'Reopen Trip'
                                : 'Close Trip'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteTrip(t.id)}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderTop: `1px solid ${BORDER}`,
                                background: 'transparent',
                                textAlign: 'left',
                                fontSize: 13,
                                color: RED,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <Trash2 size={13} /> Delete Trip
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredTrips.length === 0 && (
                  <div
                    style={{
                      padding: '36px 16px',
                      textAlign: 'center',
                      color: MUTED,
                      fontSize: 14,
                    }}
                  >
                    No trips found matching "{tripSearch}".
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CREATORS & USERS */}
          {activeTab === 'users' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 18,
                }}
              >
                <div style={{ position: 'relative', width: 320 }}>
                  <Search
                    size={14}
                    color={MUTED}
                    style={{ position: 'absolute', left: 10, top: 11 }}
                  />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search users by name or email..."
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 32px',
                      borderRadius: 8,
                      border: `1px solid ${BORDER}`,
                      fontSize: 13,
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
                <span style={{ fontSize: 13, color: MUTED }}>
                  {filteredUsers.length} total registered accounts
                </span>
              </div>

              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 2fr 1.2fr 1fr 1.2fr',
                    padding: '12px 16px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: MUTED,
                    borderBottom: `1px solid ${BORDER}`,
                    background: '#FAF8F3',
                  }}
                >
                  <span>User</span>
                  <span>Email Address</span>
                  <span>Platform Role</span>
                  <span>Trips Created</span>
                  <span>Joined Date</span>
                </div>

                {filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 2fr 1.2fr 1fr 1.2fr',
                      padding: '14px 16px',
                      fontSize: 13,
                      alignItems: 'center',
                      borderBottom: `1px solid ${BORDER}`,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: INK }}>
                      {u.name}
                    </span>
                    <span style={{ color: MUTED, fontFamily: 'monospace' }}>
                      {u.email}
                    </span>
                    <div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 20,
                          background: u.is_admin ? '#EFEAE0' : '#E7F0EA',
                          color: u.is_admin ? PINE_DARK : PINE,
                        }}
                      >
                        {u.is_admin ? 'Administrator' : 'Trip Creator'}
                      </span>
                    </div>
                    <span style={{ color: INK }}>
                      {u.trips_count} trips
                    </span>
                    <span style={{ color: MUTED, fontSize: 12 }}>
                      {u.created_at}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: API USAGE & COST */}
          {activeTab === 'usage' && (
            <div style={{ maxWidth: 680 }}>
              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: '24px 28px',
                  background: '#fff',
                  marginBottom: 24,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <h3
                    style={{
                      ...SERIF,
                      fontSize: 19,
                      fontWeight: 400,
                      margin: 0,
                    }}
                  >
                    External API Quotas & Spend
                  </h3>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 8px',
                      borderRadius: 12,
                      background: '#EFEAE0',
                      color: PINE_DARK,
                    }}
                  >
                    Usage collector unavailable
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: MUTED,
                    margin: '0 0 24px',
                    lineHeight: 1.5,
                  }}
                >
                  External API calls and billing are not currently recorded by this application.
                </p>

                {apiUsage.length === 0 && (
                  <p style={{ color: MUTED }}>No API usage data is available.</p>
                )}

                {apiUsage.map((item) => {
                  const pct = Math.min(
                    100,
                    Math.round((item.used / item.freeLimit) * 100),
                  );
                  const color =
                    pct > 90 ? RED : pct > 70 ? CLAY : PINE;
                  return (
                    <div key={item.name} style={{ marginBottom: 24 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                          {item.name}
                        </span>
                        <span style={{ fontSize: 13, color: MUTED }}>
                          {item.used.toLocaleString()} /{' '}
                          {item.freeLimit.toLocaleString()} free ({pct}%)
                          {item.cost > 0
                            ? ` · $${item.cost.toFixed(2)} MTD`
                            : ' · $0.00'}
                        </span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: 7,
                          borderRadius: 4,
                          background: '#EFEAE0',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: color,
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Redis Caching Efficiency Card */}
              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: '20px 24px',
                  background: '#FAF8F3',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Database size={16} color={PINE} />
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: INK,
                      }}
                    >
                      Caching Savings & Optimization
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 8px',
                      borderRadius: 12,
                      background: '#EFEAE0',
                      color: PINE_DARK,
                    }}
                  >
                    Simulated
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: MUTED,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Local Redis and SQLite Place caching prevents redundant external lookups for common attractions and transit times, maintaining cache hits and reducing Google Places charges.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: SYSTEM HEALTH */}
          {activeTab === 'health' && (
            <div>
              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#fff',
                  marginBottom: 28,
                }}
              >
                <div
                  style={{
                    padding: '14px 20px',
                    borderBottom: `1px solid ${BORDER}`,
                    background: '#FAF8F3',
                    fontSize: 13,
                    fontWeight: 600,
                    color: INK,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Core Infrastructure Services</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 8px',
                      borderRadius: 12,
                      background: '#EFEAE0',
                      color: PINE_DARK,
                    }}
                  >
                    No event feed configured
                  </span>
                </div>

                {systemHealth.map((s, idx) => {
                  const icons: Record<string, typeof Database> = {
                    'Postgres / SQLite DB': Database,
                    'Redis Cache': Database,
                    'Nginx Gateway': Server,
                    'Gemini LLM API': Cloud,
                  };
                  const Icon = icons[s.name] || Activity;
                  return (
                    <div
                      key={s.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderBottom:
                          idx < systemHealth.length - 1
                            ? `1px solid ${BORDER}`
                            : 'none',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: '#FAF8F3',
                            border: `1px solid ${BORDER}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon size={16} color={PINE} />
                        </div>
                        <div>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: INK,
                              display: 'block',
                            }}
                          >
                            {s.name}
                          </span>
                          <span style={{ fontSize: 12, color: MUTED }}>
                            {s.detail}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 13,
                          color: PINE_DARK,
                          fontWeight: 600,
                        }}
                      >
                        <CheckCircle2 size={16} color={PINE} /> Operational
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* System Audit Logs */}
              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    padding: '14px 20px',
                    borderBottom: `1px solid ${BORDER}`,
                    background: '#FAF8F3',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: INK,
                    }}
                  >
                    System Activity & Event Logs
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 12, background: '#EFEAE0', color: PINE_DARK }}>
                    Simulated Data
                  </span>
                </div>

                {AUDIT_LOGS.length === 0 && (
                  <p style={{ padding: '12px 20px', color: MUTED }}>Event logs are unavailable.</p>
                )}
                {AUDIT_LOGS.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      padding: '12px 20px',
                      borderBottom: `1px solid ${BORDER}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'monospace',
                        color: MUTED,
                        fontSize: 12,
                      }}
                    >
                      {l.time}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background:
                          l.level === 'warn' ? '#FBF0E8' : '#E7F0EA',
                        color: l.level === 'warn' ? CLAY : PINE_DARK,
                      }}
                    >
                      {l.service}
                    </span>
                    <span style={{ color: INK }}>{l.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      </div>
    </RequireAuth>
  );
}
