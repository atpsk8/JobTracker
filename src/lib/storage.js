// Keeps all app data in the browser's IndexedDB.
// Each browser has its own private copy, and nothing is sent to a server.
const DB_NAME = 'job-tracker'
const DB_VERSION = 5

// Included in backups:
// - jobDetails: the user's edits to found jobs (stage, notes, resume, prep, offer...) plus jobs added by hand
// - stories: the STAR answer bank used for interview prep
// - accounts: scanned inboxes and when each was last scanned
export const STORES = ['resumes', 'interviews', 'jobEmails', 'jobDetails', 'stories', 'accounts']

// Never exported or restored: remembered app passwords (encrypted, see credentials.js)
const PRIVATE_STORES = ['credentials']

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      for (const name of [...STORES, ...PRIVATE_STORES]) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run(storeNames, mode, action) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode)
    const request = action(tx)
    tx.oncomplete = () => {
      db.close()
      resolve(request?.result)
    }
    tx.onerror = () => reject(tx.error)
  })
}

export const getAll = (store) => run(store, 'readonly', (tx) => tx.objectStore(store).getAll())
export const getOne = (store, id) => run(store, 'readonly', (tx) => tx.objectStore(store).get(id))
export const put = (store, record) => run(store, 'readwrite', (tx) => tx.objectStore(store).put(record))
export const putMany = (store, records) =>
  run(store, 'readwrite', (tx) => records.forEach((record) => tx.objectStore(store).put(record)))
export const remove = (store, id) => run(store, 'readwrite', (tx) => tx.objectStore(store).delete(id))

// Wipes every backed-up store and fills it from `data` (used when restoring a backup)
export function replaceAll(data) {
  return run(STORES, 'readwrite', (tx) => {
    for (const name of STORES) {
      const store = tx.objectStore(name)
      store.clear()
      for (const record of data[name] || []) store.put(record)
    }
  })
}

// Found job emails, with their text (so they can be read in the app) and extracted details.
// Only emails that matched as job emails are kept; everything else from a scan is discarded.
export async function getJobEmails() {
  return (await getAll('jobEmails')).map((e) => ({ ...e, date: new Date(e.date) }))
}

// Enough for any real job email; stops one huge quoted thread from bloating storage and backups
const MAX_STORED_BODY = 20_000

const toRecord = (account, e) => ({
  id: e.id,
  account,
  company: e.company,
  stage: e.stage,
  subject: e.subject,
  from: e.from,
  date: e.date.getTime(),
  link: e.link,
  details: e.details,
  body: (e.body || '').slice(0, MAX_STORED_BODY),
})

// mode "replace": a full scan replaces everything stored for the account.
// mode "merge": a refresh only adds or updates the emails it found.
export async function saveJobEmails(account, emails, mode = 'replace') {
  const oldIds = mode === 'replace'
    ? (await getAll('jobEmails')).filter((e) => e.account === account).map((e) => e.id)
    : []
  await run('jobEmails', 'readwrite', (tx) => {
    const store = tx.objectStore('jobEmails')
    for (const id of oldIds) store.delete(id)
    for (const e of emails) store.put(toRecord(account, e))
  })
}

export async function deleteJobEmails(account) {
  const ids = (await getAll('jobEmails')).filter((e) => e.account === account).map((e) => e.id)
  await run('jobEmails', 'readwrite', (tx) => ids.forEach((id) => tx.objectStore('jobEmails').delete(id)))
}
