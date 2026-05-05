export async function audioToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext({ sampleRate: 16000 })
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  // Mix down to mono
  const numChannels = decoded.numberOfChannels
  const length = decoded.length
  const samples = new Float32Array(length)
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = decoded.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      samples[i]! += channelData[i]! / numChannels
    }
  }

  // Write WAV
  const wavBuffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(wavBuffer)
  const write = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)   // chunk size
  view.setUint16(20, 1, true)    // PCM
  view.setUint16(22, 1, true)    // mono
  view.setUint32(24, 16000, true) // sample rate
  view.setUint32(28, 32000, true) // byte rate (16000 * 2)
  view.setUint16(32, 2, true)    // block align
  view.setUint16(34, 16, true)   // bits per sample
  write(36, 'data')
  view.setUint32(40, length * 2, true)
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }

  // Base64 encode
  const bytes = new Uint8Array(wavBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}
