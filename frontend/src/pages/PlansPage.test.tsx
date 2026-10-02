import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Constraint } from '@shared/types';
import PlansPage from './PlansPage';
import { api } from '../lib/api';

describe('PlansPage', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reports when saved preferences cannot be loaded', async () => {
    const list = vi.spyOn(api.constraints, 'list')
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce([]);
    render(<PlansPage tripId="trip-1" currentMemberId="member-1" members={[]} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load saved preferences',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('shows group constraints as a collapsible bulleted list', async () => {
    const constraints: Constraint[] = [{
      id: 'constraint-1',
      trip_id: 'trip-1',
      user_id: 'member-1',
      budget_per_day: 85,
      dietary: ['Vegetarian'],
      style_tags: ['Relaxed'],
      must_see: ['Museum'],
      must_avoid: ['Stairs'],
    }];
    vi.spyOn(api.constraints, 'list').mockResolvedValue(constraints);
    render(<PlansPage tripId="trip-1" currentMemberId="member-1" members={[{
      id: 'member-1', name: 'Alex', initials: 'A', role: 'creator', submitted: true,
    }]} />);

    const summary = screen.getByText('Group Constraints Overview').closest('summary');
    expect(summary).not.toBeNull();
    const dropdown = summary!.parentElement as HTMLDetailsElement;
    expect(dropdown.open).toBe(false);
    await waitFor(() => expect(within(dropdown).getByText('1 member')).toBeInTheDocument());

    fireEvent.click(summary!);
    expect(dropdown.open).toBe(true);
    expect(within(dropdown).getAllByRole('list')).toHaveLength(2);
    expect(within(dropdown).getByText('Alex')).toBeInTheDocument();
    expect(within(dropdown).getByText('Budget: $85 per day')).toBeInTheDocument();
    expect(within(dropdown).getByText('Dietary: Vegetarian')).toBeInTheDocument();
    expect(within(dropdown).getByText('Travel style: Relaxed')).toBeInTheDocument();
    expect(within(dropdown).getByText('Must-see: Museum')).toBeInTheDocument();
    expect(within(dropdown).getByText('Avoid: Stairs')).toBeInTheDocument();

    fireEvent.click(summary!);
    expect(dropdown.open).toBe(false);
  });

  it('explains the empty group overview when expanded', async () => {
    vi.spyOn(api.constraints, 'list').mockResolvedValue([]);
    render(<PlansPage tripId="trip-1" currentMemberId="member-1" members={[]} />);

    const summary = screen.getByText('Group Constraints Overview').closest('summary');
    fireEvent.click(summary!);
    expect(await screen.findByText(/No constraints submitted yet/)).toBeInTheDocument();
    expect(screen.getByText('0 members')).toBeInTheDocument();
  });

  it('renders untrusted constraint text without creating HTML elements', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    vi.spyOn(api.constraints, 'list').mockResolvedValue([{
      id: 'constraint-1',
      trip_id: 'trip-1',
      user_id: 'member-1',
      budget_per_day: 50,
      dietary: [],
      style_tags: [],
      must_see: [payload],
      must_avoid: [],
    }]);
    const { container } = render(
      <PlansPage tripId="trip-1" currentMemberId="member-1" members={[]} />,
    );

    fireEvent.click(screen.getByText('Group Constraints Overview'));
    expect(await screen.findByText(`Must-see: ${payload}`)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
