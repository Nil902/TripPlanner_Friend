import {
  Users,
  CalendarDays,
  MapPin,
  Wallet,
  ArrowLeft,
  X,
  Settings,
} from 'lucide-react';
import {
  BORDER,
  INK,
  MUTED,
  PINE,
  PINE_DARK,
  SERIF,
} from '../lib/constants';

export interface SidebarProps {
  active: string;
  setActive: (id: string) => void;
  tripName: string;
  onExitRoom?: () => void;
  currentUser?: { id?: string; name: string; role?: string } | null;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenAdmin?: () => void;
}

export default function Sidebar({
  active,
  setActive,
  tripName,
  onExitRoom,
  currentUser,
  isMobileOpen = false,
  onCloseMobile,
  onOpenAdmin,
}: SidebarProps) {
  const items = [
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'plans', label: 'Your plans', icon: CalendarDays },
    { id: 'itinerary', label: 'Itinerary', icon: MapPin },
    { id: 'costs', label: 'Costs', icon: Wallet },
  ];

  const handleItemClick = (id: string) => {
    setActive(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

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
        {/* Trip Brandmark & Mobile Close button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 4px',
            marginBottom: 20,
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: PINE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MapPin color="#fff" size={16} />
            </div>
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <span
                style={{
                  ...SERIF,
                  fontSize: 16,
                  fontWeight: 600,
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: INK,
                  minWidth: 0,
                  maxWidth: '100%',
                }}
                title={tripName}
              >
                {tripName}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: MUTED,
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Group Trip Room
              </span>
            </div>
          </div>

          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              style={{
                border: 'none',
                background: 'transparent',
                color: MUTED,
                cursor: 'pointer',
                padding: 4,
                flexShrink: 0,
              }}
              title="Close Menu"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* User Identity Pill */}
        {currentUser && (
          <div
            style={{
              margin: '0 0 16px',
              padding: '8px 10px',
              borderRadius: 8,
              background: '#FAF6EE',
              border: `1px solid ${BORDER}`,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          >
            <span
              style={{
                color: INK,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
              title={currentUser.name}
            >
              👤 {currentUser.name}
            </span>
            <span
              style={{
                color: MUTED,
                fontSize: 10,
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              {currentUser.role || 'Member'}
            </span>
          </div>
        )}

        {/* Navigation Items */}
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.id;
          return (
            <button
              key={it.id}
              onClick={() => handleItemClick(it.id)}
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

        {/* Creator Admin & Settings Button */}
        {currentUser?.role === 'creator' && onOpenAdmin && (
          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              onOpenAdmin();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${BORDER}`,
              background: '#FAF6EE',
              color: PINE_DARK,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 10,
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
          >
            <Settings size={16} color={PINE} />
            <span>Manage Trip</span>
          </button>
        )}
      </div>

      {/* Footer / Exit Room */}
      {onExitRoom && (
        <div style={{ paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              onExitRoom();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: MUTED,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={14} />{' '}
            {currentUser?.role === 'joiner'
              ? 'Leave Trip / Switch Room'
              : 'Exit Room / All Trips'}
          </button>
        </div>
      )}
    </div>
  );

  // If mobile drawer
  if (onCloseMobile) {
    if (!isMobileOpen) return null;
    return (
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
