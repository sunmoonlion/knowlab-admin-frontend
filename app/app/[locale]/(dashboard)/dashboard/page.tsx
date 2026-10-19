import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LogoutButton } from '@/components/auth/logout-button'
import { KnowbotTodo } from '@/components/knowbots/todo'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')

  return {
    title: t('workspaceTitle'),
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const session = await requireBrowserSession(locale)
  const t = await getTranslations('auth')
  const tNav = await getTranslations('nav')

  return (
    <div data-route-class="authenticated-workspace">
      <div className="admin-page-heading">
        <h1 className="text-2xl font-semibold tracking-tight">{tNav('dashboard')}</h1>
        <p className="text-muted-foreground mt-2">{t('dashboardWelcome')}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('signedInAs', {
            name: session.user.display_name ?? session.user.email ?? session.user.actor_id,
          })}
        </p>
      </div>
      <KnowbotTodo />
      <section className="bg-card mt-8 rounded-xl border p-5 shadow-sm">
        <h2 className="font-medium">{tNav('governance')}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{tNav('governanceDescription')}</p>
      </section>
      <div className="mt-6">
        <LogoutButton
          csrfToken={session.csrf_token}
          locale={locale}
          label={t('logout')}
          errorLabel={t('logoutFailed')}
        />
      </div>
    </div>
  )
}
