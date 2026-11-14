import { createClient } from '@supabase/supabase-js'
import chromium from '@sparticuz/chromium'
import {
  maxPdfRequestBytes,
  pdfPayloadHtml,
  renderPdfPayload,
  sanitizePdfFileName,
} from '../src/serverPdf.js'

export const config = {
  api: {
    bodyParser: { sizeLimit: '4mb' },
  },
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  const authorization = request.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!token || !url || !key) return response.status(401).json({ error: 'Sesi tidak valid. Silakan masuk kembali.' })
  const client = createClient(url, key, { auth: { persistSession: false } })
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData.user) return response.status(401).json({ error: 'Sesi tidak valid. Silakan masuk kembali.' })

  const payload = typeof request.body === 'string' ? safeJson(request.body) : request.body
  if (!payload || Buffer.byteLength(JSON.stringify(payload)) > maxPdfRequestBytes) {
    return response.status(413).json({ error: 'Data dokumen terlalu besar.' })
  }
  if (!pdfPayloadHtml(payload)) return response.status(400).json({ error: 'Data dokumen tidak lengkap.' })

  try {
    const renderedPdf = await renderPdfPayload(payload, {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    })
    // Puppeteer returns a Uint8Array. Normalize it to Buffer so Vercel sends
    // the PDF bytes as-is instead of serializing the typed array as JSON.
    const pdf = Buffer.from(renderedPdf)
    if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('PDF renderer returned invalid data.')
    }
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Length', pdf.byteLength)
    response.setHeader('Content-Disposition', `attachment; filename="${sanitizePdfFileName(payload.fileName)}"`)
    response.setHeader('Cache-Control', 'no-store')
    response.statusCode = 200
    return response.end(pdf)
  } catch {
    return response.status(500).json({ error: 'PDF gagal dibuat. Coba lagi.' })
  }
}

function safeJson(value) {
  try { return JSON.parse(value) } catch { return null }
}
