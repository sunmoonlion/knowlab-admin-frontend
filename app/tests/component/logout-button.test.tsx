import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LogoutButton } from '@/components/auth/logout-button'
import { leaveTo } from '@/lib/leave-to'

const replace = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}))

vi.mock('@/lib/leave-to', () => ({ leaveTo: vi.fn() }))

describe('LogoutButton', () => {
  beforeEach(() => {
    replace.mockReset()
    refresh.mockReset()
    vi.mocked(leaveTo).mockReset()
    vi.restoreAllMocks()
  })

  it('uses POST with the session CSRF token and then returns to login', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const queryClient = new QueryClient()
    queryClient.setQueryData(['authorized'], { secret: true })
    renderWithQuery(
      <LogoutButton
        csrfToken="csrf-token-value-that-is-long-enough-1234"
        locale="en"
        label="Logout"
        errorLabel="Logout failed"
      />,
      queryClient,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/login'))
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/admin/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-CSRF-Token': 'csrf-token-value-that-is-long-enough-1234',
      },
    })
    expect(refresh).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(['authorized'])).toBeUndefined()
  })

  it('does not redirect when logout is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }))
    renderWithQuery(
      <LogoutButton
        csrfToken="csrf-token-value-that-is-long-enough-1234"
        locale="en"
        label="Logout"
        errorLabel="Logout failed"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Logout failed')
    expect(replace).not.toHaveBeenCalled()
  })

  it('goes to the identity provider to end single sign-on when it hands back a logout URL', async () => {
    const url = 'https://casdoor.example.test/api/logout?client_id=x'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ logout_url: url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const queryClient = new QueryClient()
    queryClient.setQueryData(['authorized'], { secret: true })
    renderWithQuery(
      <LogoutButton
        csrfToken="csrf-token-value-that-is-long-enough-1234"
        locale="en"
        label="Logout"
        errorLabel="Logout failed"
      />,
      queryClient,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(url))
    expect(replace).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(['authorized'])).toBeUndefined()
  })

  it('ignores a logout URL that is not https and returns to login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ logout_url: 'javascript:alert(1)' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    renderWithQuery(
      <LogoutButton
        csrfToken="csrf-token-value-that-is-long-enough-1234"
        locale="en"
        label="Logout"
        errorLabel="Logout failed"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/login'))
    expect(leaveTo).not.toHaveBeenCalled()
  })
})

function renderWithQuery(node: React.ReactNode, queryClient = new QueryClient()) {
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>)
}
