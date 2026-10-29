import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, getGuestSession, setGuestSession, setAuthToken } from './api';

describe('API Client Methods', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([400, 401, 403, 404, 422, 429])('does not retry a %s response', async (status) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: { message: 'Please check your request.' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(api.get('/api/v1/trips')).rejects.toThrow('Please check your request.');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['post', 'put', 'patch', 'del'] as const)('does not retry a failed %s mutation', async (method) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 503 }));
    await expect(api[method]('/api/v1/trips', {})).rejects.toThrow('503');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not repeat an expense after a lost response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.post('/api/v1/trips/t1/expenses', { amount: 20 })).rejects.toThrow('Failed to fetch');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries a transient read failure and returns the successful response', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 't1' }]), {
        headers: { 'Content-Type': 'application/json' },
      }));
    const pending = api.trips.list();
    await vi.runAllTimersAsync();
    expect(await pending).toEqual([{ id: 't1' }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry an aborted request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(api.get('/api/v1/trips')).rejects.toThrow('Aborted');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('generates the correct export ics URL', () => {
    const url = api.plan.getExportIcsUrl('trip-123');
    expect(url).toContain('/api/v1/trips/trip-123/plan/export.ics');
  });

  it('uses a signed guest credential only for its joined trip', async () => {
    setGuestSession({ tripId: 'trip-123', memberId: 'guest-1', name: 'Guest', initials: 'GU', token: 'signed-guest-token' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({}),
    } as Response);
    await api.plan.get('trip-123');
    expect(fetchSpy.mock.calls[0][1]?.headers).toHaveProperty('Authorization', 'Bearer signed-guest-token');
    await api.plan.get('another-trip');
    expect(fetchSpy.mock.calls[1][1]?.headers).not.toHaveProperty('Authorization');
    setAuthToken('account-token');
    await api.plan.get('trip-123');
    expect(fetchSpy.mock.calls[2][1]?.headers).toHaveProperty('Authorization', 'Bearer account-token');
  });

  it('requires an unsigned legacy guest to rejoin', () => {
    localStorage.setItem('ag_guest_session', JSON.stringify({ tripId: 'trip-123', memberId: 'alice', name: 'Alice', initials: 'AL' }));
    expect(getGuestSession()).toBeNull();
  });

  it('downloads a calendar with authentication without exposing its token in the URL', async () => {
    setAuthToken('private-account-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' } as Response);
    await expect(api.plan.exportIcs('trip-123')).resolves.toContain('BEGIN:VCALENDAR');
    expect(fetchSpy.mock.calls[0][0]).not.toContain('private-account-token');
    expect(fetchSpy.mock.calls[0][1]?.headers).toHaveProperty('Authorization', 'Bearer private-account-token');
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
