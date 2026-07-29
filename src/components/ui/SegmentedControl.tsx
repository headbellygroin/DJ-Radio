/**
 * Pill-shaped tab switcher.
 *
 * ```tsx
 * <SegmentedControl
 *   options={[
 *     { value: 'genre', label: 'Vote by genre' },
 *     { value: 'song',  label: 'Request a song' },
 *   ]}
 *   value={tab}
 *   onChange={setTab}
 * />
 * ```
 */
interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            value === opt.value
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/70'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
