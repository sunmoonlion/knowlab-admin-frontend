import { redirect } from '@/i18n/navigation'

// 旧的「专家草稿」页拆成了创意、分身、专家三栏（SDD 0037）：旧链接转到创意
export default async function KnowbotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: '/ideas', locale })
}
