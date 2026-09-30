import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreateTripModal from './CreateTripModal';
import { api } from '../lib/api';

describe('CreateTripModal', () => {
  it('keeps the form open and reports a failed create request', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    vi.spyOn(api.trips, 'create').mockRejectedValueOnce(new Error('Service unavailable'));
    render(
      <CreateTripModal
        isOpen
        creatorId="creator-1"
        onCreated={onCreated}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByLabelText('Trip Title'), {
      target: { value: 'Kyoto trip' },
    });
    fireEvent.change(screen.getByLabelText('Destination City'), {
      target: { value: 'Kyoto' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Trip Room' }));

    await waitFor(() => expect(screen.getByText('Service unavailable')).toBeInTheDocument());
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
