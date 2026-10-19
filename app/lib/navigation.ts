import {
  BadgeCheck,
  Bot,
  ChartNoAxesCombined,
  Gauge,
  Lightbulb,
  Settings,
  TableProperties,
  type LucideIcon,
} from 'lucide-react'

export type AdminNavigationItem = {
  key: string
  path: string
  labelKey:
    | 'dashboard'
    | 'ideas'
    | 'avatars'
    | 'experts'
    | 'reference'
    | 'richReference'
    | 'settings'
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
  // 创意、分身、专家（SDD 0037，所有者「把seed infant和bot分三栏」）：后端按管理端 scope 把关，
  // 这里只决定显不显示入口
  {
    key: 'ideas',
    path: '/ideas',
    labelKey: 'ideas',
    icon: Lightbulb,
    requiredRoles: ['admin', 'operator'],
  },
  {
    key: 'avatars',
    path: '/avatars',
    labelKey: 'avatars',
    icon: Bot,
    requiredRoles: ['admin', 'operator'],
  },
  {
    key: 'experts',
    path: '/experts',
    labelKey: 'experts',
    icon: BadgeCheck,
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
