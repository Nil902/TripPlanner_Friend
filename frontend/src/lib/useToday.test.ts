import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToday } from './useToday';

describe('live UTC date', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T23:59:59.000Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('advances on UTC midnight without reloading', () => {
    const { result } = renderHook(useToday);
    expect(result.current).toBe('2026-10-12');
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe('2026-10-13');
  });

  it('refreshes after returning to a suspended tab', () => {
    const { result } = renderHook(useToday);
    vi.setSystemTime(new Date('2026-10-14T08:00:00Z'));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe('2026-10-14');
    vi.setSystemTime(new Date('2026-10-15T08:00:00Z'));
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe('2026-10-15');
  });

  it('cleans up its midnight timer on unmount', () => {
    const { unmount } = renderHook(useToday);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
