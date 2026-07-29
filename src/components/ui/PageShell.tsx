/**
 * Full-screen dark page wrapper used by every page in the app.
 * Spreads any additional className onto the root element.
 */
interface PageShellProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageShell({ children, className = '' }: PageShellProps) {
  return (
    <div
      className={`min-h-screen bg-[#080a0e] text-white ${className}`}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {children}
    </div>
  );
}
