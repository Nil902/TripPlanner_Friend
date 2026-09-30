import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlansPage from './PlansPage';
import { api } from '../lib/api';

describe('PlansPage', () => {
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
});
