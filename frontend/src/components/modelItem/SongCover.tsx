'use client';

import { useState } from 'react';
import Image from 'next/image';
import AlbumRounded from '@mui/icons-material/AlbumRounded';

export default function SongCover({ src, className = '' }: { src?: string; className?: string }) {
  return <CoverImage key={src || 'empty'} src={src} className={className} />;
}

function CoverImage({ src, className }: { src?: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={'song-cover song-cover-placeholder ' + className} aria-hidden="true"><AlbumRounded /></span>;
  return <Image className={'song-cover ' + className} src={src} alt="" width={48} height={48} onError={() => setFailed(true)} />;
}
