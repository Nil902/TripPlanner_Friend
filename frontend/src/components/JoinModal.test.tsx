import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JoinModal from './JoinModal';

describe('JoinModal', () => {
  it('accepts a shared invitation URL and submits its trip code', async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <JoinModal
        isOpen
        initialCode="https://travel.example/?code=trip-lisbon-202"
        onJoin={onJoin}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Join Trip Room' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Your Name')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Your Name'), {
      target: { value: 'Cara Visitor' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enter Trip Room/ }));

    await waitFor(() => expect(onJoin).toHaveBeenCalledWith({
      name: 'Cara Visitor', initials: 'CV', tripId: 'trip-lisbon-202',
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps raw codes and rejects invitation URLs without a code', async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<JoinModal isOpen onJoin={onJoin} onClose={onClose} />);

    const codeInput = screen.getByLabelText('Trip Code or Invitation Link');
    expect(codeInput).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Your Name'), {
      target: { value: 'Alex' },
    });
    fireEvent.change(codeInput, {
      target: { value: 'https://travel.example/' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enter Trip Room/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('valid invitation link');
    expect(onJoin).not.toHaveBeenCalled();

    fireEvent.change(codeInput, { target: { value: ' trip-tokyo-101 ' } });
    fireEvent.click(screen.getByRole('button', { name: /Enter Trip Room/ }));
    await waitFor(() => expect(onJoin).toHaveBeenCalledWith({
      name: 'Alex', initials: 'A', tripId: 'trip-tokyo-101',
    }));
  });

  it('closes when Escape is pressed inside the dialog', () => {
    const onClose = vi.fn();
    render(<JoinModal isOpen onJoin={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
