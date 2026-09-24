import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import {
  authMiddleware,
  rbacMiddleware,
  tripSessionMiddleware,
  adminMiddleware,
  executeMiddlewares,
  PageMiddlewareWrapper,
  RequireAuth,
} from './index';
import Sidebar from '../components/Sidebar';
import TripsDashboardPage from '../pages/TripsDashboardPage';
import OwnerTripPage from '../pages/OwnerTripPage';
import type { TripSummary } from '../lib/constants';
import * as apiModule from '../lib/api';
import type { Trip } from '@shared/types';

const DEFAULT_TRIP: TripSummary = {
  id: 'trip-lisbon-202',
  title: 'Lisbon trip',
  destination: 'Lisbon, Portugal',
  start_date: '2026-06-12',
  end_date: '2026-06-14',
  creator_id: 'alice',
  status: 'collecting_constraints',
  member_ids: ['alice', 'bob', 'cara'],
};

describe('Frontend RBAC & Route Middleware Guards', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  describe('authMiddleware', () => {
    it('blocks unauthenticated access to creator dashboard', () => {
      vi.spyOn(apiModule, 'getAuthToken').mockReturnValue(null);
      const res = authMiddleware({
        screen: 'dashboard',
        currentUser: null,
        activeTrip: DEFAULT_TRIP,
        setScreen: vi.fn(),
      });
      expect(res).not.toBeNull();
      expect(res?.allowed).toBe(false);
      expect(res?.code).toBe('UNAUTHORIZED');
      expect(res?.redirectScreen).toBe('auth');
    });

    it('allows authenticated creator access to creator dashboard', () => {
      vi.spyOn(apiModule, 'getAuthToken').mockReturnValue('valid-creator-token');
      const res = authMiddleware({
        screen: 'dashboard',
        currentUser: { id: 'alice', name: 'Alice', email: 'alice@example.com', role: 'creator' },
        activeTrip: DEFAULT_TRIP,
        setScreen: vi.fn(),
      });
      expect(res).toBeNull();
    });

    it('blocks unauthenticated access to Manage Trip (owner screen)', () => {
      vi.spyOn(apiModule, 'getAuthToken').mockReturnValue(null);
      const res = authMiddleware({
        screen: 'owner',
        currentUser: null,
        activeTrip: DEFAULT_TRIP,
        setScreen: vi.fn(),
      });
      expect(res).not.toBeNull();
      expect(res?.allowed).toBe(false);
      expect(res?.code).toBe('UNAUTHORIZED');
      expect(res?.redirectScreen).toBe('auth');
      expect(res?.reason).toContain('You must be signed in as a trip creator');
    });

    it('allows authenticated creator access to Manage Trip (owner screen)', () => {
      vi.spyOn(apiModule, 'getAuthToken').mockReturnValue('valid-creator-token');
      const res = authMiddleware({
        screen: 'owner',
        currentUser: { id: 'alice', name: 'Alice', email: 'alice@example.com', role: 'creator' },
        activeTrip: DEFAULT_TRIP,
        setScreen: vi.fn(),
      });
      expect(res).toBeNull();
    });
  });

  describe('rbacMiddleware', () => {
    it('strictly blocks guest joiners from Manage Trip (owner screen)', () => {
      const res = rbacMiddleware({
        screen: 'owner',
        currentUser: { id: 'guest-1', name: 'Bob Guest', role: 'joiner' },
        activeTrip: DEFAULT_TRIP,
        setScreen: vi.fn(),
      });
      expect(res).not.toBeNull();
      expect(res?.allowed).toBe(false);
      expect(res?.code).toBe('FORBIDDEN');
      expect(res?.redirectScreen).toBe('room');
      expect(res?.reason).toContain('Access Denied (RBAC)');
    });

    it('allows trip creator to access Manage Trip (owner screen)', () => {
      const res = rbacMiddleware({
        screen: 'owner',
        currentUser: { id: 'alice', name: 'Alice', email: 'alice@example.com', role: 'creator' },
        activeTrip: DEFAULT_TRIP,
        setScreen: vi.fn(),
      });
      expect(res).toBeNull();
    });

    it('blocks joiners from accessing the creator dashboard', () => {
      const res = rbacMiddleware({
        screen: 'dashboard',
        currentUser: { id: 'guest-1', name: 'Bob Guest', role: 'joiner' },
        activeTrip: DEFAULT_TRIP,
        setScreen: vi.fn(),
      });
      expect(res).not.toBeNull();
      expect(res?.allowed).toBe(false);
      expect(res?.redirectScreen).toBe('room');
    });
  });

  describe('tripSessionMiddleware', () => {
    it('redirects to welcome if room screen accessed without active trip', () => {
      const res = tripSessionMiddleware({
        screen: 'room',
        currentUser: null,
        activeTrip: null,
        setScreen: vi.fn(),
      });
      expect(res).not.toBeNull();
      expect(res?.allowed).toBe(false);
      expect(res?.code).toBe('NO_TRIP');
      expect(res?.redirectScreen).toBe('welcome');
    });
  });

  describe('adminMiddleware', () => {
    it('blocks admin dashboard when no admin token present', () => {
      vi.spyOn(apiModule, 'getAdminToken').mockReturnValue(null);
      const res = adminMiddleware({
        screen: 'admin_dashboard',
        currentUser: null,
        activeTrip: null,
        setScreen: vi.fn(),
      });
      expect(res).not.toBeNull();
      expect(res?.allowed).toBe(false);
      expect(res?.code).toBe('ADMIN_REQUIRED');
      expect(res?.redirectScreen).toBe('admin_login');
    });

    it('allows admin dashboard when valid admin token exists', () => {
      vi.spyOn(apiModule, 'getAdminToken').mockReturnValue('valid-admin-jwt');
      const res = adminMiddleware({
        screen: 'admin_dashboard',
        currentUser: null,
        activeTrip: null,
        setScreen: vi.fn(),
      });
      expect(res).toBeNull();
    });
  });

  describe('executeMiddlewares pipeline', () => {
    it('runs the full middleware pipeline in priority order', () => {
      const result = executeMiddlewares({
        screen: 'owner',
        currentUser: { id: 'guest-123', name: 'Guest User', role: 'joiner' },
        activeTrip: DEFAULT_TRIP,
        setScreen: vi.fn(),
      });
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('FORBIDDEN');
    });
  });

  describe('PageMiddlewareWrapper component', () => {
    it('renders child components when allowed', () => {
      render(
        <PageMiddlewareWrapper
          screen="welcome"
          currentUser={null}
          activeTrip={null}
          setScreen={vi.fn()}
        >
          <div data-testid="allowed-content">Public Welcome Content</div>
        </PageMiddlewareWrapper>,
      );
      expect(screen.getByTestId('allowed-content')).toBeInTheDocument();
    });

    it('intercepts and displays security notice when RBAC blocks joiner from Manage Trip', () => {
      const setScreenMock = vi.fn();
      render(
        <PageMiddlewareWrapper
          screen="owner"
          currentUser={{ id: 'guest-bob', name: 'Bob', role: 'joiner' }}
          activeTrip={DEFAULT_TRIP}
          setScreen={setScreenMock}
        >
          <div data-testid="secret-owner-content">Secret Owner Panel</div>
        </PageMiddlewareWrapper>,
      );

      // Child should NOT be rendered
      expect(screen.queryByTestId('secret-owner-content')).not.toBeInTheDocument();
      // Security warning displayed
      expect(screen.getByText(/Permission Denied/i)).toBeInTheDocument();
      expect(screen.getByText(/Only the trip creator can access the Manage Trip console/i)).toBeInTheDocument();
      expect(setScreenMock).toHaveBeenCalledWith('room');
    });
  });

  describe('UI RBAC Visibility', () => {
    it('hides Manage Trip button completely for code-joined guests', () => {
      // Set guest session in localStorage (user joined via code)
      localStorage.setItem(
        'ag_guest_session',
        JSON.stringify({
          tripId: 'trip-lisbon-202',
          memberId: 'guest-bob',
          name: 'Bob Joiner',
          initials: 'BJ',
        }),
      );

      render(<App />);
      // User is in the room as joiner
      expect(screen.getByText(/Lisbon trip/i)).toBeInTheDocument();
      expect(screen.getByText(/Bob Joiner/i)).toBeInTheDocument();

      // Manage Trip button MUST NOT exist in UI for joiners
      const manageButtons = screen.queryAllByRole('button', { name: /Manage Trip/i });
      expect(manageButtons.length).toBe(0);
    });

    it('shows Manage Trip button for trip creators', async () => {
      vi.spyOn(apiModule.api.auth, 'login').mockResolvedValueOnce({
        token: 'valid-creator-token',
        user: { id: 'alice', email: 'alice@example.com', name: 'Alice' },
      });
      const mockTrip: Trip = {
        id: DEFAULT_TRIP.id,
        title: DEFAULT_TRIP.title,
        destination: DEFAULT_TRIP.destination,
        start_date: DEFAULT_TRIP.start_date,
        end_date: DEFAULT_TRIP.end_date,
        creator_id: DEFAULT_TRIP.creator_id,
        status: DEFAULT_TRIP.status,
        member_ids: DEFAULT_TRIP.member_ids,
        created_at: new Date().toISOString(),
      };
      vi.spyOn(apiModule.api.trips, 'list').mockResolvedValueOnce([mockTrip]);

      render(<App />);
      const authBtn = screen.getByRole('button', { name: /Creator Sign In/i });
      fireEvent.click(authBtn);

      const emailInput = screen.getByLabelText(/Email Address/i);
      const passwordInput = screen.getByLabelText(/Password/i);
      fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(screen.getByRole('button', { name: /Sign In to Trips/i }));

      await screen.findByText(/My Trip Rooms/i);
      const enterRoomBtn = screen.getAllByRole('button', { name: /Open Room/i });
      fireEvent.click(enterRoomBtn[0]);

      // In the room as creator
      const manageButtons = screen.getAllByRole('button', { name: /Manage Trip/i });
      expect(manageButtons.length).toBeGreaterThan(0);
    });
  });

  describe('RequireAuth page guard component', () => {
    it('renders sign-in gate and triggers redirect callback when unauthenticated', () => {
      vi.spyOn(apiModule, 'getAuthToken').mockReturnValue(null);
      const redirectMock = vi.fn();
      render(
        <RequireAuth currentUser={null} requiredRole="creator" onRedirect={redirectMock}>
          <div data-testid="protected-content">Secret Content</div>
        </RequireAuth>,
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('require-auth-gate')).toBeInTheDocument();
      expect(screen.getByText(/Sign In Required/i)).toBeInTheDocument();
      expect(redirectMock).toHaveBeenCalled();
    });

    it('renders protected content when user is authenticated creator', () => {
      vi.spyOn(apiModule, 'getAuthToken').mockReturnValue('valid-creator-token');
      render(
        <RequireAuth
          currentUser={{ id: 'c1', name: 'Creator', role: 'creator' }}
          requiredRole="creator"
        >
          <div data-testid="protected-content">Secret Content</div>
        </RequireAuth>,
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByTestId('require-auth-gate')).not.toBeInTheDocument();
    });

    it('guards admin pages requiring administrator credentials', () => {
      vi.spyOn(apiModule, 'getAdminToken').mockReturnValue(null);
      render(
        <RequireAuth requiredRole="admin">
          <div data-testid="admin-content">Admin Portal</div>
        </RequireAuth>,
      );

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
      expect(screen.getByText(/Administrator credentials required/i)).toBeInTheDocument();
    });
  });

  describe('Sidebar text spill prevention', () => {
    it('truncates long trip titles with ellipsis and tooltip title attribute', () => {
      const longTitle = 'Tokyo Autumn Expedition Across Multiple Prefectures & Shrines';
      render(
        <Sidebar
          active="overview"
          setActive={vi.fn()}
          tripName={longTitle}
          currentUser={{ id: 'c1', name: 'Alice', role: 'creator' }}
        />,
      );

      const titleEl = screen.getByTitle(longTitle);
      expect(titleEl).toBeInTheDocument();
      expect(titleEl).toHaveStyle({
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      });
    });

    it('truncates long user names with ellipsis and tooltip in identity pill', () => {
      const longName = 'Alexander Bartholomew Montgomery III';
      render(
        <Sidebar
          active="overview"
          setActive={vi.fn()}
          tripName="Tokyo Trip"
          currentUser={{ id: 'c1', name: longName, role: 'creator' }}
        />,
      );

      const userEl = screen.getByTitle(longName);
      expect(userEl).toBeInTheDocument();
      expect(userEl).toHaveStyle({
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      });
    });
  });

  describe('Page-level middleware protection', () => {
    it('blocks direct rendering of TripsDashboardPage without authentication', () => {
      vi.spyOn(apiModule, 'getAuthToken').mockReturnValue(null);
      const onRequireLoginMock = vi.fn();
      render(
        <TripsDashboardPage
          user={{ id: '', name: '', email: '' }}
          currentUser={null}
          trips={[]}
          onSelectTrip={vi.fn()}
          onCreateTrip={vi.fn()}
          onLogout={vi.fn()}
          onRequireLogin={onRequireLoginMock}
        />,
      );

      expect(screen.getByTestId('require-auth-gate')).toBeInTheDocument();
      expect(screen.getByText(/Sign In Required/i)).toBeInTheDocument();
      expect(onRequireLoginMock).toHaveBeenCalled();
    });

    it('blocks direct rendering of OwnerTripPage without authentication', () => {
      vi.spyOn(apiModule, 'getAuthToken').mockReturnValue(null);
      const onRequireLoginMock = vi.fn();
      render(
        <OwnerTripPage
          trip={DEFAULT_TRIP}
          members={[]}
          currentUser={null}
          onUpdateTrip={vi.fn()}
          onUpdateMembers={vi.fn()}
          onDeleteTrip={vi.fn()}
          onBackToRoom={vi.fn()}
          onRequireLogin={onRequireLoginMock}
        />,
      );

      expect(screen.getByTestId('require-auth-gate')).toBeInTheDocument();
      expect(screen.getByText(/Sign In Required/i)).toBeInTheDocument();
      expect(onRequireLoginMock).toHaveBeenCalled();
    });
  });
});
