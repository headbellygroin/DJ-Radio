import { useRef, useState } from 'react';
import { Folder, Server, ImageIcon, AlertCircle } from 'lucide-react';
import type { Mode } from '../../lib/types';

interface MediaSourcePickerProps {
  mode: Mode;
  serverStatus: 'unknown' | 'ok' | 'error';
  tracksCount: number;
  imagesCount: number;
  sourceLabel: string;
  genreFolder: string | null;
  availableGenres: string[];
  stationSlug: string | null;
  stationUrl: string;
  stationLoading: boolean;

  onLoadFromServer: () => void;
  onAddMediaFiles: (files: FileList | File[]) => void;
}

export default function MediaSourcePicker({
  mode,
  serverStatus,
  tracksCount,
  imagesCount,
  sourceLabel,
  genreFolder,
  availableGenres,
  stationSlug,
  stationUrl,
  stationLoading,

  onLoadFromServer,
  onAddMediaFiles,
}: MediaSourcePickerProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onAddMediaFiles(e.dataTransfer.files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onAddMediaFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div className="w-full max-w-sm space-y-3">
      {/* Server connect button */}
      <button
        onClick={onLoadFromServer}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
          serverStatus === 'ok'
            ? 'border-green-500/40 bg-green-500/10 text-green-300 hover:bg-green-500/15'
            : serverStatus === 'error'
              ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/15'
              : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Server size={16} />
        <div className="text-left">
          <p className="text-sm font-medium leading-none">
            {serverStatus === 'ok' ? 'Reload from local server' : 'Connect to local server'}
          </p>
          <p className="text-[11px] mt-1 opacity-60">
            {serverStatus === 'error'
              ? 'Server not running — see setup below'
              : 'node server.mjs /master/path /genre/path'}
          </p>
        </div>
      </button>

      {/* Drag-drop area */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        className={`w-full border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-red-500 bg-red-500/10'
            : 'border-white/10 hover:border-white/20 hover:bg-white/5'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <Folder size={24} className="mx-auto mb-1.5 text-white/25" />
        <p className="text-sm text-white/40">Drop files or click to browse</p>
        <p className="text-[11px] text-white/20 mt-0.5">.mp3 · .wav · .mp4 · .jpg · .png · .gif</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp3,.wav,.mp4,.jpg,.jpeg,.png,.gif"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Add background images */}
      {mode !== 'idle' && (
        <button
          onClick={() => imageInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors py-1"
        >
          <ImageIcon size={13} />
          Add background images (.jpg / .png / .gif)
        </button>
      )}
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.gif"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Track count */}
      {tracksCount > 0 && (
        <p className="text-[11px] text-white/20">
          {tracksCount} tracks &bull; {imagesCount} images &bull; {sourceLabel}
        </p>
      )}

      {/* Server setup instructions */}
      {serverStatus !== 'ok' && (
        <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl p-4 text-[11px] text-white/35 space-y-1.5">
          <p className="text-white/50 font-medium text-xs">Local server setup (one time)</p>
          <p>1. Open a terminal in this project folder</p>
          <p className="font-mono bg-black/40 px-2 py-1 rounded">node server.mjs C:\Music\All C:\Music\Genres</p>
          <p>2. Arg 1 = flat master folder &nbsp;·&nbsp; Arg 2 = genre folder (subfolders = genres)</p>
          <p>3. Click &ldquo;Connect to local server&rdquo; above</p>
          <p className="text-white/20">Album art in mp3/mp4 is extracted automatically.</p>
        </div>
      )}

      {/* Vote page URL */}
      {mode === 'server' && stationSlug && !stationLoading && (
        <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl p-4 text-[11px] text-white/35 space-y-1">
          <p className="text-white/50 font-medium text-xs">Audience vote page</p>
          <p>Share this URL with your viewers:</p>
          <p className="font-mono text-white/50 break-all">{stationUrl}</p>
        </div>
      )}

      {/* Genre folder warning */}
      {mode === 'server' && availableGenres.length === 0 && genreFolder === null && (
        <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 text-[11px] text-amber-300/70">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <p>Genre folder not detected. Start server with both paths to enable vote switching.</p>
        </div>
      )}
    </div>
  );
}
