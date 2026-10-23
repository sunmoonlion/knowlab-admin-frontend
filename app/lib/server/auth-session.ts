import 'server-only'

import { randomUUID } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { serverEnv } from '@/env/server'
import { loadBrowserSession } from '@/lib/auth/browser-session'

// 能建草稿、核出处、交付、退回的角色：所有者 2026-10-23 定现在 admin、operator 都能；admin 比 operator 多哪些
// 权限以后定，定了就只留 admin。和后端 auth.OPERATOR_SCOPES 一起改。
const RELEASE_ROLES: readonly string[] = ['admin', 'operator']
export function canRelease(roles: readonly string[]): boolean {
  return roles.some((role) => RELEASE_ROLES.includes(role))
}

export async function getBrowserSession() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()])
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ')
  const incomingCorrelationId = requestHeaders.get('x-correlation-id')
  const correlationId =
    incomingCorrelationId && /^[A-Za-z0-9._:-]{8,128}$/.test(incomingCorrelationId)
      ? incomingCorrelationId
      : randomUUID()

  return loadBrowserSession({
    backendUrl: serverEnv.BACKEND_INTERNAL_URL,
    cookieHeader,
    correlationId,
    expectedApp: serverEnv.AUTH_APP,
  })
}

export async function requireBrowserSession(locale: string) {
  const session = await getBrowserSession()
  if (!session) redirect(`/${locale}/login`)
  return session
}

export async function requireAnyRole(locale: string, roles: readonly string[]) {
  const session = await requireBrowserSession(locale)
  if (!roles.some((role) => session.user.roles.includes(role))) {
    redirect(`/${locale}/forbidden`)
  }
  return session
}
