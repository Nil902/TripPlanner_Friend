import type {
  Trip,
  Constraint,
  Plan,
  PlanItem,
  Expense,
  SettleUpReport,
  ValidationResult,
  CreateTripRequest,
  UpdateTripRequest,
  SubmitConstraintRequest,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  DisruptionEvent,
  AskAgentResponse,
  MemberResponse,
  JoinTripRequest,
} from '@shared/types';

const BASE =
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : typeof window !== 'undefined' &&
        (window.location.port === '5173' || window.location.port === '5174')
      ? 'http://localhost:8000'
      : '';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('ag_auth_token');
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem('ag_auth_token', token);
    } else {
      localStorage.removeItem('ag_auth_token');
    }
  } catch {
    // Ignore storage issues in test/SSR
  }
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem('ag_admin_token');
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem('ag_admin_token', token);
    } else {
      localStorage.removeItem('ag_admin_token');
    }
  } catch {
    // Ignore storage issues in test/SSR
  }
}

export interface GuestSession {
  tripId: string;
  memberId: string;
  name: string;
  initials: string;
  token: string;
}

export function getGuestSession(): GuestSession | null {
  try {
    const raw = localStorage.getItem('ag_guest_session');
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const session = value as Partial<GuestSession>;
    if (typeof session.tripId !== 'string' || typeof session.memberId !== 'string' ||
        typeof session.name !== 'string' || typeof session.initials !== 'string' ||
        typeof session.token !== 'string' || !session.token) return null;
    return session as GuestSession;
  } catch {
    return null;
  }
}

