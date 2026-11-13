import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function localPdfPlugin() {
  return {
    name: 'kuatest-local-pdf',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/api/render-pdf') return next()
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST')
          response.writeHead(405, { 'Content-Type': 'application/json' })
          return response.end(JSON.stringify({ error: 'Method not allowed.' }))
        }

        const executablePath = localChromePath()
        if (!executablePath) {
          response.writeHead(503, { 'Content-Type': 'application/json' })
          return response.end(JSON.stringify({ error: 'Google Chrome tidak ditemukan. Atur PUPPETEER_EXECUTABLE_PATH.' }))
        }

        try {
          const chunks = []
          let size = 0
          for await (const chunk of request) {
            size += chunk.length
            if (size > 3_500_000) {
              response.writeHead(413, { 'Content-Type': 'application/json' })
              return response.end(JSON.stringify({ error: 'Data dokumen terlalu besar.' }))
            }
            chunks.push(chunk)
          }

          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const { maxPdfRequestBytes, pdfPayloadHtml, renderPdfPayload, sanitizePdfFileName } = await import('./src/serverPdf.js')
          if (size > maxPdfRequestBytes || !pdfPayloadHtml(payload)) {
            response.writeHead(size > maxPdfRequestBytes ? 413 : 400, { 'Content-Type': 'application/json' })
            return response.end(JSON.stringify({ error: size > maxPdfRequestBytes ? 'Data dokumen terlalu besar.' : 'Data dokumen tidak lengkap.' }))
          }

          const pdf = await renderPdfPayload(payload, {
            executablePath,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
            headless: true,
          })
          response.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': pdf.length,
            'Content-Disposition': `attachment; filename="${sanitizePdfFileName(payload.fileName)}"`,
            'Cache-Control': 'no-store',
          })
          return response.end(pdf)
        } catch (error) {
          response.writeHead(500, { 'Content-Type': 'application/json' })
          return response.end(JSON.stringify({ error: error instanceof SyntaxError ? 'Data dokumen tidak valid.' : 'PDF gagal dibuat.' }))
        }
      })
    },
  }
}

function localChromePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }

  try {
    const legacyPuppeteer = require('puppeteer')
    const legacyBrowser = legacyPuppeteer.executablePath()
    if (existsSync(legacyBrowser)) return legacyBrowser
  } catch {}

  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path))
}

export default defineConfig({
  plugins: [react(), localPdfPlugin()],
})
