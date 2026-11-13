const DATABASE_NAME = 'kuatest-documents-local'
const DATABASE_VERSION = 1

const requestToPromise = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

export function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Browser ini belum mendukung penyimpanan lokal IndexedDB.'))

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('documents')) database.createObjectStore('documents', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('receipts')) database.createObjectStore('receipts', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readAll(storeName) {
  const database = await openDatabase()
  const values = await requestToPromise(database.transaction(storeName, 'readonly').objectStore(storeName).getAll())
  database.close()
  return values
}

async function write(storeName, value) {
  const database = await openDatabase()
  await requestToPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).put(value))
  database.close()
  return value
}

export const getDocuments = () => readAll('documents')
export const getReceipts = () => readAll('receipts')
export const saveDocument = (document) => write('documents', document)
export const saveReceipt = (receipt) => write('receipts', receipt)

export async function deleteRecord(storeName, id) {
  const database = await openDatabase()
  await requestToPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).delete(id))
  database.close()
}

export async function getSettings() {
  const rows = await readAll('settings')
  return rows.find((row) => row.key === 'company')?.value ?? {}
}

export const saveSettings = (value) => write('settings', { key: 'company', value })

export async function exportBackup() {
  const [documents, receipts, settings] = await Promise.all([getDocuments(), getReceipts(), getSettings()])
  const backup = { format: 'kuatest-local-backup', version: 1, createdAt: new Date().toISOString(), documents, receipts, settings }
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
}

export async function importBackup(file) {
  const backup = JSON.parse(await file.text())
  if (backup?.format !== 'kuatest-local-backup' || backup?.version !== 1 || !Array.isArray(backup.documents) || !Array.isArray(backup.receipts)) {
    throw new Error('File cadangan KUATEST MEGATAMA tidak valid.')
  }

  const database = await openDatabase()
  const transaction = database.transaction(['documents', 'receipts', 'settings'], 'readwrite')
  const documents = transaction.objectStore('documents')
  const receipts = transaction.objectStore('receipts')
  const settings = transaction.objectStore('settings')
  documents.clear()
  receipts.clear()
  backup.documents.forEach((record) => documents.put(record))
  backup.receipts.forEach((record) => receipts.put(record))
  settings.put({ key: 'company', value: backup.settings ?? {} })
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
  database.close()
}
