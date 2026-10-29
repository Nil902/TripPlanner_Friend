import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StopTimeline from './StopTimeline';

describe('StopTimeline', () => {
  it('lets a trip member view a stop without showing creator deletion controls', () => {
    render(<StopTimeline day={1} stops={[{ id: 'stop-1', name: 'Museum', time: '9:00 AM', cost: 10, note: null }]} />);
    expect(screen.getByText('Museum')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });
});
