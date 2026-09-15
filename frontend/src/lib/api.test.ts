import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api';

describe('API Client Methods', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates the correct export ics URL', () => {
    const url = api.plan.getExportIcsUrl('trip-123');
    expect(url).toContain('/api/v1/trips/trip-123/plan/export.ics');
  });

  it('returns empty object for 204 No Content without calling .json()', async () => {
    const jsonSpy = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: { get: () => null },
      json: jsonSpy,
    } as unknown as Response);

    const result = await api.del('/api/v1/trips/trip-123');
    expect(result).toEqual({});
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('returns empty object for 205 Reset Content without calling .json()', async () => {
    const jsonSpy = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 205,
      headers: { get: () => null },
      json: jsonSpy,
    } as unknown as Response);

    const result = await api.del('/api/v1/trips/trip-123');
    expect(result).toEqual({});
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('returns empty object when content-type is not JSON', async () => {
    const jsonSpy = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain' },
      json: jsonSpy,
    } as unknown as Response);

    const result = await api.get('/api/v1/trips/trip-123/plan/export.ics');
    expect(result).toEqual({});
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('calls refine endpoint with proper payload', async () => {
    const mockPlan = {
      id: 'plan-1',
      trip_id: 'trip-123',
      version: 2,
      validation_status: 'valid',
      days: [],
      notes: ['Refined day 2'],
      created_at: new Date().toISOString(),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => mockPlan,
    } as unknown as Response);

    const result = await api.plan.refine('trip-123', {
      instruction: 'Make day 2 more relaxed',
      user_id: 'alice',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/trips/trip-123/plan/refine'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          instruction: 'Make day 2 more relaxed',
          user_id: 'alice',
        }),
      }),
    );
    expect(result.version).toBe(2);
    expect(result.notes).toContain('Refined day 2');
  });
});
