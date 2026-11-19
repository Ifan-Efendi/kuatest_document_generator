export const DATA_REQUEST_TIMEOUT_MS = 20000

export async function withDataRequestTimeout(request, label, timeoutMs = DATA_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await request(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} tidak merespons dalam 20 detik. Periksa koneksi, lalu coba lagi.`)
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
