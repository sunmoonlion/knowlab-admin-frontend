'use client'

import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import { useTodoCounts } from './shared'

// 治理控制台上的「要我们动手」（SDD 0037）：创意、分身、专家三栏各几条，点了进那一栏。
// 没有这三栏权限的账号取不到数，整块不显示。
export function KnowbotTodo() {
  const t = useTranslations('knowbots.todo')
  const nav = useTranslations('nav')
  const counts = useTodoCounts(true)
  if (!counts) return null
  const rows = [
    { key: 'ideas', path: '/ideas', n: counts.ideas },
    { key: 'avatars', path: '/avatars', n: counts.avatars },
    { key: 'experts', path: '/experts', n: counts.experts },
  ] as const
  return (
    <section className="bg-card mt-8 rounded-xl border p-5 shadow-sm" aria-label={t('title')}>
      <h2 className="font-medium">{t('title')}</h2>
      <ul className="mt-2 flex flex-wrap gap-3 text-sm">
        {rows.map((r) => (
          <li key={r.key}>
            <Link href={r.path} className="underline underline-offset-2">
              {t('line', { name: nav(r.key), n: r.n })}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
