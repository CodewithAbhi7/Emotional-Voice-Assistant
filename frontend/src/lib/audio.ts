export function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm = new Int16Array(float32.length)
  for (let index = 0; index < float32.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32[index]))
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return pcm
}

export function mergeFloatChunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Float32Array(totalLength)
  let offset = 0
  chunks.forEach((chunk) => {
    result.set(chunk, offset)
    offset += chunk.length
  })
  return result
}

export function encodeWavFromFloatChunks(
  chunks: Float32Array[],
  sampleRate: number,
): Blob {
  const samples = mergeFloatChunks(chunks)
  const pcm = float32ToPcm16(samples)
  const buffer = new ArrayBuffer(44 + pcm.byteLength)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, pcm.byteLength, true)

  let offset = 44
  pcm.forEach((sample) => {
    view.setInt16(offset, sample, true)
    offset += 2
  })

  return new Blob([buffer], { type: 'audio/wav' })
}

export async function playAudioBase64(audioB64: string): Promise<void> {
  const binary = atob(audioB64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  const blob = new Blob([bytes], { type: 'audio/wav' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)

  try {
    await audio.play()
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('Audio playback failed'))
    })
  } finally {
    audio.pause()
    audio.src = ''
    URL.revokeObjectURL(url)
  }
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}
