import { supabase } from './supabase'
let workspace = null
export const setWorkspace = (profile) => { workspace = profile }
const requireWorkspace = () => { if (!workspace?.company_id) throw new Error('Sesi pengguna belum siap.'); return workspace }
const fail = (error) => { if (error) throw new Error(error.message || 'Supabase gagal memproses permintaan.') }
async function list(table) {
 const { company_id } = requireWorkspace()
 const { data, error } = await supabase.from(table).select('payload').eq('company_id', company_id)
 fail(error); return (data || []).map((row) => row.payload)
}
export const getDocuments = () => list('documents')
export const getReceipts = () => list('receipts')
export async function saveDocument(document) {
 const p = requireWorkspace()
 const { error } = await supabase.from('documents').upsert({ id: document.id, company_id: p.company_id, document_type: document.type, document_number: document.number, payload: document, updated_by: p.user_id })
 fail(error); return document
}
export async function saveReceipt(receipt) {
 const p = requireWorkspace()
 const { error } = await supabase.from('receipts').upsert({ id: receipt.id, company_id: p.company_id, document_number: receipt.number, invoice_id: receipt.invoiceId || null, payload: receipt, updated_by: p.user_id })
 fail(error); return receipt
}
export async function deleteRecord(table, id) {
 const p = requireWorkspace()
 const { error } = await supabase.from(table).delete().eq('id', id).eq('company_id', p.company_id)
 fail(error)
}
export async function getSettings() {
 const p = requireWorkspace()
 const { data, error } = await supabase.from('company_settings').select('payload').eq('company_id', p.company_id).maybeSingle()
 fail(error); return data?.payload || {}
}
export async function saveSettings(value) {
 const p = requireWorkspace()
 const { error } = await supabase.from('company_settings').upsert({ company_id: p.company_id, payload: value, updated_by: p.user_id })
 fail(error); return value
}
export async function exportBackup() {
 const [documents, receipts, settings] = await Promise.all([getDocuments(), getReceipts(), getSettings()])
 return new Blob([JSON.stringify({ format: 'kuatest-local-backup', version: 1, createdAt: new Date().toISOString(), documents, receipts, settings }, null, 2)], { type: 'application/json' })
}
export async function importBackup(file) {
 const p = requireWorkspace()
 if (p.role !== 'director') throw new Error('Hanya direktur yang dapat mengimpor cadangan.')
 const b = JSON.parse(await file.text())
 if (b?.format !== 'kuatest-local-backup' || b?.version !== 1 || !Array.isArray(b.documents) || !Array.isArray(b.receipts)) throw new Error('File cadangan KUATEST MEGA TAMA tidak valid.')
 const docs = b.documents.map((r) => ({ id:r.id, company_id:p.company_id, document_type:r.type, document_number:r.number, payload:r, updated_by:p.user_id }))
 const receipts = b.receipts.map((r) => ({ id:r.id, company_id:p.company_id, document_number:r.number, invoice_id:r.invoiceId || null, payload:r, updated_by:p.user_id }))
 const c = await supabase.from('receipts').delete().eq('company_id', p.company_id); fail(c.error)
 const a = await supabase.from('documents').delete().eq('company_id', p.company_id); fail(a.error)
 if (docs.length) { const { error } = await supabase.from('documents').upsert(docs); fail(error) }
 if (receipts.length) { const { error } = await supabase.from('receipts').upsert(receipts); fail(error) }
 await saveSettings(b.settings || {})
}
