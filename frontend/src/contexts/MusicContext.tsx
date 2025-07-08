'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Song } from '@/types/music';

interface MusicContextType {
  currentSong: Song | null;
  currentPosition: number; // 当前播放位置（毫秒）
  isPlaying: boolean;
  setCurrentSong: (song: Song | null) => void;
  setCurrentPosition: (position: number) => void;
  setIsPlaying: (playing: boolean) => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export const useMusicContext = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusicContext must be used within a MusicProvider');
  }
  return context;
};

interface MusicProviderProps {
  children: ReactNode;
}

export const MusicProvider: React.FC<MusicProviderProps> = ({ children }) => {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [currentPosition, setCurrentPosition] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  return (
    <MusicContext.Provider
      value={{
        currentSong,
        currentPosition,
        isPlaying,
        setCurrentSong,
        setCurrentPosition,
        setIsPlaying,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
};