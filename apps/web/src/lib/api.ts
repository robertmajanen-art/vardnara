const BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('accessToken')
}

export function saveTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
}

export function clearTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return false
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json() as { accessToken: string }
    localStorage.setItem('accessToken', data.accessToken)
    return true
  } catch {
    return false
  }
}

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  if (res.status === 401 && !isRetry && path !== '/api/auth/login' && path !== '/api/auth/refresh') {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, init, true)
    clearTokens()
    window.location.href = '/login'
    throw new Error('Session utgången')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.message ?? res.statusText), { status: res.status, body: err })
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export type Appointment = {
  id: string
  groupId: string
  type: string
  title: string
  location?: string | null
  notes?: string | null
  startTime: string
  endTime?: string | null
  recurrence?: string | null
  recurrenceCron?: string | null
  assigneeId?: string | null
  assignee?: { id: string; email: string } | null
  assigneeAccepted?: boolean | null
  createdAt: string
}

export type Task = {
  id: string
  groupId: string
  title: string
  description?: string | null
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'OVERDUE'
  dueDate?: string | null
  assigneeId?: string | null
  assignee?: { id: string; email: string } | null
  recurrence: string
  recurrenceCron?: string | null
  completedAt?: string | null
  completionNote?: string | null
  createdAt: string
}

export type FeedItem = {
  id: string
  groupId: string
  actorId?: string | null
  itemType: string
  bodyText?: string | null
  appointmentId?: string | null
  taskId?: string | null
  createdAt: string
  readBy: Array<{ readAt: string }>
  _count: { comments: number }
}
