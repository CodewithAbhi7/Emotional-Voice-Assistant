import { useCallback, useRef, useState } from 'react'

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setIsPlaying(false)
  }, [])

  const playUrl = useCallback(
    async (url: string, ownedObjectUrl = false) => {
      stop()
      if (ownedObjectUrl) {
        objectUrlRef.current = url
      }
      const audio = new Audio(url)
      audioRef.current = audio
      setIsPlaying(true)
      await audio.play()
      audio.onended = () => {
        setIsPlaying(false)
      }
    },
    [stop],
  )

  const playBlob = useCallback(
    async (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      await playUrl(url, true)
    },
    [playUrl],
  )

  return {
    isPlaying,
    playUrl,
    playBlob,
    stop,
  }
}
