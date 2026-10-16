import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { KnowbotDrafts } from '@/components/knowbots/knowbot-drafts'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbots')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function KnowbotDraftsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await requireBrowserSession(locale)
  const t = await getTranslations('knowbots')
  return (
    <div data-route-class="authenticated-workspace">
      <div className="admin-page-heading">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('intro')}</p>
      </div>
      <KnowbotDrafts csrfToken={session.csrf_token} />
    </div>
  )
}
