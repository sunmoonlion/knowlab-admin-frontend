import {
  Bot,
  ChartNoAxesCombined,
  Gauge,
  Settings,
  TableProperties,
  type LucideIcon,
} from 'lucide-react'

export type AdminNavigationItem = {
  key: string
  path: string
  labelKey: 'dashboard' | 'knowbots' | 'reference' | 'richReference' | 'settings'
  icon: LucideIcon
  requiredRoles?: readonly string[]
  pinned?: boolean
}

export const adminNavigation: readonly AdminNavigationItem[] = [
  {
    key: 'dashboard',
    path: '/dashboard',
    labelKey: 'dashboard',
    icon: Gauge,
    pinned: true,
  },
  {
    // 分身草稿（SDD 0027）：后端按管理端 scope 把关，这里只决定显不显示入口
    key: 'knowbots',
    path: '/knowbots',
    labelKey: 'knowbots',
    icon: Bot,
    requiredRoles: ['admin', 'operator'],
  },
  {
    key: 'reference',
    path: '/reference',
    labelKey: 'reference',
    icon: TableProperties,
    requiredRoles: ['admin', 'operator'],
  },
  {
    key: 'rich-reference',
    path: '/rich-reference',
    labelKey: 'richReference',
    icon: ChartNoAxesCombined,
    requiredRoles: ['admin'],
  },
  {
    key: 'settings',
    path: '/settings',
    labelKey: 'settings',
    icon: Settings,
  },
]

export function filterNavigationByRoles(
  roles: readonly string[],
  items: readonly AdminNavigationItem[] = adminNavigation,
) {
  const roleSet = new Set(roles)
  return items.filter(
    (item) => !item.requiredRoles || item.requiredRoles.some((role) => roleSet.has(role)),
  )
}

export function findNavigationItem(pathname: string) {
  const pathWithoutLocale = pathname.replace(/^\/(?:en|zh-CN)(?=\/|$)/, '') || '/'
  return adminNavigation.find(
    (item) =>
      pathWithoutLocale === item.path ||
      (item.path !== '/dashboard' && pathWithoutLocale.startsWith(`${item.path}/`)),
  )
}
