import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CreateTripModal from './CreateTripModal';
import { api } from '../lib/api';

afterEach(() => vi.restoreAllMocks());

describe('CreateTripModal', () => {
  it('keeps the form open and reports a failed save without inventing a trip', async () => {
    vi.spyOn(api.trips, 'create').mockRejectedValue(new Error('Service unavailable'));
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<CreateTripModal isOpen creatorId="creator-1" onCreated={onCreated} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/Trip Title/i), { target: { value: 'Autumn trip' } });
    fireEvent.change(screen.getByLabelText(/Destination/i), { target: { value: 'Lisbon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Trip Room' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable'));
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create Trip Room' })).toBeEnabled();
  });
});
