import { STORES, getAll, replaceAll } from './storage.js'
import { downloadFile } from './download.js'

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function base64ToFile(data, name, type) {
  const binary = atob(data)
  return new File([Uint8Array.from(binary, (c) => c.charCodeAt(0))], name, { type })
}

// Downloads everything (including resume files) as one JSON file
export async function exportBackup() {
  const data = {}
  for (const name of STORES) data[name] = await getAll(name)
  data.resumes = await Promise.all(
    data.resumes.map(async ({ file, ...resume }) => ({
      ...resume,
      fileType: file.type,
      fileData: await blobToBase64(file),
    })),
  )
  const backup = { app: 'job-tracker', version: 1, exportedAt: new Date().toISOString(), data }
  const date = new Date().toISOString().slice(0, 10)
  downloadFile(`job-tracker-backup-${date}.json`, JSON.stringify(backup), 'application/json')
}

// Replaces all stored data with the contents of a backup file
export async function importBackup(file) {
  let backup
  try {
    backup = JSON.parse(await file.text())
  } catch {
    throw new Error('That file is not a Job Tracker backup.')
  }
  if (backup?.app !== 'job-tracker' || !backup.data) throw new Error('That file is not a Job Tracker backup.')

  const data = {
    ...backup.data,
    resumes: (backup.data.resumes || []).map(({ fileData, fileType, ...resume }) => ({
      ...resume,
      file: base64ToFile(fileData, resume.name, fileType),
    })),
  }
  await replaceAll(data)
}
