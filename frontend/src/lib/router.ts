import { getAdminToken } from './api';

export type Screen =
  | 'welcome'
  | 'auth'
  | 'dashboard'
  | 'room'
  | 'owner'
  | 'admin_login'
  | 'admin_dashboard';

export type ActiveTab = 'overview' | 'plans' | 'itinerary' | 'costs';

export interface ParsedRoute {
  screen: Screen;
  tab?: ActiveTab;
  tripId?: string;
  joinCode?: string;
}

/**
 * Returns the canonical URL path and query string for a given application screen and state.
 */
export function getPathForScreen(
  screen: Screen,
  tab: ActiveTab = 'overview',
  tripId?: string,
): string {
  switch (screen) {
    case 'admin_dashboard':
      return '/admindashboard';
    case 'admin_login':
      return '/admin';
    case 'dashboard':
      return '/dashboard';
    case 'auth':
      return '/auth';
    case 'owner':
      return tripId && tripId !== 'trip-lisbon-202'
        ? `/manage?trip=${encodeURIComponent(tripId)}`
        : '/manage';
    case 'room': {
      const params = new URLSearchParams();
      if (tripId && tripId !== 'trip-lisbon-202') {
        params.set('trip', tripId);
      }
      if (tab !== 'overview') {
        params.set('tab', tab);
      }
      const qs = params.toString();
      return qs ? `/room?${qs}` : '/room';
    }
    case 'welcome':
    default:
      return '/';
  }
}

/**
 * Parses the current window location (pathname, search query, hash) into app screen state.
 */
export function parseRouteFromLocation(
  pathname: string,
  search: string,
  hash: string,
): ParsedRoute {
  const query = new URLSearchParams(search);

  const rawTab = query.get('tab');
  const validTabs: ActiveTab[] = ['overview', 'plans', 'itinerary', 'costs'];
  const tab: ActiveTab | undefined = validTabs.includes(rawTab as ActiveTab)
    ? (rawTab as ActiveTab)
    : undefined;

  const tripId = query.get('trip') || query.get('id') || undefined;
  const joinCode = query.get('code') || undefined;

  // 1. Admin dashboard
  if (pathname === '/admindashboard' || pathname === '/admin/dashboard') {
    return {
      screen: getAdminToken() ? 'admin_dashboard' : 'admin_login',
    };
  }

  // 2. Admin login
  if (
    pathname === '/admin' ||
    pathname === '/admin/login' ||
    hash === '#admin' ||
    query.has('admin')
  ) {
    return {
      screen: getAdminToken() ? 'admin_dashboard' : 'admin_login',
    };
  }

  // 3. Creator Trips Dashboard
  if (pathname === '/dashboard' || pathname === '/trips') {
    return { screen: 'dashboard' };
  }

  // 4. Creator Auth
  if (pathname === '/auth' || pathname === '/login' || pathname === '/signup') {
    return { screen: 'auth' };
  }

  // 5. Manage Trip (Owner console)
  if (pathname === '/manage' || pathname === '/owner') {
    return { screen: 'owner', tripId };
  }

  // 6. Group Trip Room
  if (pathname === '/room') {
    return { screen: 'room', tab, tripId };
  }

  // Default welcome
  return { screen: 'welcome', tripId, joinCode };
}
