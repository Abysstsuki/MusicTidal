'use client';

import dynamic from 'next/dynamic';
import { memo, useEffect, useRef, useState } from 'react';

// The library reads navigator during rendering, so it must stay client-only.
const LiquidGlass = dynamic(() => import('liquid-glass-react'), {
  ssr: false,
  loading: () => <div className="player-glass-loading" />,
});
const stationaryPointer = { x: 0, y: 0 };

export default memo(function PlayerGlass() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [cornerRadius, setCornerRadius] = useState(56);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const contrast = window.matchMedia('(forced-colors: active)');
    const updatePreferences = () => setEnabled(!transparency.matches && !contrast.matches);
    const updateRadius = () => {
      setCornerRadius(parseFloat(getComputedStyle(surface).borderTopLeftRadius) || 56);
    };
    const observer = new ResizeObserver(updateRadius);
    observer.observe(surface);
    updateRadius();
    updatePreferences();
    transparency.addEventListener('change', updatePreferences);
    contrast.addEventListener('change', updatePreferences);
    return () => {
      observer.disconnect();
      transparency.removeEventListener('change', updatePreferences);
      contrast.removeEventListener('change', updatePreferences);
    };
  }, []);

  return <div className="player-glass" ref={surfaceRef} aria-hidden="true">
    {enabled ? <LiquidGlass
      className="player-glass-lens"
      mode="standard"
      displacementScale={36}
      blurAmount={0.12}
      saturation={145}
      aberrationIntensity={1}
      elasticity={0}
      cornerRadius={cornerRadius}
      padding="0px"
      // Fixed pointer props disable the library's mouse tracking and React updates.
      globalMousePos={stationaryPointer}
      mouseOffset={stationaryPointer}
      style={{ position: 'absolute', top: '50%', left: '50%', width: '100%', height: '100%' }}
    >
      <div className="player-glass-spacer" />
    </LiquidGlass> : <div className="player-glass-loading" />}
  </div>;
});
