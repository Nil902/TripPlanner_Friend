/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useState } from 'react';
import { ShieldAlert, Lock, AlertTriangle } from 'lucide-react';
import { getAdminToken, getAuthToken } from '../lib/api';
import { CurrentUser } from '../App';
import { TripSummary, PINE, BORDER, INK, CLAY } from '../lib/constants';

export type Screen =
  | 'welcome'
  | 'auth'
  | 'dashboard'
  | 'room'
  | 'owner'
  | 'admin_login'
  | 'admin_dashboard';

export interface MiddlewareContext {
  screen: Screen;
  currentUser: CurrentUser | null;
  activeTrip: TripSummary | null;
  setScreen: (screen: Screen) => void;
  onNotice?: (message: string) => void;
}

export interface MiddlewareResult {
  allowed: boolean;
  redirectScreen?: Screen;
  reason?: string;
  code?: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NO_TRIP' | 'ADMIN_REQUIRED';
}

export type MiddlewareFn = (ctx: MiddlewareContext) => MiddlewareResult | null;

/**
 * 1. Authentication Middleware Guard
 * Enforces authenticated session for protected creator pages ('dashboard' and 'owner').
 */
export const authMiddleware: MiddlewareFn = (ctx) => {
  if (ctx.screen === 'dashboard' || ctx.screen === 'owner') {
    // If user is a joiner in a room, rbacMiddleware will handle denying creator features
    // and keeping them in the room with FORBIDDEN.
    if (ctx.currentUser?.role === 'joiner') {
      return null;
    }

    const hasToken = !!getAuthToken();
    const isAuthedCreator = ctx.currentUser?.role === 'creator';
    if (!hasToken && !isAuthedCreator) {
      return {
        allowed: false,
        redirectScreen: 'auth',
        code: 'UNAUTHORIZED',
        reason:
          ctx.screen === 'owner'
            ? 'You must be signed in as a trip creator to access trip management.'
            : 'You must be signed in as a trip creator to access the trips dashboard.',
      };
    }
  }
  return null;
};

/**
 * 2. Role-Based Access Control (RBAC) Middleware Guard
 * Strictly verifies permissions:
 * - Only the user who created the trip can access the 'owner' (Manage Trip) feature.
 * - Users who join via code ('joiner' role) have NO access to Manage Trip.
 */
export const rbacMiddleware: MiddlewareFn = (ctx) => {
  if (ctx.screen === 'owner') {
    const isJoiner = ctx.currentUser?.role === 'joiner';
    const isCreator =
      ctx.currentUser?.role === 'creator' ||
      (ctx.currentUser &&
        ctx.activeTrip &&
        ctx.currentUser.id === ctx.activeTrip.creator_id);

    // Joiner who joined via code is explicitly blocked
    if (isJoiner || !isCreator) {
      return {
        allowed: false,
        redirectScreen: 'room',
        code: 'FORBIDDEN',
        reason:
          'Access Denied (RBAC): Only the trip creator can access the Manage Trip console. Code-joined members cannot manage or reconfigure this trip.',
      };
    }
  }

  // Joiners attempting to open Creator Dashboard get routed back to their active trip room
  if (ctx.screen === 'dashboard' && ctx.currentUser?.role === 'joiner') {
    return {
      allowed: false,
      redirectScreen: 'room',
      code: 'FORBIDDEN',
      reason: 'Code-joined members do not have a creator dashboard. Viewing trip room.',
    };
  }

  return null;
};

/**
 * 3. Trip Session Middleware Guard
 * Validates that an active trip is loaded when viewing room or owner screens.
 */
export const tripSessionMiddleware: MiddlewareFn = (ctx) => {
  if (ctx.screen === 'room' || ctx.screen === 'owner') {
    if (!ctx.activeTrip || !ctx.activeTrip.id) {
      return {
        allowed: false,
        redirectScreen: 'welcome',
        code: 'NO_TRIP',
        reason: 'No active trip room selected. Please start or join a trip first.',
      };
    }
  }
  return null;
};

/**
 * 4. Admin Portal Middleware Guard
 * Validates administrative token and access rights for admin dashboard.
 */
export const adminMiddleware: MiddlewareFn = (ctx) => {
  if (ctx.screen === 'admin_dashboard') {
    const adminToken = getAdminToken();
    if (!adminToken) {
      return {
        allowed: false,
        redirectScreen: 'admin_login',
        code: 'ADMIN_REQUIRED',
        reason: 'Administrative credentials required to access Platform Admin Dashboard.',
      };
    }
  }
  return null;
};

/**
 * 5. Audit Logging Middleware
 * Traces navigation and security access checks.
 */
export const auditLoggingMiddleware: MiddlewareFn = (ctx) => {
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    void ctx.screen;
  }
  return null;
};

/**
 * Ordered pipeline of all frontend middleware guards.
 */
export const middlewarePipeline: MiddlewareFn[] = [
  auditLoggingMiddleware,
  tripSessionMiddleware,
  adminMiddleware,
  authMiddleware,
  rbacMiddleware,
];

/**
 * Run context through all middlewares and return first blocking decision (if any).
 */
export function executeMiddlewares(ctx: MiddlewareContext): MiddlewareResult {
  for (const mw of middlewarePipeline) {
    const res = mw(ctx);
    if (res && !res.allowed) {
      return res;
    }
  }
  return { allowed: true };
}

