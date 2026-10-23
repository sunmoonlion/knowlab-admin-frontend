import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AvatarsView } from '@/components/knowbots/avatars-view'
import { canRelease, requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbots.pages.avatars')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// 分身（SDD 0037）：?draft=<id> 打开那一个；?hatch=<创意 id> 直接开始孵化
export default async function AvatarsPage({
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
  const t = await getTranslations('knowbots.pages.avatars')
  return (
    <div data-route-class="authenticated-workspace">
      <div className="admin-page-heading">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('intro')}</p>
      </div>
      <AvatarsView
        csrfToken={session.csrf_token}
        canRelease={canRelease(session.user.roles)}
        picked={one(query.draft)}
        hatchFor={one(query.hatch)}
      />
    </div>
  )
}
