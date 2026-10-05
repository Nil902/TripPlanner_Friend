import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import InteractiveMap from './InteractiveMap';

describe('InteractiveMap', () => {
  it('omits stops without coordinates instead of inventing a location or transit time', () => {
    render(
      <InteractiveMap
        dayIndex={1}
        stops={[
          { name: 'Known venue', time: '10:00 AM', cost: 0, note: null, lat: 38.71, lng: -9.14 },
          { name: 'Custom venue', time: '11:00 AM', cost: 0, note: null, lat: 0, lng: 0 },
        ]}
      />,
    );
    expect(screen.getByText('1 stop omitted: location unknown')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /showing 1 located stop: Known venue/i })).toBeInTheDocument();
    expect(screen.queryByText(/Est\. transit/i)).not.toBeInTheDocument();
  });
});
