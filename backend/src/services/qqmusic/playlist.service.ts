import { PlaylistCatalog } from '../netease/playlist.service';
import { qqmusicBindings } from './binding.service';
import { createQqMusicClient } from '../../utils/qqmusicHttp';
export const qqmusicPlaylistCatalog = new PlaylistCatalog(id => qqmusicBindings.credential(id), createQqMusicClient,
  (id, encrypted) => qqmusicBindings.markInvalid(id, encrypted), 'qqmusic');
qqmusicBindings.on('changed', id => qqmusicPlaylistCatalog.invalidateUser(id));
