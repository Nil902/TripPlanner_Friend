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
}

export function getGuestSession(): GuestSession | null {
  try {
    const raw = localStorage.getItem('ag_guest_session');
    if (!raw) return null;
    return JSON.parse(raw) as GuestSession;
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
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const isAdminPath = path.startsWith('/api/v1/admin');
  const token = isAdminPath
    ? getAdminToken() || getAuthToken()
    : getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method,
    headers,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, init);

  if (!res.ok) {
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
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>('GET', path);
  },
  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, body);
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
    join: (tripId: string, data: { name: string; user_id?: string }) =>
      api.post<{ id: string; name: string; initials: string; submitted: boolean; role: 'creator' | 'joiner' }>(
        `/api/v1/trips/${tripId}/join`,
        data,
      ),
    getMembers: (tripId: string) =>
      api.get<Array<{ id: string; name: string; initials: string; submitted: boolean; role: 'creator' | 'joiner' }>>(
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
    generate: (tripId: string) =>
      api.post<Plan>(`/api/v1/trips/${tripId}/plan`, {}),
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
    getExportIcsUrl: (tripId: string) =>
      `${BASE}/api/v1/trips/${tripId}/plan/export.ics`,
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

