'use client';

import { Fragment, memo, useEffect, useId, useRef, useState, type CSSProperties } from 'react';

type GlassSurface = { map: string; width: number; height: number; strength: number };
const MAP_PADDING = 96;
const CHANNELS = [
  { name: 'red', offset: 10, matrix: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0' },
  { name: 'green', offset: 0, matrix: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0' },
  { name: 'blue', offset: -10, matrix: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0' },
];

// Mineradio-style RGB backdrop refraction, with an independently drawn lens map.
// A neutral interior keeps the background aligned while the rounded edges bend it.
function drawLensMap(width: number, height: number, radius: number) {
  const paddedWidth = width + MAP_PADDING * 2;
  const paddedHeight = height + MAP_PADDING * 2;
  const density = Math.min(1, 1024 / paddedWidth, 256 / paddedHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(paddedWidth * density);
  canvas.height = Math.ceil(paddedHeight * density);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Glass map rendering unavailable');
  const image = context.createImageData(canvas.width, canvas.height);
  const edgeWidth = Math.min(28, height * 0.22);

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const localX = (x + 0.5) * paddedWidth / canvas.width - MAP_PADDING - width / 2;
      const localY = (y + 0.5) * paddedHeight / canvas.height - MAP_PADDING - height / 2;
      const qx = Math.abs(localX) - (width / 2 - radius);
      const qy = Math.abs(localY) - (height / 2 - radius);
      const outsideX = Math.max(qx, 0), outsideY = Math.max(qy, 0);
      const cornerDistance = Math.hypot(outsideX, outsideY);
      const depth = radius - cornerDistance - Math.min(Math.max(qx, qy), 0);
      let horizontal = 0, vertical = 0;
      if (depth >= 0 && depth < edgeWidth) {
        const bend = 0.43 * (1 - depth / edgeWidth) ** 2;
        if (cornerDistance > 0) {
          horizontal = Math.sign(localX) * outsideX / cornerDistance * bend;
          vertical = Math.sign(localY) * outsideY / cornerDistance * bend;
        } else if (qx > qy) {
          horizontal = Math.sign(localX) * bend;
        } else {
          vertical = Math.sign(localY) * bend;
        }
      }
      const index = (y * canvas.width + x) * 4;
      image.data[index] = Math.round((0.5 + horizontal) * 255);
      image.data[index + 1] = 128;
      image.data[index + 2] = Math.round((0.5 + vertical) * 255);
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

export default memo(function PlayerGlass() {
  const instanceId = useId();
  const filterId = 'player-glass-' + instanceId.replace(/[^a-zA-Z0-9_-]/g, '');
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [surface, setSurface] = useState<GlassSurface | null>(null);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const contrast = window.matchMedia('(forced-colors: active)');
    // Other browser engines keep the CSS blur fallback instead of partial refraction.
    const supported = /(?:Chrome|Chromium|Edg)\//.test(navigator.userAgent)
      && CSS.supports('backdrop-filter', `url("#${filterId}")`);
    let disposed = false, frame = 0, generation = 0, previousSize = '';
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed) return;
        const enabled = !transparency.matches && !contrast.matches;
        setAllowed(enabled);
        if (!enabled || !supported) {
          generation++;
          previousSize = '';
          setSurface(null);
          return;
        }
        const bounds = element.getBoundingClientRect();
        const width = Math.round(bounds.width), height = Math.round(bounds.height);
        if (width < 2 || height < 2) return;
        const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0, width / 2, height / 2);
        const size = `${width}:${height}:${radius}`;
        if (size === previousSize) return;
        previousSize = size;
        const version = ++generation;
        try {
          const map = drawLensMap(width, height, radius);
          const image = new Image();
          image.src = map;
          // Decode before enabling the filter to avoid a blank initial glass surface.
          void image.decode().then(() => {
            if (disposed || version !== generation) return;
            setSurface({ map, width, height, strength: Math.min(170, width * 0.24, height * 1.6) });
          }).catch(() => {
            if (!disposed && version === generation) { previousSize = ''; setSurface(null); }
          });
        } catch {
          previousSize = '';
          setSurface(null);
        }
      });
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(element);
    window.addEventListener('resize', refresh);
    transparency.addEventListener('change', refresh);
    contrast.addEventListener('change', refresh);
    refresh();
    return () => {
      disposed = true; generation++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', refresh);
      transparency.removeEventListener('change', refresh);
      contrast.removeEventListener('change', refresh);
    };
  }, [filterId]);

  const refracting = allowed && surface !== null;
  return <div
    className={'player-glass' + (refracting ? ' is-refracting' : '') + (!allowed ? ' is-solid' : '')}
    ref={surfaceRef} aria-hidden="true"
    style={{ '--player-glass-filter': `url("#${filterId}")` } as CSSProperties}
  >
    {surface && <svg className="player-glass-filter" width="0" height="0" focusable="false">
      <defs>
        <filter id={filterId} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB" x={-MAP_PADDING} y={-MAP_PADDING}
          width={surface.width + MAP_PADDING * 2} height={surface.height + MAP_PADDING * 2}>
          <feImage href={surface.map} x={-MAP_PADDING} y={-MAP_PADDING}
            width={surface.width + MAP_PADDING * 2} height={surface.height + MAP_PADDING * 2}
            preserveAspectRatio="none" result="lens" />
          {CHANNELS.map(channel => <Fragment key={channel.name}>
            <feDisplacementMap in="SourceGraphic" in2="lens" scale={surface.strength + channel.offset}
              xChannelSelector="R" yChannelSelector="B" result={channel.name + '-bent'} />
            <feMerge result={channel.name + '-covered'}>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in={channel.name + '-bent'} />
            </feMerge>
            <feColorMatrix in={channel.name + '-covered'} type="matrix" values={channel.matrix} result={channel.name} />
          </Fragment>)}
          <feBlend in="red" in2="green" mode="screen" result="red-green" />
          <feBlend in="red-green" in2="blue" mode="screen" result="glass" />
          <feGaussianBlur in="glass" stdDeviation="0.5" />
        </filter>
      </defs>
    </svg>}
  </div>;
});
