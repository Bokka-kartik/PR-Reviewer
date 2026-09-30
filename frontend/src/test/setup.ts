import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdom has no ResizeObserver; the chart uses one to measure its width.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Newer Node versions define their own experimental localStorage/sessionStorage globals, which
// clash with jsdom's and can be undefined. Use a plain in-memory Storage so tests behave the same everywhere.
class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value))
  }
  [name: string]: unknown
}

function installGlobals() {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('sessionStorage', new MemoryStorage())
}

beforeEach(() => {
  installGlobals()
  window.location.hash = ''
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
