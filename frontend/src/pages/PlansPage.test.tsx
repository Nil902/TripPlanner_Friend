import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlansPage from './PlansPage';
import { api } from '../lib/api';

beforeEach(() => vi.restoreAllMocks());

describe('PlansPage', () => {
  it('does not announce success after a failed save or allow editing another member', async () => {
    vi.spyOn(api.constraints, 'list').mockResolvedValue([]);
    vi.spyOn(api.constraints, 'submit').mockRejectedValue(new Error('Preferences not saved'));
    render(<PlansPage tripId="trip-1" currentMemberId="alice" members={[
      { id: 'alice', name: 'Alice', initials: 'AL', submitted: false },
      { id: 'bob', name: 'Bob', initials: 'BO', submitted: false },
    ]} />);
    expect(screen.getByRole('button', { name: 'Bob' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Your Constraints' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Preferences not saved'));
    expect(screen.queryByText('Saved Successfully')).not.toBeInTheDocument();
  });
});
