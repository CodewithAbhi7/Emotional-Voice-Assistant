interface EscalationBuilderProps {
  primaryPhrase: string
  escalation1: string
  escalation2: string
  escalation3: string
  autoGenerate: boolean
  onPrimaryChange: (value: string) => void
  onEscalation1Change: (value: string) => void
  onEscalation2Change: (value: string) => void
  onEscalation3Change: (value: string) => void
  onAutoGenerateChange: (value: boolean) => void
}

export function EscalationBuilder({
  primaryPhrase,
  escalation1,
  escalation2,
  escalation3,
  autoGenerate,
  onPrimaryChange,
  onEscalation1Change,
  onEscalation2Change,
  onEscalation3Change,
  onAutoGenerateChange,
}: EscalationBuilderProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-eva-border bg-black/20 p-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Phase 0 - Gentle
          </span>
          <textarea
            value={primaryPhrase}
            onChange={(event) => onPrimaryChange(event.target.value)}
            placeholder="e.g. Please wake up, beta..."
            className="h-20 w-full resize-none rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
          />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-eva-border bg-black/20 p-4">
        <input
          type="checkbox"
          checked={autoGenerate}
          onChange={(event) => onAutoGenerateChange(event.target.checked)}
          className="mt-1 h-4 w-4 accent-violet-600"
        />
        <span className="text-sm text-slate-400">
          Auto-generate escalation phases if you leave them blank.
        </span>
      </label>

      {[
        {
          label: 'Phase 1 - Concerned',
          value: escalation1,
          onChange: onEscalation1Change,
          placeholder: 'Optional custom phrase for phase 1',
        },
        {
          label: 'Phase 2 - Firm',
          value: escalation2,
          onChange: onEscalation2Change,
          placeholder: 'Optional custom phrase for phase 2',
        },
        {
          label: 'Phase 3 - Angry',
          value: escalation3,
          onChange: onEscalation3Change,
          placeholder: 'Optional custom phrase for phase 3',
        },
      ].map((item) => (
        <div key={item.label} className="rounded-2xl border border-eva-border bg-black/20 p-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {item.label}
            </span>
            <textarea
              value={item.value}
              onChange={(event) => item.onChange(event.target.value)}
              placeholder={item.placeholder}
              className="h-20 w-full resize-none rounded-2xl border border-eva-border bg-eva-bg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
            />
          </label>
        </div>
      ))}
    </div>
  )
}
