'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'

export type OpenTab = {
  key: string
  path: string
  label: string
  pinned?: boolean
}

type UiState = {
  sidebarCollapsed: boolean
  mobileNavigationOpen: boolean
  settingsOpen: boolean
  themeMode: ThemeMode
  density: Density
  openTabs: OpenTab[]
  // 右边对照材料栏的宽度（SDD 0037）
  sidePanelWidth: number
  setSidebarCollapsed(value: boolean): void
  setMobileNavigationOpen(value: boolean): void
  setSettingsOpen(value: boolean): void
  setThemeMode(value: ThemeMode): void
  setDensity(value: Density): void
  setSidePanelWidth(value: number): void
  registerTab(tab: OpenTab): void
  closeTab(key: string): void
  closeOtherTabs(key: string): void
  syncTabs(allowedTabs: readonly OpenTab[], currentKey?: string): void
}

const dashboardTab: OpenTab = {
  key: 'dashboard',
  path: '/dashboard',
  label: 'Dashboard',
  pinned: true,
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavigationOpen: false,
      settingsOpen: false,
      themeMode: 'system',
      density: 'comfortable',
      openTabs: [dashboardTab],
      sidePanelWidth: 384,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setMobileNavigationOpen: (mobileNavigationOpen) => set({ mobileNavigationOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setDensity: (density) => set({ density }),
      setSidePanelWidth: (sidePanelWidth) => set({ sidePanelWidth }),
      registerTab: (tab) =>
        set((state) => ({
          openTabs: state.openTabs.some((item) => item.key === tab.key)
            ? state.openTabs.map((item) => (item.key === tab.key ? tab : item))
            : [...state.openTabs, tab],
        })),
      closeTab: (key) =>
        set((state) => ({
          openTabs: state.openTabs.filter((item) => item.pinned || item.key !== key),
        })),
      closeOtherTabs: (key) =>
        set((state) => ({
          openTabs: state.openTabs.filter((item) => item.pinned || item.key === key),
        })),
      syncTabs: (allowedTabs, currentKey) =>
        set((state) => {
          const allowedByKey = new Map(allowedTabs.map((tab) => [tab.key, tab]))
          const retained = state.openTabs.flatMap((tab) => {
            const allowed = allowedByKey.get(tab.key)
            return allowed ? [allowed] : []
          })
          const next = retained.some((tab) => tab.key === 'dashboard')
            ? retained
            : [allowedByKey.get('dashboard') ?? dashboardTab, ...retained]
          const current = currentKey ? allowedByKey.get(currentKey) : undefined

          if (current && !next.some((tab) => tab.key === current.key)) {
            next.push(current)
          }

          return { openTabs: next }
        }),
    }),
    {
      name: 'sunmoonai-admin-ui-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ sidebarCollapsed, themeMode, density, openTabs, sidePanelWidth }) => ({
        sidebarCollapsed,
        themeMode,
        density,
        openTabs,
        sidePanelWidth,
      }),
    },
  ),
)
