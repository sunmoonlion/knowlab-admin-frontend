import { expect, test } from '@playwright/test'

test('runtime health endpoint is dynamic and non-cacheable', async ({ request }) => {
  const response = await request.get('/healthz')

  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers()['x-deployment-id']).toBe('arch-v2-r2-admin-e2e')
  expect(await response.json()).toEqual({
    status: 'ok',
    surface: 'admin',
    deployment_id: 'arch-v2-r2-admin-e2e',
  })
})

test('public route is rendered and indexable', async ({ page }) => {
  const response = await page.goto('/en')

  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole('heading', {
      name: 'A secure and auditable governance console foundation',
    }),
  ).toBeVisible()
  await expect(page.locator('[data-route-class="public-content"]')).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
})

test('anonymous workspace request is redirected by the SSR authorization boundary', async ({
  page,
}) => {
  await page.goto('/en/dashboard')

  await expect(page).toHaveURL(/\/en\/login$/)
  await expect(
    page.getByRole('heading', { name: 'Enter the administration console' }),
  ).toBeVisible()
})

test('workspace route renders only after the paired backend validates its opaque session', async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: 'sunmoonai_knowlab_admin_sid',
      value: 'e2e-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  const response = await page.goto('/en/dashboard')

  expect(response?.status()).toBe(200)
  expect(response?.headers()['cache-control']).toContain('no-store')
  await expect(page.locator('[data-route-class="authenticated-workspace"]')).toBeVisible()
  await expect(page.getByText('Administrator: Paired E2E User')).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('admin shell exposes role-filtered navigation, tabs and interface preferences', async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: 'sunmoonai_knowlab_admin_sid',
      value: 'e2e-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await page.goto('/en/reference')
  await expect(page.getByRole('navigation', { name: 'Administration navigation' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'CRUD and audit reference' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Reference resources' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Open pages' })).toContainText(
    'CRUD reference',
  )

  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Interface settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page).toHaveURL(/\/zh-CN\/reference$/)
})

test('rich capability route keeps unsafe markup as text and honors reduced motion', async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: 'sunmoonai_knowlab_admin_sid',
      value: 'e2e-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/en/rich-reference')
  await expect(page.getByRole('heading', { name: 'Rich capability boundaries' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Safe Markdown boundary preview' })).toContainText(
    '<script>alert(1)</script>',
  )
  await expect(page.locator('script').filter({ hasText: 'alert(1)' })).toHaveCount(0)
  const reducedMotion = await page.locator('.admin-sidebar').evaluate((element) => ({
    matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    transitionSeconds: Number.parseFloat(getComputedStyle(element).transitionDuration) || 0,
  }))
  expect(reducedMotion.matches).toBe(true)
  expect(reducedMotion.transitionSeconds).toBeLessThanOrEqual(0.01)
})

test('server authorization denies a directly entered route that the role cannot use', async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: 'sunmoonai_knowlab_admin_sid',
      value: 'operator-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await page.goto('/en/rich-reference')
  await expect(page).toHaveURL(/\/en\/forbidden$/)
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rich capability reference' })).toHaveCount(0)
})

test('responsive shell uses one mobile navigation drawer', async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await context.addCookies([
    {
      name: 'sunmoonai_knowlab_admin_sid',
      value: 'e2e-session',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await page.goto('/en/dashboard')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const navigation = page.getByRole('navigation', { name: 'Administration navigation' })
  await expect(navigation).toBeVisible()
  await navigation.getByRole('link', { name: 'CRUD reference' }).click()
  await expect(page).toHaveURL(/\/en\/reference$/)
  await expect(page.locator('.admin-sidebar')).not.toHaveClass(/admin-sidebar-mobile-open/)
})

test('unknown route renders a not-found boundary', async ({ page }) => {
  const response = await page.goto('/en/route-that-does-not-exist')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('sitemap uses the runtime application origin', async ({ request, baseURL }) => {
  const response = await request.get('/sitemap.xml')

  expect(response.status()).toBe(200)
  expect(await response.text()).toContain(`${baseURL}/en`)
})
