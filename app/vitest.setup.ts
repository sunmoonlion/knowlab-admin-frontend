import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Node 25 自带的 localStorage 没给 --localstorage-file 时不能写，盖住了 jsdom 的那个（Node 24 没这事）。
// 界面设置（zustand persist）要写它：不能写时换成内存里的一份，只在测试里。
if (typeof globalThis.localStorage?.setItem !== 'function') {
  const items = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true })
}

afterEach(() => cleanup())
