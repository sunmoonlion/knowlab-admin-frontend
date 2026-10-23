import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { IdeasView } from '@/components/knowbots/ideas-view'
import { canRelease, requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbots.pages.ideas')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// 创意（SDD 0037）：?request=<id> 打开那一个
export default async function IdeasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
  const session = await requireBrowserSession(locale)
  const t = await getTranslations('knowbots.pages.ideas')
  return (
    <div data-route-class="authenticated-workspace">
      <div className="admin-page-heading">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('intro')}</p>
      </div>
      <IdeasView
        csrfToken={session.csrf_token}
        canRelease={canRelease(session.user.roles)}
        picked={one(query.request)}
      />
    </div>
  )
}
