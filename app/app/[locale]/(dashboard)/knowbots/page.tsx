import { redirect } from '@/i18n/navigation'

// 更早的「专家草稿」页（SDD 0037 第九节）：跳到「受理」
export default async function KnowbotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: '/acceptance', locale })
}
