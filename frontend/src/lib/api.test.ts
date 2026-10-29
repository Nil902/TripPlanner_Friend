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

  it('does not retry a rejected read', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: { message: 'Trip access denied' } }),
    } as Response);

    await expect(api.get('/api/v1/trips/private')).rejects.toThrow('Trip access denied');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not replay expense creation after a server failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as Response);

    await expect(api.post('/api/v1/trips/trip-123/expenses', { amount: 25 }))
      .rejects.toThrow('503');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not replay a write after a lost connection', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(api.post('/api/v1/trips/trip-123/plan', {}))
      .rejects.toThrow('Failed to fetch');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries a temporary read failure once before returning the result', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Unavailable' } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 'trip-123' }),
      } as Response);

    await expect(api.get('/api/v1/trips/trip-123')).resolves.toEqual({ id: 'trip-123' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
