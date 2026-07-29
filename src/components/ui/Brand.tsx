import { Radio } from 'lucide-react';

interface BrandProps {
  /** Optional subtitle rendered below the main name. */
  subtitle?: string;
}

/**
 * RadioDJ logo wordmark: red circle icon + "RadioDJ" text.
 * Can optionally include a subtitle (e.g. station name).
 */
export default function Brand({ subtitle }: BrandProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
        <Radio size={14} />
      </div>
      <div>
        <p className="font-semibold text-sm leading-none">RadioDJ</p>
        {subtitle && (
          <p className="text-[10px] text-white/30 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
