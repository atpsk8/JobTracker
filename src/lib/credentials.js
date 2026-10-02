// Remembered app passwords, for automatic Gmail refreshes. Only stored when the user ticks
// "Keep scanning automatically on this device".
//
// Each password is encrypted with AES-GCM using a key the browser generates as non-extractable:
// scripts can use it to decrypt, but can't read the key itself, so copying the browser's storage
// files doesn't reveal the password. The credentials store is never included in backups.
import { getOne, put, remove } from './storage.js'

const STORE = 'credentials'
const KEY_ID = 'encryption-key'

async function getKey() {
  const existing = await getOne(STORE, KEY_ID)
  if (existing) return existing.key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await put(STORE, { id: KEY_ID, key })
  return key
}

const recordId = (email) => `password:${email.toLowerCase()}`

export async function rememberPassword(email, password) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), new TextEncoder().encode(password))
  await put(STORE, { id: recordId(email), iv, ciphertext })
}

export async function recallPassword(email) {
  const record = await getOne(STORE, recordId(email))
  if (!record) return null
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, await getKey(), record.ciphertext)
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

export const forgetPassword = (email) => remove(STORE, recordId(email))
