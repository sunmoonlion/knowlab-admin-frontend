'use client'

import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type KeyboardEvent,
  type PointerEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/ui'

// 右边可折叠的对照材料栏（所有者 2026-10-19「页面上还是像knowbench那样加折叠边栏吧」，SDD 0037 §三.3）。
// 收起是右边一条竖栏（每个页签一格，带条数）；展开时顶上页签、右上角收起，左边缘可拖宽，宽度记在界面设置里。
// 窄屏（< 1024px）展开时浮在页面上，点外面收起；手机上不显示竖栏，右下角一个「对照材料」按钮打开。

export type PanelTab = { key: string; label: string; count?: number; content: React.ReactNode }

const MIN = 280
const MAX = 960
const DEFAULT = 384

function clamp(width: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(width)))
}

// 窄屏（< 1024px）一进来先收着，不盖住主栏；服务端渲染时当宽屏
const NARROW = '(max-width: 1023px)'
function subscribeNarrow(change: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}
function isNarrow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches
}

export function SidePanel({ tabs, label }: { tabs: PanelTab[]; label: string }) {
  const t = useTranslations('knowbots.side')
  const first = tabs[0]?.key ?? null
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false)
  // undefined：还没点过，宽屏开第一个页签、窄屏收着
  const [chosen, setTab] = useState<string | null | undefined>(undefined)
  const tab = chosen === undefined ? (narrow ? null : first) : chosen
  const [last, setLast] = useState<string | null>(first)
  const width = clamp(useUiStore((state) => state.sidePanelWidth))
  const setWidth = useUiStore((state) => state.setSidePanelWidth)
  const drag = useRef<{ x: number; width: number } | null>(null)

  const resize = (next: number) => setWidth(clamp(next))
  const open = (key: string) => {
    setTab(key)
    setLast(key)
  }
  const current = tabs.find((x) => x.key === tab) ?? null

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { x: event.clientX, width }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) resize(drag.current.width - (event.clientX - drag.current.x))
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16
    if (event.key === 'ArrowLeft') resize(width + step)
    else if (event.key === 'ArrowRight') resize(width - step)
    else if (event.key === 'Home') resize(MIN)
    else if (event.key === 'End') resize(MAX)
    else return
    event.preventDefault()
  }

  if (current === null)
    return (
      <>
        <aside
          aria-label={label}
          className="bg-card hidden w-10 shrink-0 flex-col items-center gap-1 rounded-xl border py-2 sm:flex lg:sticky lg:top-4 lg:self-start"
        >
          <button
            type="button"
            aria-expanded={false}
            aria-label={t('expand')}
            title={t('expand')}
            className="hover:bg-accent rounded p-1.5"
            onClick={() => open(last ?? first ?? '')}
          >
            <PanelRightOpen className="size-4" />
          </button>
          {tabs.map((x) => (
            <button
              key={x.key}
              type="button"
              title={x.label}
              aria-label={x.label}
              onClick={() => open(x.key)}
              className="hover:bg-accent text-muted-foreground rounded px-1 py-2 text-xs [writing-mode:vertical-rl]"
            >
              {x.label}
              {x.count !== undefined ? ` · ${x.count}` : ''}
            </button>
          ))}
        </aside>
        <button
          type="button"
          className="primary-button fixed right-4 bottom-4 z-30 shadow-lg sm:hidden"
          onClick={() => open(last ?? first ?? '')}
        >
          {t('open')}
        </button>
      </>
    )

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-30 bg-black/20 lg:hidden"
        onClick={() => setTab(null)}
      />
      <aside
        aria-label={label}
        style={{ width, maxWidth: '90vw' }}
        className="bg-card relative flex shrink-0 flex-col rounded-xl border text-sm shadow-sm max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:rounded-none max-lg:shadow-xl lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('resize')}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onDoubleClick={() => resize(DEFAULT)}
          className="hover:bg-primary/30 focus-visible:bg-primary/40 absolute inset-y-0 -left-1 w-2 cursor-col-resize rounded"
        />
        <div className="flex items-start gap-1 border-b px-2 pt-2">
          <div role="tablist" aria-label={label} className="flex flex-1 flex-wrap gap-1">
            {tabs.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                id={`kb-tab-${x.key}`}
                aria-selected={x.key === current.key}
                aria-controls={`kb-panel-${x.key}`}
                onClick={() => open(x.key)}
                className={cn(
                  '-mb-px rounded-t-md border-b-2 px-2.5 py-2 text-xs',
                  x.key === current.key
                    ? 'border-primary font-medium'
                    : 'text-muted-foreground border-transparent',
                )}
              >
                {x.label}
                {x.count !== undefined ? ` · ${x.count}` : ''}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-expanded
            aria-label={t('collapse')}
            title={t('collapse')}
            className="hover:bg-accent mt-1 rounded p-1.5"
            onClick={() => setTab(null)}
          >
            <PanelRightClose className="size-4" />
          </button>
        </div>
        <div
          role="tabpanel"
          id={`kb-panel-${current.key}`}
          aria-labelledby={`kb-tab-${current.key}`}
          className="min-h-0 flex-1 overflow-y-auto p-4"
        >
          {current.content}
        </div>
      </aside>
    </>
  )
}
