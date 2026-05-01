import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

import { useAppStore } from '../../store/useAppStore'
import { MessageBubble } from './MessageBubble'

export function ConversationFeed() {
  const messages = useAppStore((state) => state.messages)
  const liveTranscription = useAppStore((state) => state.liveTranscription)
  const liveResponse = useAppStore((state) => state.liveResponse)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveResponse, liveTranscription])

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
      {messages.length === 0 && !liveTranscription && !liveResponse ? (
        <div className="flex h-full flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-slate-500">Conversation will appear here.</p>
          <p className="mt-1 text-xs text-slate-600">Tap the orb and start speaking.</p>
        </div>
      ) : null}

      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {liveTranscription ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-end"
        >
          <div className="max-w-[78%] rounded-2xl rounded-br-sm border border-violet-700/50 bg-violet-900/30 px-4 py-3 text-sm italic text-slate-300">
            {liveTranscription}
          </div>
        </motion.div>
      ) : null}

      {liveResponse ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-start"
        >
          <div className="max-w-[78%] rounded-2xl rounded-bl-sm border border-eva-border bg-eva-surface px-4 py-3 text-sm text-slate-200">
            {liveResponse}
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-pink-400" />
          </div>
        </motion.div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  )
}
