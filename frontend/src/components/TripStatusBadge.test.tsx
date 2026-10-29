import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TripStatusBadge from './TripStatusBadge';

describe('trip progress badge', () => {
  it.each([
    ['upcoming', 'Upcoming'],
    ['in_progress', 'In progress'],
    ['completed', 'Completed'],
  ] as const)('labels %s clearly', (status, label) => {
    render(<TripStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
