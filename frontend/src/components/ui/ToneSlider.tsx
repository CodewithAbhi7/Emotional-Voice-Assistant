interface ToneSliderProps {
  label: string
  min?: number
  max?: number
  step?: number
  value: number
  onChange: (value: number) => void
}

export function ToneSlider({
  label,
  min = 0,
  max = 1,
  step = 0.05,
  value,
  onChange,
}: ToneSliderProps) {
  return (
    <label className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-violet-500"
      />
    </label>
  )
}
