import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddStopForm from './AddStopForm';

describe('AddStopForm', () => {
  it('keeps a failed stop visible and does not invent coordinates', async () => {
    const onAddStop = vi.fn().mockRejectedValueOnce(new Error('Save failed'));
    const onClose = vi.fn();
    render(
      <AddStopForm
        isOpen
        onClose={onClose}
        onAddStop={onAddStop}
        suggestedStops={[]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Venue \/ Place name/i), {
      target: { value: 'A custom cafe' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Stop' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Save failed'));
    expect(onAddStop).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'A custom cafe' }),
    );
    expect(onAddStop.mock.calls[0][0]).not.toHaveProperty('lat');
    expect(onClose).not.toHaveBeenCalled();
  });
});
