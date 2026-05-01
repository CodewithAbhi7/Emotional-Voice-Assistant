import type { Message } from '../../store/types'

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const timestamp = message.timestamp.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[78%] space-y-1">
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'rounded-br-sm bg-violet-700 text-white'
              : 'rounded-bl-sm border border-eva-border bg-eva-surface text-slate-200'
          }`}
        >
          {message.text}
        </div>
        <p className={`text-xs text-slate-500 ${isUser ? 'text-right' : 'text-left'}`}>
          {isUser ? 'You' : 'EVA'} · {timestamp}
        </p>
      </div>
    </div>
  )
}
