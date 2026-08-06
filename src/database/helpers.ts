export function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

/** Parallel get by keys inside one transaction (resolve on all requests done). */
export function getByKeys<T extends { id: string }>(
  store: IDBObjectStore,
  ids: string[]
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const results: T[] = []
    let remaining = ids.length
    if (remaining === 0) {
      resolve(results)
      return
    }
    for (const id of ids) {
      const r = store.get(id)
      r.onsuccess = () => {
        const it = r.result as T | undefined
        if (it) results.push(it)
        if (--remaining === 0) resolve(results)
      }
      r.onerror = () => reject(r.error)
    }
  })
}
