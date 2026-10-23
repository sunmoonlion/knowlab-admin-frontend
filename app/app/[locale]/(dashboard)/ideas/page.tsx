import { redirect } from '@/i18n/navigation'

// 旧的「创意」栏（SDD 0037 第九节）：?request=<id> 跳到那个名称的详情页，别的跳到「受理」
export default async function IdeasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const { request } = await searchParams
  redirect({
    href: typeof request === 'string' ? `/names/${encodeURIComponent(request)}` : '/acceptance',
    locale,
  })
}
