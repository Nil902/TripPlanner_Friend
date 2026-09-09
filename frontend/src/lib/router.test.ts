import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPathForScreen, parseRouteFromLocation } from './router';
import * as apiModule from './api';

describe('Application URL Router & Route Synchronization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('getPathForScreen (Screen State -> URL Path)', () => {
    it('maps welcome screen to root /', () => {
      expect(getPathForScreen('welcome')).toBe('/');
    });

    it('maps auth screen to /auth', () => {
      expect(getPathForScreen('auth')).toBe('/auth');
    });

    it('maps dashboard screen to /dashboard', () => {
      expect(getPathForScreen('dashboard')).toBe('/dashboard');
    });

    it('maps default group trip room to /room', () => {
      expect(getPathForScreen('room')).toBe('/room');
    });

    it('maps group trip room with specific tab to /room?tab=:tab', () => {
      expect(getPathForScreen('room', 'itinerary')).toBe('/room?tab=itinerary');
      expect(getPathForScreen('room', 'plans')).toBe('/room?tab=plans');
      expect(getPathForScreen('room', 'costs')).toBe('/room?tab=costs');
      expect(getPathForScreen('room', 'overview')).toBe('/room');
    });

    it('maps group trip room with custom trip ID and tab', () => {
      expect(getPathForScreen('room', 'itinerary', 'trip-tokyo-101')).toBe(
        '/room?trip=trip-tokyo-101&tab=itinerary',
      );
      expect(getPathForScreen('room', 'overview', 'trip-tokyo-101')).toBe(
        '/room?trip=trip-tokyo-101',
      );
    });

    it('maps owner (Manage Trip) to /manage', () => {
      expect(getPathForScreen('owner')).toBe('/manage');
      expect(getPathForScreen('owner', 'overview', 'trip-osaka-99')).toBe(
        '/manage?trip=trip-osaka-99',
      );
    });

    it('maps admin_login to /admin', () => {
      expect(getPathForScreen('admin_login')).toBe('/admin');
    });

    it('maps admin_dashboard to /admindashboard', () => {
      expect(getPathForScreen('admin_dashboard')).toBe('/admindashboard');
    });
  });

  describe('parseRouteFromLocation (URL Path & Query -> Screen State)', () => {
    it('parses root / as welcome', () => {
      const parsed = parseRouteFromLocation('/', '', '');
      expect(parsed.screen).toBe('welcome');
    });

    it('parses /auth, /login, and /signup as auth screen', () => {
      expect(parseRouteFromLocation('/auth', '', '').screen).toBe('auth');
      expect(parseRouteFromLocation('/login', '', '').screen).toBe('auth');
      expect(parseRouteFromLocation('/signup', '', '').screen).toBe('auth');
    });

    it('parses /dashboard and /trips as creator dashboard screen', () => {
      expect(parseRouteFromLocation('/dashboard', '', '').screen).toBe('dashboard');
      expect(parseRouteFromLocation('/trips', '', '').screen).toBe('dashboard');
    });

    it('parses /room with tab query parameters', () => {
      const p1 = parseRouteFromLocation('/room', '', '');
      expect(p1.screen).toBe('room');
      expect(p1.tab).toBeUndefined();

      const p2 = parseRouteFromLocation('/room', '?tab=itinerary', '');
      expect(p2.screen).toBe('room');
      expect(p2.tab).toBe('itinerary');

      const p3 = parseRouteFromLocation('/room', '?tab=costs&trip=tokyo-5', '');
      expect(p3.screen).toBe('room');
      expect(p3.tab).toBe('costs');
      expect(p3.tripId).toBe('tokyo-5');
    });

    it('parses /manage and /owner as owner console', () => {
      expect(parseRouteFromLocation('/manage', '', '').screen).toBe('owner');
      expect(parseRouteFromLocation('/owner', '', '').screen).toBe('owner');
      expect(parseRouteFromLocation('/manage', '?trip=paris-10', '').tripId).toBe('paris-10');
    });

    it('parses /admin as admin_login when unauthenticated', () => {
      vi.spyOn(apiModule, 'getAdminToken').mockReturnValue(null);
      const parsed = parseRouteFromLocation('/admin', '', '');
      expect(parsed.screen).toBe('admin_login');
    });

    it('parses /admin as admin_dashboard when admin token exists', () => {
      vi.spyOn(apiModule, 'getAdminToken').mockReturnValue('jwt-admin-token');
      const parsed = parseRouteFromLocation('/admin', '', '');
      expect(parsed.screen).toBe('admin_dashboard');
    });

    it('parses /admindashboard as admin_dashboard when admin token exists', () => {
      vi.spyOn(apiModule, 'getAdminToken').mockReturnValue('jwt-admin-token');
      const parsed = parseRouteFromLocation('/admindashboard', '', '');
      expect(parsed.screen).toBe('admin_dashboard');
    });

    it('redirects /admindashboard to admin_login when no admin token exists', () => {
      vi.spyOn(apiModule, 'getAdminToken').mockReturnValue(null);
      const parsed = parseRouteFromLocation('/admindashboard', '', '');
      expect(parsed.screen).toBe('admin_login');
    });

    it('parses invite code parameters on welcome page (?code=lisbon-202)', () => {
      const parsed = parseRouteFromLocation('/', '?code=lisbon-202', '');
      expect(parsed.screen).toBe('welcome');
      expect(parsed.joinCode).toBe('lisbon-202');
    });
  });
});
