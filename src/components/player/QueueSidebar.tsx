import { List, ChevronUp, ChevronDown } from 'lucide-react';
import type { Track, ImageAsset, PlaySource } from '../../lib/types';

interface QueueSidebarProps {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  images: ImageAsset[];
  bgImageIndex: number;
  showQueue: boolean;
  mode: string;
  playSource: PlaySource;

  onToggleQueue: () => void;
  onPlayTrack: (index: number) => void;
  onSelectBgImage: (index: number) => void;
}

export default function QueueSidebar({
  queue,
  currentIndex,
  isPlaying,
  images,
  bgImageIndex,
  showQueue,
  mode,
  playSource,

  onToggleQueue,
  onPlayTrack,
  onSelectBgImage,
}: QueueSidebarProps) {
  return (
    <div className="lg:w-72 lg:border-l border-white/5 flex flex-col">
      {/* Queue header */}
      <button
        className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-white/50 hover:text-white border-b border-white/5 transition-colors"
        onClick={onToggleQueue}
      >
        <List size={15} />
        <span>Queue ({queue.length})</span>
        {mode === 'server' && playSource !== 'master' && (
          <span className="ml-1 text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
            {playSource}
          </span>
        )}
        <span className="ml-auto lg:hidden">
          {showQueue ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>

      {/* Track list */}
      <div
        className={`overflow-y-auto ${showQueue ? 'block' : 'hidden lg:block'} flex-1`}
        style={{ maxHeight: '420px' }}
      >
        {queue.length === 0 ? (
          <div className="px-4 py-8 text-center text-white/15 text-sm">No tracks loaded</div>
        ) : (
          <ul>
            {queue.map((t, i) => (
              <li
                key={`${t.id}-${i}`}
                onClick={() => onPlayTrack(i)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors group ${
                  i === currentIndex
                    ? 'bg-red-600/15 border-l-2 border-red-500'
                    : 'hover:bg-white/5 border-l-2 border-transparent'
                }`}
              >
                <div className="w-5 text-center flex-shrink-0">
                  {i === currentIndex && isPlaying ? (
                    <div className="flex items-end gap-px justify-center h-3.5">
                      {[1, 2, 3].map((b) => (
                        <div
                          key={b}
                          className="w-1 bg-red-400 rounded-sm"
                          style={{
                            height: '100%',
                            animation: `bar ${0.38 + b * 0.14}s ease-in-out infinite alternate`,
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-white/20 group-hover:text-white/40">
                      {i + 1}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs truncate ${
                      i === currentIndex ? 'text-white font-medium' : 'text-white/50'
                    }`}
                  >
                    {t.name}
                  </p>
                </div>
                {t.isVideo && (
                  <span className="text-[10px] text-white/20 flex-shrink-0">MP4</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Image strip */}
      {images.length > 0 && (
        <div className="border-t border-white/5 p-3">
          <p className="text-[10px] text-white/25 mb-2">
            Background images ({images.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <img
                key={img.id}
                src={img.url}
                alt={img.name}
                onClick={() => onSelectBgImage(i)}
                className={`w-12 h-12 object-cover rounded cursor-pointer flex-shrink-0 transition-all ${
                  i === bgImageIndex % images.length
                    ? 'ring-2 ring-red-500'
                    : 'opacity-50 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