export function setGuestSession(session: GuestSession | null) {
  try {
    if (session) {
      localStorage.setItem('ag_guest_session', JSON.stringify(session));
    } else {
      localStorage.removeItem('ag_guest_session');
    }
  } catch {
    // Ignore storage issues in test/SSR
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  retries = 2,
  responseType: 'json' | 'text' = 'json',
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const isAdminPath = path.startsWith('/api/v1/admin');
  const guest = getGuestSession();
  const tripMatch = path.match(/^\/api\/v1\/trips\/([^/?]+)(?:\/|\?|$)/);
  const guestToken = guest && tripMatch && decodeURIComponent(tripMatch[1]) === guest.tripId ? guest.token : null;
  const token = isAdminPath
    ? getAdminToken() || getAuthToken()
    : getAuthToken() || guestToken;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method,
    headers,
    signal,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  // A failed response does not prove a write was not committed by the server.
  // Retrying reads is safe; mutations need an explicit user retry.
  const maxRetries = method === 'GET' ? retries : 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, init);

      if (!res.ok) {
        if (res.status === 401 && guestToken && token === guestToken) {
          setGuestSession(null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('trip-session-expired', { detail: { tripId: guest?.tripId } }));
          }
        }
        // Don't retry 4xx client errors
        if (res.status >= 400 && res.status < 500) {
          let message = `Request failed: ${res.status} ${res.statusText}`;
          try {
            const json = (await res.json()) as {
              detail?:
                | string
                | { message?: string; code?: string }
                | Array<{ msg?: string; message?: string }>;
              message?: string;
            };
            if (typeof json.detail === 'string') {
              message = json.detail;
            } else if (Array.isArray(json.detail)) {
              message = json.detail
                .map((d) => d.msg || d.message || JSON.stringify(d))
                .join(', ');
            } else if (json.detail && typeof json.detail.message === 'string') {
              message = json.detail.message;
            } else if (typeof json.message === 'string') {
              message = json.message;
            }
          } catch {
            // response body is not JSON, keep default message
          }
          throw new ApiError(message, res.status);
        }

        throw new ApiError(
          `Request failed: ${res.status} ${res.statusText}`,
          res.status,
        );
      }

      // 204 No Content and 205 Reset Content have empty bodies.
      if (res.status === 204 || res.status === 205) {
        return {} as T;
      }

      if (responseType === 'text') return await res.text() as T;

      const contentType = res.headers?.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        return {} as T;
      }

      return res.json() as Promise<T>;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof ApiError && err.status < 500) throw err;
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>('GET', path);
  },
  post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>('POST', path, body, signal);
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PUT', path, body);
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, body);
  },
  del<T>(path: string): Promise<T> {
    return request<T>('DELETE', path);
  },

  // High-level API domain methods
  auth: {
    signup: (data: { email: string; password: string; name: string }) =>
      api.post<{ token: string; user: { id: string; email: string; name: string } }>(
        '/api/v1/auth/signup',
        data,
      ),
    login: (data: { email: string; password: string }) =>
      api.post<{ token: string; user: { id: string; email: string; name: string } }>(
        '/api/v1/auth/login',
        data,
      ),
    me: () =>
      api.get<{ id: string; email: string; name: string }>('/api/v1/auth/me'),
  },

  trips: {
    list: () => api.get<Trip[]>('/api/v1/trips'),
    get: (tripId: string) => api.get<Trip>(`/api/v1/trips/${tripId}`),
    create: (data: CreateTripRequest) => api.post<Trip>('/api/v1/trips', data),
    update: (tripId: string, data: UpdateTripRequest) =>
      api.put<Trip>(`/api/v1/trips/${tripId}`, data),
    delete: (tripId: string) => api.del<{ status: string }>(`/api/v1/trips/${tripId}`),
    join: (tripId: string, data: JoinTripRequest) =>
      api.post<MemberResponse>(
        `/api/v1/trips/${encodeURIComponent(tripId)}/join`,
        data,
      ),
    getMembers: (tripId: string) =>
      api.get<MemberResponse[]>(
        `/api/v1/trips/${tripId}/members`,
      ),
    getPermissions: (tripId: string, userId?: string) =>
      api.get<{ can_manage: boolean; is_creator: boolean; role: string }>(
        `/api/v1/trips/${tripId}/permissions${userId ? `?user_id=${userId}` : ''}`,
      ),
  },

  constraints: {
    list: (tripId: string) =>
      api.get<Constraint[]>(`/api/v1/trips/${tripId}/constraints`),
    submit: (tripId: string, data: SubmitConstraintRequest) =>
      api.post<Constraint>(`/api/v1/trips/${tripId}/constraints`, data),
  },

  plan: {
    get: (tripId: string, version?: number) =>
      api.get<Plan>(
        `/api/v1/trips/${tripId}/plan${version ? `?version=${version}` : ''}`,
      ),
    versions: (tripId: string) =>
      api.get<Array<{ version: number; created_at: string; validation_status: string; notes_count: number }>>(
        `/api/v1/trips/${tripId}/plan/versions`,
      ),
    generate: (tripId: string, signal?: AbortSignal) =>
      api.post<Plan>(`/api/v1/trips/${tripId}/plan`, {}, signal),
    validate: (tripId: string) =>
      api.post<ValidationResult>(`/api/v1/trips/${tripId}/plan/validate`, {}),
    addItem: (tripId: string, data: unknown) =>
      api.post<PlanItem>(`/api/v1/trips/${tripId}/plan/items`, data),
    updateItem: (tripId: string, itemId: string, data: unknown) =>
      api.put<PlanItem>(`/api/v1/trips/${tripId}/plan/items/${itemId}`, data),
    deleteItem: (tripId: string, itemId: string) =>
      api.del<{ status: string }>(`/api/v1/trips/${tripId}/plan/items/${itemId}`),
    rebalance: (tripId: string, event: DisruptionEvent) =>
      api.post<Plan>(`/api/v1/trips/${tripId}/rebalance`, event),
    refine: (tripId: string, data: { instruction: string; user_id?: string }) =>
      api.post<Plan>(`/api/v1/trips/${tripId}/plan/refine`, data),
    ask: (tripId: string, question: string) =>
      api.post<AskAgentResponse>(`/api/v1/trips/${tripId}/plan/ask`, {
        question,
      }),
    getExportIcsUrl: (tripId: string) =>
      `${BASE}/api/v1/trips/${tripId}/plan/export.ics`,
    exportIcs: (tripId: string) =>
      request<string>('GET', `/api/v1/trips/${tripId}/plan/export.ics`, undefined, undefined, 2, 'text'),
  },

  expenses: {
    list: (tripId: string) =>
      api.get<Expense[]>(`/api/v1/trips/${tripId}/expenses`),
    create: (tripId: string, data: CreateExpenseRequest) =>
      api.post<Expense>(`/api/v1/trips/${tripId}/expenses`, data),
    update: (tripId: string, expenseId: string, data: UpdateExpenseRequest) =>
      api.put<Expense>(`/api/v1/trips/${tripId}/expenses/${expenseId}`, data),
    settleUp: (tripId: string) =>
      api.get<SettleUpReport>(`/api/v1/trips/${tripId}/expenses/settle-up`),
    delete: (tripId: string, expenseId: string) =>
      api.del<{ status: string }>(`/api/v1/trips/${tripId}/expenses/${expenseId}`),
  },

  admin: {
    login: (data: { email: string; password: string }) =>
      api.post<{
        token: string;
        user: { id: string; email: string; name: string; is_admin: boolean };
      }>('/api/v1/admin/login', data),
    overview: () => api.get<AdminOverviewData>('/api/v1/admin/overview'),
    trips: (params?: { query?: string; status_filter?: string }) => {
      const q = new URLSearchParams();
      if (params?.query) q.set('query', params.query);
      if (params?.status_filter) q.set('status_filter', params.status_filter);
      const qs = q.toString();
      return api.get<AdminTripItem[]>(
        `/api/v1/admin/trips${qs ? `?${qs}` : ''}`,
      );
    },
    updateTripStatus: (tripId: string, status: string) =>
      api.patch<{ status: string; trip_id: string }>(
        `/api/v1/admin/trips/${tripId}/status`,
        { status },
      ),
    deleteTrip: (tripId: string) =>
      api.del<{ status: string; trip_id: string }>(
        `/api/v1/admin/trips/${tripId}`,
      ),
    users: () => api.get<AdminUserItem[]>('/api/v1/admin/users'),
    apiUsage: () => api.get<AdminApiUsageItem[]>('/api/v1/admin/api-usage'),
    systemHealth: () =>
      api.get<AdminSystemHealthNode[]>('/api/v1/admin/system-health'),
  },
};

export interface AdminOverviewData {
  metrics: Array<{ label: string; value: string; sub: string }>;
  summary: {
    total_trips: number;
    active_trips: number;
    total_users: number;
    api_spend: number;
    cache_hit_rate: string;
  };
}

export interface AdminTripItem {
  id: string;
  name: string;
  destination: string;
  creator: string;
  creator_email: string;
  members: number;
  status: string;
  created: string;
  start_date: string;
  end_date: string;
}

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  trips_count: number;
  created_at: string;
}

export interface AdminApiUsageItem {
  name: string;
  used: number;
  freeLimit: number;
  cost: number;
  category: string;
}

export interface AdminSystemHealthNode {
  name: string;
  status: 'up' | 'degraded' | 'down';
  detail: string;
  latency_ms?: number;
}

