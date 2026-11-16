import puppeteer from 'puppeteer-core'
import { documentPdf, receiptPdf } from './pdfTemplates.js'

export const maxPdfRequestBytes = 3_500_000

export function pdfPayloadHtml(payload) {
  const company = payload?.company
  if (!company) return null

  if (payload.kind === 'receipt') {
    return payload.receipt && payload.invoice
      ? receiptPdf(payload.receipt, payload.invoice, company, payload.fileName)
      : null
  }

  return ['quotation', 'invoice'].includes(payload.document?.type)
    ? documentPdf(payload.document, company, payload.fileName)
    : null
}

export async function renderPdfPayload(payload, launchOptions) {
  const html = pdfPayloadHtml(payload)
  if (!html) throw new Error('Data dokumen tidak lengkap.')

  const browser = await puppeteer.launch({
    ...launchOptions,
    args: await puppeteer.defaultArgs({ args: launchOptions.args || [], headless: launchOptions.headless || 'shell' }),
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
  })

  try {
    const page = await browser.newPage()
    page.setDefaultNavigationTimeout(15_000)
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', (outgoing) => {
      const url = outgoing.url()
      if (url.startsWith('data:') || url === 'about:blank') outgoing.continue()
      else outgoing.abort()
    })

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), { timeout: 5_000 }).catch(() => {})
    return await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      printBackground: true,
    })
  } finally {
    await browser.close().catch(() => {})
  }
}

export function sanitizePdfFileName(value) {
  return String(value || 'dokumen.pdf').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 140)
}
