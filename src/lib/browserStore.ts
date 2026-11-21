export type KeyValueStore = {
  get(key: string): string | null
  set(key: string, value: string): void
}

export function browserStore(): KeyValueStore {
  return {
    get(key) {
      try {
        return globalThis.localStorage?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    set(key, value) {
      try {
        globalThis.localStorage?.setItem(key, value)
      } catch {
        // Private mode and a full disk both refuse writes. Memory still holds the copy.
      }
    },
  }
}

export function memoryStore(): KeyValueStore {
  const values = new Map<string, string>()
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value)
    },
  }
}
