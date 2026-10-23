'use client'

import { Menu, PanelLeftClose, PanelLeftOpen, Settings, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo } from 'react'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import {
  filterNavigationByRoles,
  findNavigationItem,
  type AdminNavigationItem,
} from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/ui'
import { useCounts } from '@/components/knowbots/shared'
import { InterfaceSettings } from './interface-settings'

type AppShellProps = {
  children: React.ReactNode
  locale: string
  roles: readonly string[]
  userLabel: string
}

export function AppShell({ children, locale, roles, userLabel }: AppShellProps) {
  const t = useTranslations('nav')
  const common = useTranslations('common')
  const pathname = usePathname()
  const router = useRouter()
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const setCollapsed = useUiStore((state) => state.setSidebarCollapsed)
  const mobileOpen = useUiStore((state) => state.mobileNavigationOpen)
  const setMobileOpen = useUiStore((state) => state.setMobileNavigationOpen)
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen)
  const openTabs = useUiStore((state) => state.openTabs)
  const closeTab = useUiStore((state) => state.closeTab)
  const closeOtherTabs = useUiStore((state) => state.closeOtherTabs)
  const syncTabs = useUiStore((state) => state.syncTabs)
  const allowedNavigation = useMemo(() => filterNavigationByRoles(roles), [roles])
  // 受理、孵化、测试、交付四栏旁「等我们」的条数（SDD 0037 第七节）
  const todo = useCounts(allowedNavigation.some((item) => item.key === 'acceptance'))
  const current = findNavigationItem(pathname)
  const allowedTabs = useMemo(
    () =>
      allowedNavigation.map((item) => ({
        key: item.key,
        path: item.path,
        label: t(item.labelKey),
        pinned: item.pinned,
      })),
    [allowedNavigation, t],
  )

  useEffect(() => {
    syncTabs(allowedTabs, current?.key)
  }, [allowedTabs, current?.key, syncTabs])

  function closeCurrentTab(key: string, active: boolean) {
    closeTab(key)
    if (active) router.push('/dashboard')
  }

  return (
    <div className={cn('admin-shell', collapsed && 'admin-shell-collapsed')}>
      {mobileOpen ? (
        <button
          type="button"
          className="admin-mobile-backdrop"
          aria-label={common('close')}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside className={cn('admin-sidebar', mobileOpen && 'admin-sidebar-mobile-open')}>
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden>
            S
          </span>
          {!collapsed ? <strong>SunmoonAI Admin</strong> : null}
        </div>
        <nav aria-label={t('mainNavigation')} className="admin-navigation">
          {allowedNavigation.map((item) => (
            <NavigationLink
              key={item.key}
              item={item}
              label={t(item.labelKey)}
              active={item.key === current?.key}
              collapsed={collapsed}
              badge={todo?.[item.key as keyof typeof todo]}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </nav>
      </aside>
      <div className="admin-main-column">
        <header className="admin-header">
          <div className="admin-header-leading">
            <button
              type="button"
              className="icon-button admin-mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label={t('openMenu')}
            >
              <Menu aria-hidden />
            </button>
            <button
              type="button"
              className="icon-button admin-desktop-collapse"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? t('expandMenu') : t('collapseMenu')}
            >
              {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            </button>
            <nav aria-label={t('breadcrumb')} className="admin-breadcrumb">
              <Link href="/dashboard">{t('home')}</Link>
              {current && current.key !== 'dashboard' ? (
                <>
                  <span aria-hidden>/</span>
                  <span aria-current="page">{t(current.labelKey)}</span>
                </>
              ) : null}
            </nav>
          </div>
          <div className="admin-header-actions">
            <span className="admin-user-label">{userLabel}</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSettingsOpen(true)}
              aria-label={t('settings')}
            >
              <Settings aria-hidden />
            </button>
          </div>
        </header>
        <div className="admin-tabs" role="navigation" aria-label={t('openTabs')}>
          {openTabs.map((tab) => {
            const active = tab.key === current?.key
            return (
              <div key={tab.key} className={cn('admin-tab', active && 'admin-tab-active')}>
                <Link href={tab.path} aria-current={active ? 'page' : undefined}>
                  {tab.label}
                </Link>
                {!tab.pinned ? (
                  <button
                    type="button"
                    onClick={() => closeCurrentTab(tab.key, active)}
                    aria-label={t('closeTab', { name: tab.label })}
                    onDoubleClick={() => closeOtherTabs(tab.key)}
                  >
                    <X aria-hidden />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        <main className="admin-content" data-locale={locale}>
          {children}
        </main>
      </div>
      <InterfaceSettings />
    </div>
  )
}

function NavigationLink({
  item,
  label,
  active,
  collapsed,
  badge,
  onNavigate,
}: {
  item: AdminNavigationItem
  label: string
  active: boolean
  collapsed: boolean
  badge?: number
  onNavigate(): void
}) {
  const Icon = item.icon
  const shown = badge ? (badge > 99 ? '99+' : String(badge)) : null
  return (
    <Link
      href={item.path}
      className={cn('admin-navigation-link relative', active && 'admin-navigation-link-active')}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? (shown ? `${label} · ${shown}` : label) : undefined}
      onClick={onNavigate}
    >
      <Icon aria-hidden />
      {!collapsed ? <span>{label}</span> : null}
      {shown ? (
        <span
          className={cn(
            'rounded-full bg-amber-500 text-[10px] leading-4 font-medium text-white',
            collapsed
              ? 'absolute top-1 right-1 size-2 overflow-hidden text-transparent'
              : 'ml-auto px-1.5',
          )}
        >
          {shown}
        </span>
      ) : null}
    </Link>
  )
}
