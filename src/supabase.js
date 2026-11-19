import { createClient } from '@supabase/supabase-js'
import { withDataRequestTimeout } from './requestTimeout'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabaseConfigured = Boolean(url && key)
export const supabase = supabaseConfigured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null
export async function loadProfile(userId) {
 const { data, error } = await withDataRequestTimeout((signal) => supabase.from('profiles').select('user_id, company_id, role, full_name, companies(name)').eq('user_id', userId).single().abortSignal(signal), 'Profil pengguna')
 if (error) throw new Error('Profil pengguna belum disiapkan. Minta direktur mengatur role akun ini di Supabase.')
 return { ...data, companyName: data.companies?.name || 'KUATEST MEGA TAMA' }
}