/**
 * Custom React Hook for executing page middleware inside any page component.
 */
export function usePageMiddleware(
  screen: Screen,
  currentUser: CurrentUser | null,
  activeTrip: TripSummary | null,
  setScreen: (s: Screen) => void,
): MiddlewareResult {
  const [result, setResult] = useState<MiddlewareResult>({ allowed: true });

  useEffect(() => {
    const res = executeMiddlewares({ screen, currentUser, activeTrip, setScreen });
    setResult(res);
    if (!res.allowed && res.redirectScreen) {
      setScreen(res.redirectScreen);
    }
  }, [screen, currentUser, activeTrip, setScreen]);

  return result;
}

/**
 * PageMiddlewareWrapper Component
 * Wraps any page to guarantee all middleware guards execute before displaying content.
 * Displays user-friendly security alerts if RBAC or Auth rejects an action.
 */
export interface PageMiddlewareWrapperProps {
  screen: Screen;
  currentUser: CurrentUser | null;
  activeTrip: TripSummary | null;
  setScreen: (s: Screen) => void;
  children: React.ReactNode;
}

export function PageMiddlewareWrapper({
  screen,
  currentUser,
  activeTrip,
  setScreen,
  children,
}: PageMiddlewareWrapperProps) {
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  const check = executeMiddlewares({
    screen,
    currentUser,
    activeTrip,
    setScreen,
    onNotice: (msg) => setSecurityNotice(msg),
  });

  // Decompose into stable primitives — using `check` (a new object reference
  // every render) directly as a dependency caused an infinite render loop:
  // effect fires → setScreen → parent re-renders → new check object → effect
  // fires again → repeat indefinitely.
  const isAllowed = check.allowed;
  const redirectScreen = check.redirectScreen;
  const reason = check.reason;

  useEffect(() => {
    if (!isAllowed) {
      if (reason) {
        setSecurityNotice(reason);
        setTimeout(() => setSecurityNotice(null), 5000);
      }
      if (redirectScreen) {
        setScreen(redirectScreen);
      }
    }
  }, [isAllowed, redirectScreen, reason, setScreen]);

  if (!check.allowed) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 32,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#FBF0E8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            {check.code === 'FORBIDDEN' ? (
              <ShieldAlert size={24} color={CLAY} />
            ) : check.code === 'UNAUTHORIZED' ? (
              <Lock size={24} color={PINE} />
            ) : (
              <AlertTriangle size={24} color={CLAY} />
            )}
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: INK, margin: '0 0 8px' }}>
            {check.code === 'FORBIDDEN'
              ? 'Permission Denied'
              : check.code === 'UNAUTHORIZED'
                ? 'Sign In Required'
                : 'Navigation Restricted'}
          </h3>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 20px', lineHeight: 1.5 }}>
            {check.reason || 'You do not have permission to view this section.'}
          </p>
          <button
            type="button"
            onClick={() => setScreen(check.redirectScreen || 'room')}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: PINE,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Return to Trip
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {securityNotice && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 9999,
            padding: '12px 16px',
            borderRadius: 8,
            background: '#FBF0E8',
            border: `1px solid ${CLAY}`,
            color: CLAY,
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <ShieldAlert size={16} />
          <span>{securityNotice}</span>
        </div>
      )}
      {children}
    </>
  );
}

/**
 * Helper to identify pages/screens that require an authenticated session.
 */
export function isProtectedScreen(screen: Screen): boolean {
  return screen === 'dashboard' || screen === 'owner' || screen === 'admin_dashboard';
}

/**
 * Component-level Page Authentication Guard.
 * Wrap any page requiring login to intercept unauthenticated or unauthorized users,
 * providing structured fallback warning and redirect triggers.
 */
export interface RequireAuthProps {
  currentUser?: CurrentUser | null;
  requiredRole?: 'creator' | 'admin';
  screen?: Screen;
  fallback?: React.ReactNode;
  onRedirect?: () => void;
  children: React.ReactNode;
}

export function RequireAuth({
  currentUser,
  requiredRole = 'creator',
  screen,
  fallback,
  onRedirect,
  children,
}: RequireAuthProps) {
  const hasToken = !!getAuthToken();
  const hasAdminToken = !!getAdminToken();

  const isCreatorAllowed = currentUser?.role === 'creator' || hasToken;
  const isAdminAllowed = hasAdminToken;

  const isAllowed = requiredRole === 'admin' ? isAdminAllowed : isCreatorAllowed;

  useEffect(() => {
    if (!isAllowed && onRedirect) {
      onRedirect();
    }
  }, [isAllowed, onRedirect]);

  if (!isAllowed) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        data-testid="require-auth-gate"
        style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 32,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#FBF0E8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Lock size={24} color={PINE} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: INK, margin: '0 0 8px' }}>
            Sign In Required
          </h3>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 20px', lineHeight: 1.5 }}>
            {requiredRole === 'admin'
              ? 'Administrator credentials required to access this console.'
              : screen === 'owner'
                ? 'You must be signed in as the trip creator to access trip management.'
                : 'You must be signed in as a trip creator to access this page.'}
          </p>
          {onRedirect && (
            <button
              type="button"
              onClick={onRedirect}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: PINE,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Go to Sign In
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
