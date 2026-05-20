/**
 * Shared receipt-file utilities for the expenses forms.
 *
 * - Images are compressed + resized to ≤ 1 200 px wide at JPEG 0.78 quality.
 * - PDFs are read as-is (base64 data-URL) — no compression.
 *
 * Returns a base64 data-URL in both cases.
 */
export function processReceiptFile(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = reject
      reader.onload = (ev) => resolve(ev.target!.result as string)
      reader.readAsDataURL(file)
    })
  }

  // Image — compress with canvas
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const MAX = 1200
        const scale = img.width > MAX ? MAX / img.width : 1
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      img.src = ev.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** True when the data-URL represents a PDF. */
export function isPdfDataUrl(dataUrl: string): boolean {
  return dataUrl.startsWith('data:application/pdf')
}
