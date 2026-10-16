import { describe, expect, it, vi } from 'vitest'
import { AdminBackendError, loadBrowserSession } from '@/lib/auth/browser-session'

const validSession = {
  contract_version: 1,
  authenticated: true,
  user: {
    actor_id: 'b42cf3bb-d63e-5df5-a884-9c34286f2608',
    app: 'knowlab',
    surface: 'admin',
    display_name: 'Template User',
    email: 'user@example.test',
    roles: ['member'],
    scopes: ['profile:read'],
    expires_at: '2027-07-22T06:00:00.000Z',
  },
  csrf_token: 'csrf-token-value-that-is-long-enough-1234',
} as const

describe('loadBrowserSession', () => {
  it('accepts the RFC 3339 UTC offset emitted by the FastAPI backend', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ...validSession,
        user: {
          ...validSession.user,
          expires_at: '2027-07-22T06:00:00+00:00',
        },
      }),
    )

    await expect(
      loadBrowserSession({
        backendUrl: 'http://admin-backend.internal:8000',
        cookieHeader: 'sunmoonai_knowlab_admin_sid=opaque',
        correlationId: 'correlation-1234',
        expectedApp: 'knowlab',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toMatchObject({
      user: { expires_at: '2027-07-22T06:00:00+00:00' },
    })
  })

  it('forwards only the cookie and correlation context and accepts the exact safe DTO', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(validSession, { status: 200 }))

    await expect(
      loadBrowserSession({
        backendUrl: 'http://knowlab-backend:8000',
        cookieHeader: 'sunmoonai_knowlab_admin_sid=opaque-session',
        correlationId: 'correlation-1234',
        expectedApp: 'knowlab',
        fetchImpl,
      }),
    ).resolves.toEqual(validSession)

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('http://knowlab-backend:8000/api/auth/admin/me'),
      expect.objectContaining({
        cache: 'no-store',
        redirect: 'manual',
        headers: {
          Accept: 'application/json',
          Cookie: 'sunmoonai_knowlab_admin_sid=opaque-session',
          'x-correlation-id': 'correlation-1234',
        },
      }),
    )
  })

  it('maps only a 401 to an anonymous session', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }))
    await expect(
      loadBrowserSession({
        backendUrl: 'http://knowlab-backend:8000',
        cookieHeader: '',
        correlationId: 'correlation-1234',
        expectedApp: 'knowlab',
        fetchImpl,
      }),
    ).resolves.toBeNull()
  })

  it.each([
    ['wrong app', { ...validSession, user: { ...validSession.user, app: 'research' } }],
    ['extra token', { ...validSession, access_token: 'must-not-cross-the-boundary' }],
    ['wrong surface', { ...validSession, user: { ...validSession.user, surface: 'web' } }],
  ])('fails closed for %s', async (_label, payload) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload))
    await expect(
      loadBrowserSession({
        backendUrl: 'http://knowlab-backend:8000',
        cookieHeader: '',
        correlationId: 'correlation-1234',
        expectedApp: 'knowlab',
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'contract_invalid' } satisfies Partial<AdminBackendError>)
  })

  it('does not treat upstream failures as an anonymous user', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))
    await expect(
      loadBrowserSession({
        backendUrl: 'http://knowlab-backend:8000',
        cookieHeader: '',
        correlationId: 'correlation-1234',
        expectedApp: 'knowlab',
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'backend_unavailable' } satisfies Partial<AdminBackendError>)
  })
})
