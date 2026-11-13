import chromium from '@sparticuz/chromium'
import {
  maxPdfRequestBytes,
  pdfPayloadHtml,
  renderPdfPayload,
  sanitizePdfFileName,
} from '../src/serverPdf.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  const payload = typeof request.body === 'string' ? safeJson(request.body) : request.body
  if (!payload || Buffer.byteLength(JSON.stringify(payload)) > maxPdfRequestBytes) {
    return response.status(413).json({ error: 'Data dokumen terlalu besar.' })
  }
  if (!pdfPayloadHtml(payload)) return response.status(400).json({ error: 'Data dokumen tidak lengkap.' })

  try {
    const pdf = await renderPdfPayload(payload, {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    })
    response.setHeader('Content-Type', 'application/pdf')
    response.setHeader('Content-Length', pdf.length)
    response.setHeader('Content-Disposition', `attachment; filename="${sanitizePdfFileName(payload.fileName)}"`)
    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).send(pdf)
  } catch {
    return response.status(500).json({ error: 'PDF gagal dibuat. Coba lagi.' })
  }
}

function safeJson(value) {
  try { return JSON.parse(value) } catch { return null }
}
