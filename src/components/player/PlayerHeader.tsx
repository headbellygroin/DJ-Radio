import { Radio, Clock, HardDrive, Settings, Mic2, LogOut } from 'lucide-react';
import type { Mode, PlaySource } from '../../lib/types';
import { formatCountdown } from '../../lib/playerUtils';

interface PlayerHeaderProps {
  mode: Mode;
  playSource: PlaySource;
  countdownMs: number;
  showDJPanel: boolean;
  onToggleDJ: () => void;
  onSignOut: () => void;
}

export default function PlayerHeader({
  mode,
  playSource,
  countdownMs,
  showDJPanel,
  onToggleDJ,
  onSignOut,
}: PlayerHeaderProps) {
  const sourceLabel = playSource === 'master' ? 'Master' : playSource;

  return (
    <header className="relative z-10 border-b border-white/5 px-6 py-4 flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
          <Radio size={15} />
        </div>
        <span className="font-semibold tracking-tight">RadioDJ</span>
      </div>

      <div className="ml-auto flex items-center gap-3 text-xs text-white/30">
        {mode === 'server' && (
          <>
            <span
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ${
                playSource === 'master'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'bg-green-500/10 text-green-400 border border-green-500/20'
              }`}
            >
              <HardDrive size={10} />
              {sourceLabel}
            </span>

            <span className="flex items-center gap-1 text-white/25">
              <Clock size={11} />
              <span>{formatCountdown(countdownMs)}</span>
            </span>

            <button
              onClick={onToggleDJ}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors ${
                showDJPanel
                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
              }`}
            >
              <Settings size={11} />
              DJ
            </button>
          </>
        )}

        <div className="flex items-center gap-1 text-white/20">
          <Mic2 size={11} />
          <span>LIVE</span>
        </div>

        <button
          onClick={onSignOut}
          title="Sign out"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-white/5 text-white/20 hover:text-white/50 hover:border-white/15 transition-colors"
        >
          <LogOut size={11} />
        </button>
      </div>
    </header>
  );
}
