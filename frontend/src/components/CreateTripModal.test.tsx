import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateTripModal from './CreateTripModal';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { trips: { create: vi.fn() } } }));

describe('trip creation persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the form open and does not invent a trip after a failed save', async () => {
    vi.mocked(api.trips.create).mockRejectedValue(new Error('Trip could not be saved'));
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<CreateTripModal isOpen creatorId="alice" onClose={onClose} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Kyoto Culinary Exploration'), { target: { value: 'Kyoto trip' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Kyoto, Japan'), { target: { value: 'Kyoto' } });
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2027-01-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Trip Room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Trip could not be saved');
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
