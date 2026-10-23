import { redirect } from '@/i18n/navigation'

// 旧的「分身」栏（SDD 0037 第九节）：分身就是准专家，?draft=<id> 跳到「孵化」里那一位
export default async function AvatarsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const { draft } = await searchParams
  redirect({
    href:
      typeof draft === 'string'
        ? { pathname: '/incubation', query: { item: draft } }
        : '/incubation',
    locale,
  })
}
