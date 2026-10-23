import {
  ChartNoAxesCombined,
  ClipboardCheck,
  Egg,
  FlaskConical,
  Gauge,
  PackageCheck,
  Settings,
  TableProperties,
  type LucideIcon,
} from 'lucide-react'

export type AdminNavigationItem = {
  key: string
  path: string
  labelKey:
    | 'dashboard'
    | 'acceptance'
    | 'incubation'
    | 'tests'
    | 'delivery'
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
  // 受理 · 孵化 · 测试 · 交付（SDD 0037 第七节）：左边栏都是过程；全部专家在「交付」里一个
  // 大类。后端按管理端 scope 把关，这里只决定显不显示入口
  {
    key: 'acceptance',
    path: '/acceptance',
    labelKey: 'acceptance',
    icon: ClipboardCheck,
    requiredRoles: ['admin', 'operator'],
  },
  {
    key: 'incubation',
    path: '/incubation',
    labelKey: 'incubation',
    icon: Egg,
    requiredRoles: ['admin', 'operator'],
  },
  {
    key: 'tests',
    path: '/tests',
    labelKey: 'tests',
    icon: FlaskConical,
    requiredRoles: ['admin', 'operator'],
  },
  {
    key: 'delivery',
    path: '/delivery',
    labelKey: 'delivery',
    icon: PackageCheck,
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
