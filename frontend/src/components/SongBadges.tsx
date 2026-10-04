import { providerName, type Song, type MusicProvider } from '@/types/music';
export function ProviderBadge({ provider }: { provider?: MusicProvider }) {
  return <span className={'music-badge music-provider-' + (provider || 'netease')}>{providerName(provider)}</span>;
}
export default function SongBadges({ song }: { song: Song }) {
  return <span className="music-badges"><ProviderBadge provider={song.provider} />
    {song.access === 'vip' && <span className="music-badge music-vip">VIP</span>}
    {song.access === 'paid' && <span className="music-badge music-vip">单独付费</span>}
    {song.access === 'unknown' && <span className="music-badge">权限未知</span>}
    {song.trial && <span className="music-badge music-trial">试听 · {Math.round(song.duration / 1000)}s</span>}
    {song.unavailableReason && <span className="music-badge" title={song.unavailableReason}>授权不可用</span>}
  </span>;
}
