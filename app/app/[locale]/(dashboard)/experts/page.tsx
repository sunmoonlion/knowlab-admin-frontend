import { redirect } from '@/i18n/navigation'

// 旧的「专家」栏（SDD 0037 第九节）：跳到「交付」的全部专家
export default async function ExpertsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: { pathname: '/delivery', query: { category: 'all' } }, locale })
}
