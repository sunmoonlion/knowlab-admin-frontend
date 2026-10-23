'use client'

import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import { useCounts } from './shared'

// 治理控制台上的「等我们」（SDD 0037 第七节）：受理、孵化、测试、交付四栏各几条，点了进那一栏。
// 没有这几栏权限的账号取不到数，整块不显示。
export function KnowbotTodo() {
  const t = useTranslations('knowbots.todo')
  const nav = useTranslations('nav')
  const counts = useCounts(true)
  if (!counts) return null
  const rows = [
    { key: 'acceptance', n: counts.acceptance },
    { key: 'incubation', n: counts.incubation },
    { key: 'tests', n: counts.tests },
    { key: 'delivery', n: counts.delivery },
  ] as const
  return (
    <section className="bg-card mt-8 rounded-xl border p-5 shadow-sm" aria-label={t('title')}>
      <h2 className="font-medium">{t('title')}</h2>
      <ul className="mt-2 flex flex-wrap gap-3 text-sm">
        {rows.map((r) => (
          <li key={r.key}>
            <Link href={`/${r.key}`} className="underline underline-offset-2">
              {t('line', { name: nav(r.key), n: r.n })}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
