import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { api } from './lib/api';
import type { Trip } from '@shared/types';

describe('App Component Journeys', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    window.history.pushState({}, '', '/');
    window.innerWidth = 1024;
    window.dispatchEvent(new Event('resize'));
    vi.restoreAllMocks();
  });

  it('renders the Welcome page with Start a trip text', () => {
    render(<App />);
    expect(screen.getByText(/Start a trip/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Plan the trip, not the group chat/i),
    ).toBeInTheDocument();
  });

  it('navigates to auth screen when Start a trip room is clicked without a logged-in user', () => {
    render(<App />);
    const btn = screen.getByRole('button', { name: /Start a trip room/i });
    fireEvent.click(btn);
    // Should now go to the auth page, not the room directly
    expect(screen.getByText(/Trip creators need an account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
  });

  it('switches between tabs inside the trip room (as guest joiner)', () => {
    // Pre-populate a guest session so the app opens directly in the room
    localStorage.setItem(
      'ag_guest_session',
      JSON.stringify({
        tripId: 'trip-lisbon-202',
        memberId: 'guest-tab-test',
        name: 'Tab Tester',
        initials: 'TT',
      }),
    );

    render(<App />);
    expect(screen.getByText('Lisbon trip')).toBeInTheDocument();

    // Switch to Your plans
    const plansBtn = screen.getByRole('button', { name: /Your plans/i });
    fireEvent.click(plansBtn);
    expect(screen.getByText(/Your Plans & Constraints/i)).toBeInTheDocument();

    // Switch to Itinerary
    const itineraryBtn = screen.getByRole('button', { name: /Itinerary/i });
    fireEvent.click(itineraryBtn);
    expect(screen.getByText(/Spatial Geometry/i)).toBeInTheDocument();

    // Switch to Costs
    const costsBtn = screen.getByRole('button', { name: /Costs/i });
    fireEvent.click(costsBtn);
    expect(screen.getByText(/Total Group Spend/i)).toBeInTheDocument();
  });

  it('navigates to Creator Auth screen and toggles between Sign In and Create Account', () => {
    render(<App />);
    const authBtn = screen.getByRole('button', { name: /Creator Sign In/i });
    fireEvent.click(authBtn);
    expect(
      screen.getByText(/Trip creators need an account/i),
    ).toBeInTheDocument();

    // Click Create Account tab
    const createTab = screen.getByRole('button', { name: /Create Account/i });
    fireEvent.click(createTab);
    expect(screen.getByLabelText(/Your Full Name/i)).toBeInTheDocument();

    // Click Sign In tab
    const signInTab = screen.getByRole('button', { name: /Sign In/i });
    fireEvent.click(signInTab);
    expect(screen.queryByLabelText(/Your Full Name/i)).not.toBeInTheDocument();
  });

  it('handles successful backend login and navigates to Trips Dashboard', async () => {
    vi.spyOn(api.auth, 'login').mockResolvedValueOnce({
      token: 'mock-token-xyz',
      user: {
        id: 'user-123',
        email: 'alice@example.com',
        name: 'Alice',
      },
    });

    render(<App />);
    const authBtn = screen.getByRole('button', { name: /Creator Sign In/i });
    fireEvent.click(authBtn);

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'demopass123' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In to Trips/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/My Trip Rooms/i)).toBeInTheDocument();
      expect(screen.getByText(/alice@example.com/i)).toBeInTheDocument();
    });
  });

  it('handles successful backend signup and navigates to Trips Dashboard', async () => {
    vi.spyOn(api.auth, 'signup').mockResolvedValueOnce({
      token: 'mock-token-signup',
      user: {
        id: 'user-999',
        email: 'newuser@example.com',
        name: 'New Creator',
      },
    });

    render(<App />);
    const authBtn = screen.getByRole('button', { name: /Creator Sign In/i });
    fireEvent.click(authBtn);

    const createTab = screen.getByRole('button', { name: /Create Account/i });
    fireEvent.click(createTab);

    const nameInput = screen.getByLabelText(/Your Full Name/i);
    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);

    fireEvent.change(nameInput, { target: { value: 'New Creator' } });
    fireEvent.change(emailInput, { target: { value: 'newuser@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'pass12345' } });

    const submitBtn = screen.getByRole('button', { name: /Create Creator Account/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/My Trip Rooms/i)).toBeInTheDocument();
      expect(screen.getByText(/New Creator/i)).toBeInTheDocument();
    });
  });

  it('displays error banner when authentication fails', async () => {
    vi.spyOn(api.auth, 'login').mockRejectedValueOnce(
      new Error('Invalid email or password.'),
    );

    render(<App />);
    const authBtn = screen.getByRole('button', { name: /Creator Sign In/i });
    fireEvent.click(authBtn);

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In to Trips/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
    });
  });

  it('opens Join Modal when typing a code and clicking Join', () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/Enter trip code/i);
    fireEvent.change(input, { target: { value: 'tokyo-101' } });
    const joinBtn = screen.getByRole('button', { name: /^Join$/i });
    fireEvent.click(joinBtn);

    expect(screen.getByText(/Join Trip Room/i)).toBeInTheDocument();
    expect(screen.getByText(/No account required to join/i)).toBeInTheDocument();
  });

  it('renders mobile navigation bar when screen width is mobile', () => {
    window.innerWidth = 375;
    window.dispatchEvent(new Event('resize'));

    // Use a guest session to enter the room without needing auth
    localStorage.setItem(
      'ag_guest_session',
      JSON.stringify({
        tripId: 'trip-lisbon-202',
        memberId: 'guest-mobile-test',
        name: 'Mobile Tester',
        initials: 'MT',
      }),
    );

    render(<App />);
    expect(screen.getByRole('button', { name: /Open menu/i })).toBeInTheDocument();
  });

  it('persists guest session in localStorage on join and auto-restores room on reload', async () => {
    const { unmount } = render(<App />);
    const input = screen.getByPlaceholderText(/Enter trip code/i);
    fireEvent.change(input, { target: { value: 'lisbon-202' } });
    const joinBtn = screen.getByRole('button', { name: /^Join$/i });
    fireEvent.click(joinBtn);

    // Fill name in modal
    const nameInput = screen.getByLabelText(/Your Name$/i);
    fireEvent.change(nameInput, { target: { value: 'Guest Explorer' } });
    const confirmBtn = screen.getByRole('button', { name: /Enter Trip Room/i });
    fireEvent.click(confirmBtn);

    // Room should be visible
    expect(screen.getByText(/Who's in the room/i)).toBeInTheDocument();
    expect(localStorage.getItem('ag_guest_session')).toContain('Guest Explorer');

    // Simulate closing browser
    unmount();

    // Reopen browser (render fresh App with localStorage intact)
    render(<App />);
    expect(screen.getByText(/Who's in the room/i)).toBeInTheDocument();
    // It should NOT be on welcome screen or ask for code
    expect(screen.queryByText(/Plan the trip, not the group chat/i)).not.toBeInTheDocument();
  });

  it('clears guest session when clicking Leave Trip / Switch Room', () => {
    // Pre-populate guest session
    localStorage.setItem(
      'ag_guest_session',
      JSON.stringify({
        tripId: 'trip-lisbon-202',
        memberId: 'guest_user',
        name: 'Guest User',
        initials: 'GU',
      }),
    );

    render(<App />);
    // Automatically in room
    expect(screen.getByText(/Who's in the room/i)).toBeInTheDocument();

    // Click Leave Trip
    const exitBtn = screen.getByRole('button', {
      name: /Leave Trip \/ Switch Room/i,
    });
    fireEvent.click(exitBtn);

    // Back to Welcome page
    expect(
      screen.getByText(/Plan the trip, not the group chat/i),
    ).toBeInTheDocument();
    expect(localStorage.getItem('ag_guest_session')).toBeNull();
  });

  it('navigates to OwnerTripPage from room and switches admin tabs', async () => {
    vi.spyOn(api.auth, 'login').mockResolvedValueOnce({
      token: 'mock-token-room-owner',
      user: {
        id: 'alice',
        email: 'alice@example.com',
        name: 'Alice',
      },
    });
    vi.spyOn(api.trips, 'list').mockResolvedValueOnce([
      {
        id: 'trip-lisbon-202',
        title: 'Lisbon trip',
        destination: 'Lisbon, Portugal',
        start_date: '2026-06-12',
        end_date: '2026-06-14',
        creator_id: 'alice',
        status: 'collecting_constraints',
        member_ids: ['alice', 'bob', 'cara'],
        created_at: new Date().toISOString(),
      } satisfies Trip,
    ]);

    render(<App />);
    const authBtn = screen.getByRole('button', { name: /Creator Sign In/i });
    fireEvent.click(authBtn);

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    const submitBtn = screen.getByRole('button', { name: /Sign In to Trips/i });
    fireEvent.click(submitBtn);

    // Wait for dashboard, then select the first trip to enter the room
    await waitFor(() => {
      expect(screen.getByText(/My Trip Rooms/i)).toBeInTheDocument();
    });
    const enterRoomBtn = screen.getAllByRole('button', { name: /Open Room/i });
    fireEvent.click(enterRoomBtn[0]);

    // Click Manage Trip in the Overview header
    const manageButtons = screen.getAllByRole('button', { name: /Manage Trip/i });
    expect(manageButtons.length).toBeGreaterThan(0);
    fireEvent.click(manageButtons[0]);

    // Should now be on Owner Trip Management Page
    expect(screen.getByRole('heading', { name: /Trip Settings/i })).toBeInTheDocument();
    expect(screen.getByText(/Trip Name/i)).toBeInTheDocument();

    // Switch to Members
    const membersTab = screen.getByRole('button', { name: /^Members$/i });
    fireEvent.click(membersTab);
    expect(screen.getByRole('heading', { name: /Trip Members/i })).toBeInTheDocument();

    // Switch to Agent Runs
    const runsTab = screen.getByRole('button', { name: /^Agent runs$/i });
    fireEvent.click(runsTab);
    expect(screen.getByRole('heading', { name: /Agent Runs & Version History/i })).toBeInTheDocument();

    // Switch to Danger Zone
    const dangerTab = screen.getByRole('button', { name: /^Danger zone$/i });
    fireEvent.click(dangerTab);
    expect(screen.getByRole('heading', { name: /Danger Zone/i })).toBeInTheDocument();

    // Navigate back to room
    const backBtn = screen.getByRole('button', { name: /Back to Trip Room/i });
    fireEvent.click(backBtn);

    // Verify back in room
    expect(screen.getByText(/Who's in the room/i)).toBeInTheDocument();
  });

  it('navigates to OwnerTripPage directly from Creator Dashboard', async () => {
    vi.spyOn(api.auth, 'login').mockResolvedValueOnce({
      token: 'mock-token-creator',
      user: {
        id: 'creator-1',
        email: 'creator@example.com',
        name: 'Trip Creator',
      },
    });
    vi.spyOn(api.trips, 'list').mockResolvedValueOnce([
      {
        id: 'trip-lisbon-202',
        title: 'Lisbon trip',
        destination: 'Lisbon, Portugal',
        start_date: '2026-06-12',
        end_date: '2026-06-14',
        creator_id: 'creator-1',
        status: 'collecting_constraints',
        member_ids: ['creator-1'],
        created_at: new Date().toISOString(),
      } satisfies Trip,
    ]);

    render(<App />);
    const authBtn = screen.getByRole('button', { name: /Creator Sign In/i });
    fireEvent.click(authBtn);

    const emailInput = screen.getByLabelText(/Email Address/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    fireEvent.change(emailInput, { target: { value: 'creator@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'secretpass' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In to Trips/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/My Trip Rooms/i)).toBeInTheDocument();
    });

    // Find the manage trip buttons on dashboard trip cards
    const manageTripButtons = screen.getAllByRole('button', { name: /Manage trip/i });
    expect(manageTripButtons.length).toBeGreaterThan(0);
    fireEvent.click(manageTripButtons[0]);

    // Should open OwnerTripPage
    expect(screen.getByRole('heading', { name: /Trip Settings/i })).toBeInTheDocument();
    expect(screen.getByText(/Back to Dashboard/i)).toBeInTheDocument();

    // Clicking Back to Dashboard should return to My Trip Rooms
    const backDashboardBtn = screen.getByRole('button', { name: /Back to Dashboard/i });
    fireEvent.click(backDashboardBtn);

    expect(screen.getByText(/My Trip Rooms/i)).toBeInTheDocument();
  });

  it('ensures no Admin portal button exists on normal user Welcome page, and accesses Admin Login via #admin', () => {
    const { unmount: unmountWelcome } = render(<App />);
    // Verify normal user page does NOT have Admin Portal button
    expect(screen.queryByText(/Admin Portal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Platform Administration Console/i)).not.toBeInTheDocument();
    unmountWelcome();

    // Now navigate to Admin Login using direct URL hash #admin
    window.location.hash = '#admin';
    const { unmount } = render(<App />);

    // Should display separate admin portal login interface
    expect(screen.getByText(/System Administration/i)).toBeInTheDocument();
    expect(screen.getByText(/Secured Platform Terminal/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Administrator Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Security Password/i)).toBeInTheDocument();

    // Clicking Return to Travel App should bring user back
    const returnBtn = screen.getByRole('button', { name: /Return to Travel App/i });
    fireEvent.click(returnBtn);

    expect(screen.getByText(/Plan the trip, not the group chat/i)).toBeInTheDocument();
    unmount();
  });

  it('authenticates admin user, navigates to Admin Dashboard, and browses tabs', async () => {
    vi.spyOn(api.admin, 'login').mockResolvedValueOnce({
      token: 'mock-admin-token-123',
      user: {
        id: 'admin-1',
        email: 'admin@antigravity.travel',
        name: 'Platform Administrator',
        is_admin: true,
      },
    });

    window.location.hash = '#admin';
    render(<App />);

    // Auto-fill demo credentials
    const autofillBtn = screen.getByRole('button', { name: /Auto-fill Demo Admin Credentials/i });
    fireEvent.click(autofillBtn);

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Authenticate as Administrator/i });
    fireEvent.click(submitBtn);

    // Should reach Admin Dashboard
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Platform Overview/i })).toBeInTheDocument();
      expect(screen.getByText(/Active trips/i)).toBeInTheDocument();
    });

    // Switch to Trips Management tab
    const tripsTab = screen.getByRole('button', { name: /^Trips Management$/i });
    fireEvent.click(tripsTab);
    expect(screen.getByRole('heading', { name: /Trips Moderation & Management/i })).toBeInTheDocument();

    // Switch to Creators & Users tab
    const usersTab = screen.getByRole('button', { name: /^Creators & Users$/i });
    fireEvent.click(usersTab);
    expect(screen.getByRole('heading', { name: /Creator Accounts & Members/i })).toBeInTheDocument();

    // Switch to API Usage & Cost tab
    const usageTab = screen.getByRole('button', { name: /^API Usage & Cost$/i });
    fireEvent.click(usageTab);
    expect(screen.getByRole('heading', { name: /API Quotas & External Costs/i })).toBeInTheDocument();

    // Switch to System Health & Logs tab
    const healthTab = screen.getByRole('button', { name: /^System Health & Logs$/i });
    fireEvent.click(healthTab);
    expect(screen.getByRole('heading', { name: /System Health & Infrastructure/i })).toBeInTheDocument();

    // Exit Admin Portal
    const exitBtn = screen.getByRole('button', { name: /Exit Admin Portal/i });
    fireEvent.click(exitBtn);

    // After logout, redirects to admin login
    expect(screen.getByText(/System Administration/i)).toBeInTheDocument();
  });

  it('updates URL pathname to /admindashboard upon admin login and restores /admin on exit', async () => {
    vi.spyOn(api.admin, 'login').mockResolvedValueOnce({
      token: 'mock-admin-token-xyz',
      user: {
        id: 'admin-1',
        email: 'admin@antigravity.travel',
        name: 'Platform Administrator',
        is_admin: true,
      },
    });

    window.history.pushState({}, '', '/admin');
    render(<App />);

    expect(screen.getByText(/System Administration/i)).toBeInTheDocument();

    const autofillBtn = screen.getByRole('button', { name: /Auto-fill Demo Admin Credentials/i });
    fireEvent.click(autofillBtn);

    const submitBtn = screen.getByRole('button', { name: /Authenticate as Administrator/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Platform Overview/i })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/admindashboard');
    });

    const exitBtn = screen.getByRole('button', { name: /Exit Admin Portal/i });
    fireEvent.click(exitBtn);

    expect(screen.getByText(/System Administration/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/admin');
  });

  it('hides Agent Self-Correction & Tradeoff Explanations when Plan It Yourself is chosen and displays them when Let AI Plan It is chosen', async () => {
    vi.spyOn(api.plan, 'get').mockResolvedValue({
      id: 'plan-1',
      trip_id: 'trip-lisbon-202',
      version: 1,
      validation_status: 'valid',
      days: [],
      notes: [
        'Iteration 1 rejected by validators: [budget_exceeded] Alice exceeds budget by $30. Self-correcting candidate itinerary...',
        'Iteration 2: All deterministic validations passed strictly (0 budget warnings, 0 travel warnings).',
      ],
      created_at: new Date().toISOString(),
    });

    localStorage.setItem(
      'ag_guest_session',
      JSON.stringify({
        tripId: 'trip-lisbon-202',
        memberId: 'guest-plan-mode-test',
        name: 'Mode Tester',
        initials: 'MT',
      }),
    );

    render(<App />);

    // Initially in 'ai' mode with notes loaded from api.plan.get
    await waitFor(() => {
      expect(
        screen.getByText('Agent Self-Correction & Tradeoff Explanations'),
      ).toBeInTheDocument();
    });

    // In 'ai' mode, organized cards are visible
    expect(screen.getByText('Resolved Constraint Conflict')).toBeInTheDocument();
    expect(screen.getByText('Optimal Schedule Validated')).toBeInTheDocument();

    // Now click "Plan it yourself" option
    const manualOption = screen.getByText(/Plan it yourself/i);
    fireEvent.click(manualOption);

    // Agent Self-Correction & Tradeoff Explanations MUST be removed
    expect(
      screen.queryByText('Agent Self-Correction & Tradeoff Explanations'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Resolved Constraint Conflict'),
    ).not.toBeInTheDocument();

    // Manual destination form is visible
    expect(
      screen.getByText(/Plan It Yourself — Add Destination Visit/i),
    ).toBeInTheDocument();

    // Switch back to "Let the AI plan it"
    const aiOption = screen.getByText(/Let the AI plan it/i);
    fireEvent.click(aiOption);

    // Explanations should reappear
    expect(
      screen.getByText('Agent Self-Correction & Tradeoff Explanations'),
    ).toBeInTheDocument();
  });
});
