import { Clock, CheckCircle, RotateCcw } from 'lucide-react';
import type { VoteStatus, PlaySource } from '../../lib/types';

interface PlayerNotificationsProps {
  voteStatus: VoteStatus;
  pendingGenre: string | null;
  playSource: PlaySource;
}

export default function PlayerNotifications({
  voteStatus,
  pendingGenre,
  playSource,
}: PlayerNotificationsProps) {
  return (
    <>
      {/* Vote switch notifications */}
      {(voteStatus === 'switched' || voteStatus === 'fallback') && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#111318] border border-white/10 shadow-2xl text-sm animate-fade-in">
          {voteStatus === 'switched' ? (
            <CheckCircle size={15} className="text-green-400 flex-shrink-0" />
          ) : (
            <RotateCcw size={15} className="text-amber-400 flex-shrink-0" />
          )}
          <span className="text-white/80">
            {voteStatus === 'switched'
              ? `Switched to: ${playSource}`
              : 'No votes — playing master'}
          </span>
        </div>
      )}

      {/* Pending genre notification */}
      {pendingGenre !== null &&
        voteStatus !== 'switched' &&
        voteStatus !== 'fallback' && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#111318] border border-amber-500/20 shadow-2xl text-sm">
            <Clock size={15} className="text-amber-400 flex-shrink-0" />
            <span className="text-white/60">
              Switching to{' '}
              <span className="text-white font-medium">
                {pendingGenre ?? 'Master'}
              </span>{' '}
              after this song
            </span>
          </div>
        )}
    </>
  );
}
