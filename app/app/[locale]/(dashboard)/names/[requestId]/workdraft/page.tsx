import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { OperatorWorkdraft } from '@/components/knowbots/operator-workdraft'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('operatorWorkdraft')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// 平台孵化的工作稿（专家孵化方案第十二节）：孵化栏「打开工作稿」进来；作者没授权的与没有的一样
export default async function OperatorWorkdraftPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>
}) {
  const { locale, requestId } = await params
  const session = await requireBrowserSession(locale)
  const t = await getTranslations('operatorWorkdraft')
  return (
    <div data-route-class="authenticated-workspace">
      <div className="admin-page-heading">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </div>
      <OperatorWorkdraft requestId={requestId} csrfToken={session.csrf_token} />
    </div>
  )
}
