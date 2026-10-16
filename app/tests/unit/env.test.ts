import { describe, expect, it } from 'vitest'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { parseClientEnv } from '@/env/client'
import { parseServerEnv } from '@/env/server-schema'

describe('client environment', () => {
  it('accepts the same-origin API contract', () => {
    expect(
      parseClientEnv({
        NEXT_PUBLIC_APP_NAME: 'knowlab',
        NEXT_PUBLIC_API_URL: '/api',
      }),
    ).toEqual({
      NEXT_PUBLIC_APP_NAME: 'knowlab',
      NEXT_PUBLIC_API_URL: '/api',
    })
  })

  it.each(['https://api.example.com', '//api.example.com', 'api', String.raw`\api`])(
    'rejects a non same-origin API URL: %s',
    (value) => {
      expect(() =>
        parseClientEnv({
          NEXT_PUBLIC_APP_NAME: 'knowlab',
          NEXT_PUBLIC_API_URL: value,
        }),
      ).toThrow()
    },
  )
})

describe('server environment', () => {
  it('fails closed when production runtime values are missing', () => {
    expect(() =>
      parseServerEnv({
        NODE_ENV: 'production',
        AUTH_APP: 'knowlab',
      }),
    ).toThrow(/required at production runtime/)
  })

  it('allows reproducible local defaults during a production build', () => {
    expect(
      parseServerEnv(
        {
          NODE_ENV: 'production',
        },
        {
          phase: PHASE_PRODUCTION_BUILD,
        },
      ),
    ).toMatchObject({
      APP_ORIGIN: 'http://localhost:3000',
      BACKEND_INTERNAL_URL: 'http://127.0.0.1:8000',
      DEPLOYMENT_ID: 'local',
      DEPLOYMENT_ENV: 'development',
    })
  })

  it('allows loopback HTTP only for an explicit test deployment', () => {
    expect(
      parseServerEnv({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'test',
        AUTH_APP: 'knowlab',
        APP_ORIGIN: 'http://127.0.0.1:3008',
        BACKEND_INTERNAL_URL: 'http://127.0.0.1:18080',
        DEPLOYMENT_ID: 'arch-v2-r2-admin-e2e',
      }),
    ).toMatchObject({
      DEPLOYMENT_ENV: 'test',
      APP_ORIGIN: 'http://127.0.0.1:3008',
    })
  })

  it('rejects a non-loopback HTTP test origin', () => {
    expect(() =>
      parseServerEnv({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'test',
        AUTH_APP: 'knowlab',
        APP_ORIGIN: 'http://web.example.test',
        BACKEND_INTERNAL_URL: 'http://127.0.0.1:18080',
        DEPLOYMENT_ID: 'arch-v2-r2-admin-e2e',
      }),
    ).toThrow(/loopback host/)
  })

  it('accepts an explicit production runtime contract', () => {
    expect(
      parseServerEnv({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'production',
        AUTH_APP: 'knowlab',
        APP_ORIGIN: 'https://knowlab-admin.sunmoonai.com',
        BACKEND_INTERNAL_URL: 'http://knowlab-backend:8000',
        DEPLOYMENT_ID: 'release-42',
      }),
    ).toMatchObject({
      APP_ORIGIN: 'https://knowlab-admin.sunmoonai.com',
      DEPLOYMENT_ENV: 'production',
      BACKEND_INTERNAL_URL: 'http://knowlab-backend:8000',
      DEPLOYMENT_ID: 'release-42',
    })
  })

  it.each([
    ['http application origin', { APP_ORIGIN: 'http://knowlab-admin.sunmoonai.com' }],
    [
      'backend URL with credentials',
      { BACKEND_INTERNAL_URL: 'http://user:password@knowlab-backend:8000' },
    ],
    ['backend URL with a path', { BACKEND_INTERNAL_URL: 'http://knowlab-backend:8000/api' }],
  ])('rejects unsafe production server routing: %s', (_label, override) => {
    expect(() =>
      parseServerEnv({
        NODE_ENV: 'production',
        DEPLOYMENT_ENV: 'production',
        AUTH_APP: 'knowlab',
        APP_ORIGIN: 'https://knowlab-admin.sunmoonai.com',
        BACKEND_INTERNAL_URL: 'http://knowlab-backend:8000',
        DEPLOYMENT_ID: 'release-42',
        ...override,
      }),
    ).toThrow()
  })
})
