import Spinner from './Spinner';

interface LoadingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading: boolean;
}

/**
 * Button that shows a spinner while `loading` is true.
 * Applies the common RadioDJ red-button styling unless `className` is
 * provided (which replaces the default styling entirely).
 */
export default function LoadingButton({
  loading,
  children,
  disabled,
  className,
  ...rest
}: LoadingButtonProps) {
  const base =
    'w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2';

  return (
    <button
      className={className ?? base}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : (
        children
      )}
    </button>
  );
}
