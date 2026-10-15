import { browserSessionSchema, type BrowserSession } from '@/contracts/auth'

export class AdminBackendError extends Error {
  constructor(
    public readonly code: 'backend_unavailable' | 'contract_invalid',
    options?: { cause?: unknown },
  ) {
    super(code)
    this.name = 'AdminBackendError'
    if (options?.cause !== undefined) this.cause = options.cause
  }
}

type LoadBrowserSessionInput = {
  backendUrl: string
  cookieHeader: string
  correlationId: string
  expectedApp: 'tpl' | 'knowfeed' | 'knowbase' | 'research'
  fetchImpl?: typeof fetch
}

export async function loadBrowserSession({
  backendUrl,
  cookieHeader,
  correlationId,
  expectedApp,
  fetchImpl = fetch,
}: LoadBrowserSessionInput): Promise<BrowserSession | null> {
  let response: Response
  try {
    response = await fetchImpl(new URL('/api/auth/admin/me', backendUrl), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: 'application/json',
        'x-correlation-id': correlationId,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    })
  } catch (error) {
    throw new AdminBackendError('backend_unavailable', { cause: error })
  }

  if (response.status === 401) return null
  if (!response.ok || response.type === 'opaqueredirect') {
    throw new AdminBackendError('backend_unavailable')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new AdminBackendError('contract_invalid', { cause: error })
  }
  const parsed = browserSessionSchema.safeParse(payload)
  if (!parsed.success || parsed.data.user.app !== expectedApp) {
    throw new AdminBackendError('contract_invalid', {
      cause: parsed.success ? undefined : parsed.error,
    })
  }
  return parsed.data
}
