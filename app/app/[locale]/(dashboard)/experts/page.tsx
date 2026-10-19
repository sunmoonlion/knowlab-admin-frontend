import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ExpertsView } from '@/components/knowbots/experts-view'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbots.pages.experts')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// 专家（SDD 0037）：交付了的各版本；?draft=<id> 打开那一个
export default async function ExpertsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  const session = await requireBrowserSession(locale)
  const t = await getTranslations('knowbots.pages.experts')
  return (
    <div data-route-class="authenticated-workspace">
      <div className="admin-page-heading">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('intro')}</p>
      </div>
      <ExpertsView
        csrfToken={session.csrf_token}
        picked={typeof query.draft === 'string' ? query.draft : undefined}
      />
    </div>
  )
}
