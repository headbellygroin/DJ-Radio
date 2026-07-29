/**
 * Small rotating ring spinner.
 * Accepts optional className for sizing / overrides.
 */
interface SpinnerProps {
  className?: string;
}

export default function Spinner({ className = '' }: SpinnerProps) {
  return (
    <div
      className={`w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin ${className}`}
    />
  );
}
