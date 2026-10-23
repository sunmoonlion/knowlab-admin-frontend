import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { NameView } from '@/components/knowbots/name-view'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbots.pages.name')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// 一个名称的详情页（SDD 0037 第九节）：地址独立，四栏里点「这个名称的全部记录」进来
export default async function NamePage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>
}) {
  const { locale, requestId } = await params
  await requireBrowserSession(locale)
  const t = await getTranslations('knowbots.pages.name')
  return (
    <div data-route-class="authenticated-workspace">
      <div className="admin-page-heading">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('intro')}</p>
      </div>
      <NameView requestId={requestId} />
    </div>
  )
}
