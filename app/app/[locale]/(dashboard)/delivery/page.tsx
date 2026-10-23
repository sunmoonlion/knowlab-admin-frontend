import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { DeliveryView } from '@/components/knowbots/delivery-view'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CATEGORIES = [
  'to_return',
  'awaiting_user',
  'to_review',
  'listed',
  'not_listed',
  'all',
] as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbots.pages.delivery')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// SDD 0037 第七节：?item=<哪一条>&category=<大类> 打开那一条（详情页的记录点进来）
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
  const category = CATEGORIES.find((c) => c === one(query.category))
  const session = await requireBrowserSession(locale)
  const t = await getTranslations('knowbots.pages.delivery')
  return (
    <div data-route-class="authenticated-workspace">
      <div className="admin-page-heading">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('intro')}</p>
      </div>
      <DeliveryView csrfToken={session.csrf_token} picked={one(query.item)} category={category} />
    </div>
  )
}
