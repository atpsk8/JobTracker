import { useCallback, useEffect, useState } from 'react'
import { getAll, put, putMany, remove } from './storage.js'

// Loads one IndexedDB store into React state and keeps the two in sync on save/remove
export function useStore(storeName) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    getAll(storeName).then(setItems).catch((err) => setError(err.message))
  }, [storeName])

  useEffect(reload, [reload])

  async function save(record) {
    await put(storeName, record)
    setItems((prev) => [...prev.filter((item) => item.id !== record.id), record])
    return record
  }

  async function saveMany(records) {
    await putMany(storeName, records)
    const ids = new Set(records.map((r) => r.id))
    setItems((prev) => [...prev.filter((item) => !ids.has(item.id)), ...records])
  }

  async function removeItem(id) {
    await remove(storeName, id)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  return { items, error, save, saveMany, remove: removeItem }
}
