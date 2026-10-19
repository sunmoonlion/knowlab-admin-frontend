'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

// 页面顶上的选择框（SDD 0037「选择框」）：代替左边整列的列表，中间留给详情。
// 点开按组列出（要我们动手的在前），能打字搜；选了详情铺在中间，选的是哪个记进地址。

export type PickerItem = {
  id: string
  title: string
  sub?: string // 第二行：用户、版本之类，也参与搜
  badge?: React.ReactNode
  note?: string // 要留意的一句（有问题待回答之类），标黄
}

export type PickerGroup = { key: string; label: string; items: PickerItem[] }

export function Picker({
  label,
  groups,
  value,
  onPick,
}: {
  label: string
  groups: PickerGroup[]
  value: string | null
  onPick: (id: string) => void
}) {
  const t = useTranslations('knowbots')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const listId = useId()

  const all = groups.flatMap((g) => g.items)
  const current = all.find((i) => i.id === value) ?? null
  const wanted = query.trim().toLowerCase()
  const shown = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => `${i.title} ${i.sub ?? ''}`.toLowerCase().includes(wanted)),
    }))
    .filter((g) => g.items.length > 0)
  const flat = shown.flatMap((g) => g.items)

  // 点到框外就收起
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const toggle = () => {
    if (open) return setOpen(false)
    setQuery('')
    setActive(
      Math.max(
        0,
        all.findIndex((i) => i.id === value),
      ),
    )
    setOpen(true)
  }
  const pick = (id: string) => {
    setOpen(false)
    button.current?.focus()
    onPick(id)
  }
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((a) => (flat.length === 0 ? 0 : (a + step + flat.length) % flat.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = flat[active]
      if (item) pick(item.id)
    } else if (event.key === 'Escape') {
      setOpen(false)
      button.current?.focus()
    }
  }

  return (
    <div ref={box} className="relative w-full max-w-xl">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className="bg-card hover:bg-accent flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm shadow-sm"
      >
        <span className="min-w-0 flex-1 truncate font-medium">
          {current?.title ?? t('picker.none')}
        </span>
        {current?.badge}
        <span aria-hidden className="text-muted-foreground">
          ▾
        </span>
      </button>
      {open ? (
        <div className="bg-card absolute z-20 mt-1 w-full rounded-lg border shadow-lg">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
            placeholder={t('picker.search')}
            aria-label={t('picker.search')}
            aria-controls={listId}
            aria-activedescendant={flat[active] ? `${listId}-${flat[active].id}` : undefined}
            className="w-full rounded-t-lg border-b bg-transparent px-3 py-2 text-sm outline-none"
          />
          {flat.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">{t('noMatch')}</p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              className="max-h-[60vh] overflow-y-auto py-1"
            >
              {shown.map((g) => (
                <li key={g.key} role="presentation">
                  <p className="text-muted-foreground px-3 pt-2 pb-1 text-xs">
                    {g.label} · {g.items.length}
                  </p>
                  <ul role="group" aria-label={g.label}>
                    {g.items.map((item) => {
                      const at = flat.indexOf(item)
                      return (
                        <li
                          key={item.id}
                          id={`${listId}-${item.id}`}
                          role="option"
                          aria-selected={item.id === value}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setActive(at)}
                          onClick={() => pick(item.id)}
                          className={cn(
                            'cursor-pointer px-3 py-2 text-sm',
                            at === active && 'bg-accent',
                            item.id === value && 'font-medium',
                          )}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate">{item.title}</span>
                            {item.badge}
                          </span>
                          {item.sub ? (
                            <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                              {item.sub}
                            </span>
                          ) : null}
                          {item.note ? (
                            <span className="mt-0.5 block text-xs font-medium text-amber-700 dark:text-amber-400">
                              {item.note}
                            </span>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** 选的是哪个记进地址（不重新加载页面）：刷新、把链接发给别人都还是这一个。null 的去掉。 */
export function rememberPick(params: Record<string, string | null>) {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(params)) {
    if (value === null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  window.history.replaceState(null, '', url)
}
