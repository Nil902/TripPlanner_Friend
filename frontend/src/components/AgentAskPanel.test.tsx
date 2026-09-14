import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentAskPanel from './AgentAskPanel';
import { api } from '../lib/api';

describe('AgentAskPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the question input and quick prompts', () => {
    render(<AgentAskPanel tripId="trip_1" />);
    expect(
      screen.getByPlaceholderText(/Which places are the most popular to visit/),
    ).toBeTruthy();
    expect(
      screen.getByText('Which places are the most popular to visit?'),
    ).toBeTruthy();
    expect(screen.getByText('Where should we eat?')).toBeTruthy();
  });

  it('submits a question and renders the agent answer', async () => {
    const askSpy = vi
      .spyOn(api.plan, 'ask')
      .mockImplementation(async () => ({
        question: 'Where should we eat?',
        answer: '- Time Out Market Lisbon\n- Pastéis de Belém',
      }));
    render(<AgentAskPanel tripId="trip_1" />);

    const input = screen.getByPlaceholderText(/Which places are the most popular/);
    fireEvent.change(input, { target: { value: 'Where should we eat?' } });
    fireEvent.click(screen.getByText('Ask'));

    await waitFor(() => {
      expect(askSpy).toHaveBeenCalledWith('trip_1', 'Where should we eat?');
      expect(screen.getByText(/Time Out Market Lisbon/)).toBeTruthy();
    });
  });

  it('shows an error banner when the request fails', async () => {
    vi.spyOn(api.plan, 'ask').mockRejectedValue(new Error('boom'));
    render(<AgentAskPanel tripId="trip_1" />);

    fireEvent.change(screen.getByPlaceholderText(/Which places are the most popular/), {
      target: { value: 'Any free spots?' },
    });
    fireEvent.click(screen.getByText('Ask'));

    await waitFor(() => {
      expect(screen.getByText(/could not answer right now/)).toBeTruthy();
    });
  });
});