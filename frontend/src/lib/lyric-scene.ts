import * as THREE from 'three';
import type { RhythmFrame } from '@/lib/audio-rhythm';

type MotionState = { playing: boolean; preview: boolean; rhythm: RhythmFrame };
const PADDING = 64;
const MAX_LYRIC_SCALE = 1.3;

// Rasterize the browser's actual text layout, preserving its font, wrapping and translation.
function paintLyrics(copy: HTMLElement, canvas: HTMLCanvasElement, width: number, height: number, density: number, activeLayer: boolean) {
  canvas.width = Math.ceil(width * density);
  canvas.height = Math.ceil(height * density);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas text rendering unavailable');
  ctx.scale(density, density);
  ctx.textBaseline = 'alphabetic';
  const origin = copy.getBoundingClientRect();
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  for (const paragraph of copy.querySelectorAll('p')) {
    if (paragraph.matches('.lyric-current > p:first-child') !== activeLayer) continue;
    const style = getComputedStyle(paragraph);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    const node = paragraph.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) continue;
    const text = node.textContent || '';
    const range = document.createRange();
    let offset = 0;
    const segments = segmenter ? segmenter.segment(text) : Array.from(text, segment => {
      const item = { segment, index: offset }; offset += segment.length; return item;
    });
    for (const { segment, index } of segments) {
      if (!segment.trim()) continue;
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
      const bounds = range.getBoundingClientRect();
      const metrics = ctx.measureText(segment);
      const ascent = metrics.fontBoundingBoxAscent ?? Number.parseFloat(style.fontSize) * 0.88;
      const descent = metrics.fontBoundingBoxDescent ?? Number.parseFloat(style.fontSize) * 0.12;
      // Range height is the font box, not the paragraph's CSS line-height.
      const baseline = bounds.top + (bounds.height - ascent - descent) / 2 + ascent;
      ctx.fillText(segment, bounds.left - origin.left + PADDING, baseline - origin.top + PADDING);
    }
  }
}

export function createLyricScene(host: HTMLElement, copy: HTMLElement, canvas: HTMLCanvasElement, read: () => MotionState) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 10000);
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const adjacentMaterial = material.clone();
  let geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  const adjacentMesh = new THREE.Mesh(geometry, adjacentMaterial);
  const anchor = new THREE.Group();
  const pulseGroup = new THREE.Group();
  pulseGroup.add(mesh);
  anchor.add(adjacentMesh, pulseGroup);
  scene.add(anchor);
  mesh.renderOrder = 2;
  adjacentMesh.renderOrder = 1;
  let texture: THREE.CanvasTexture | null = null;
  let adjacentTexture: THREE.CanvasTexture | null = null;
  let width = 1, height = 1, distance = 1, anchorY = 0;
  let targetX = 0, targetY = 0, cameraX = 0, cameraY = 0;
  let strength = 0, scale = 1, rotation = 0, opacity = 0.75;
  const debugMotion = process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).has('lyricsDebug');
  let debugAt = 0, previousPulse = 0;
  let frame = 0, refreshFrame = 0, disposed = false, contextLost = false, textReady = false, lastTime = 0;
  let activeKey = '';
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const refresh = () => {
    cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      if (disposed || !copy.clientWidth || !copy.clientHeight) return;
      try {
        const textWidth = copy.clientWidth + PADDING * 2;
        const textHeight = copy.clientHeight + PADDING * 2;
        const stageBounds = host.closest('.music-stage')?.getBoundingClientRect();
        // Leave room for the active line to grow without clipping its own canvas.
        width = stageBounds?.width || textWidth;
        height = stageBounds?.height || textHeight;
        // Bound the framebuffer/texture cost on retina and wide desktop screens.
        const density = Math.min(window.devicePixelRatio || 1, 1.75, 2048 / width, 2048 / height);
        renderer.setPixelRatio(density);
        renderer.setSize(width, height, false);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        camera.aspect = width / height;
        distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        const current = copy.querySelector('.lyric-current > p');
        const currentBounds = current?.getBoundingClientRect();
        anchorY = currentBounds ? copy.clientHeight / 2 - (currentBounds.top - copy.getBoundingClientRect().top + currentBounds.height / 2) : 0;
        // Lens shift retains the DOM position while the camera orbits the active line.
        camera.setViewOffset(width, height, 0, anchorY, width, height);
        camera.updateProjectionMatrix();
        const textureDensity = Math.min(window.devicePixelRatio || 1, 2, 2048 / textWidth, 2048 / textHeight);
        const makeTexture = (active: boolean) => {
          const textCanvas = document.createElement('canvas');
          paintLyrics(copy, textCanvas, textWidth, textHeight, textureDensity, active);
          const result = new THREE.CanvasTexture(textCanvas);
          result.colorSpace = THREE.SRGBColorSpace;
          result.generateMipmaps = false;
          result.minFilter = THREE.LinearFilter;
          result.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          return result;
        };
        texture?.dispose();
        adjacentTexture?.dispose();
        texture = makeTexture(true);
        adjacentTexture = makeTexture(false);
        material.map = texture;
        adjacentMaterial.map = adjacentTexture;
        material.needsUpdate = true;
        adjacentMaterial.needsUpdate = true;
        geometry.dispose();
        geometry = new THREE.PlaneGeometry(textWidth, textHeight, 48, 1);
        const positions = geometry.attributes.position;
        const radius = Math.max(textWidth * 1.3, 600);
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const angle = x / radius;
          positions.setXYZ(i, Math.sin(angle) * radius, positions.getY(i) - anchorY, (Math.cos(angle) - 1) * radius);
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        mesh.geometry = geometry;
        adjacentMesh.geometry = geometry;
        anchor.position.y = anchorY;
        const nextKey = copy.dataset.line || '';
        if (nextKey !== activeKey) { opacity = 0.65; activeKey = nextKey; }
        textReady = true;
        if (!document.hidden) start();
      } catch {
        textReady = false;
        delete host.dataset.webgl;
      }
    });
  };
  const onPointer = (event: PointerEvent) => {
    if (!finePointer.matches || event.pointerType === 'touch') return;
    const stage = host.closest('.music-stage')?.getBoundingClientRect();
    if (!stage) return;
    targetX = Math.max(-1, Math.min(1, (event.clientX - stage.left) / stage.width * 2 - 1));
    targetY = Math.max(-1, Math.min(1, (event.clientY - stage.top) / stage.height * 2 - 1));
    start();
  };
  const resetPointer = () => { targetX = 0; targetY = 0; start(); };
  const render = (now: number) => {
    frame = 0;
    if (disposed || contextLost || !textReady || document.hidden) return;
    // 45 fps ceiling, enough for text motion without a full-rate GPU loop.
    if (now - lastTime < 1000 / 45) { frame = requestAnimationFrame(render); return; }
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    const motion = read();
    const t = now / 1000;
    // Preview has no audio. A demo envelope is confined to the visual-preview route.
    const demoAge = t % 0.72;
    const rhythm = motion.preview ? { energy: 0.6, bassWeight: 0.7, pulse: Math.exp(-Math.max(0, demoAge - 0.045) * 10) } : motion.rhythm;
    const blend = 1 - Math.exp(-dt * 9);
    strength += ((motion.playing ? 1 : 0) - strength) * blend;
    const beat = rhythm.pulse * strength;
    // Gentle sway and onset scaling remain independent of the mouse orbit.
    const sway = (0.0015 + rhythm.energy * 0.004) * strength;
    const desiredRotation = Math.sin(t * 1.35) * sway;
    rotation += (desiredRotation - rotation) * blend;
    const desiredScale = 1 + Math.max(0, Math.min(1, beat)) * (MAX_LYRIC_SCALE - 1);
    scale += (desiredScale - scale) * (1 - Math.exp(-dt * (desiredScale > scale ? 55 : 14)));
    cameraX += (targetX - cameraX) * blend;
    cameraY += (targetY - cameraY) * blend;
    // Fixed-radius orbit: mouse perspective cannot zoom out and cancel the pulse.
    const yaw = cameraX * 0.29;
    const pitch = -cameraY * 0.19;
    camera.position.set(distance * Math.sin(yaw) * Math.cos(pitch), anchorY + distance * Math.sin(pitch), distance * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(0, anchorY, 0);
    anchor.rotation.z = rotation;
    pulseGroup.scale.setScalar(Math.min(MAX_LYRIC_SCALE, scale));
    opacity += (1 - opacity) * blend;
    material.opacity = opacity;
    adjacentMaterial.opacity = opacity * Math.max(0, 1 - (scale - 1) / 1.2);
    if (debugMotion && (beat > previousPulse + 0.1 || now - debugAt > 1000)) {
      console.debug('[lyrics-motion]', JSON.stringify({ pulse: +beat.toFixed(3), scale: +scale.toFixed(3), targetScale: +desiredScale.toFixed(3), yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3) }));
      debugAt = now;
    }
    previousPulse = beat;
    renderer.render(scene, camera);
    host.dataset.webgl = 'ready';
    const moving = motion.playing || strength > 0.001 || Math.abs(scale - 1) > 0.0001 || Math.abs(rotation) > 0.0001 || Math.abs(cameraX - targetX) > 0.001 || Math.abs(cameraY - targetY) > 0.001 || opacity < 0.999;
    if (moving) frame = requestAnimationFrame(render);
  };
  function start() { if (!disposed && !contextLost && !document.hidden && !frame) frame = requestAnimationFrame(render); }
  const onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
    else { lastTime = performance.now(); start(); }
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame); frame = 0;
    delete host.dataset.webgl;
  };
  const onContextRestored = () => { contextLost = false; refresh(); start(); };
  const observer = new ResizeObserver(refresh);
  observer.observe(copy);
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('resize', refresh);
  document.documentElement.addEventListener('pointerleave', resetPointer);
  window.addEventListener('blur', resetPointer);
  document.addEventListener('visibilitychange', onVisibility);
  document.fonts.addEventListener('loadingdone', refresh);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  void document.fonts.ready.then(() => { if (!disposed) refresh(); });
  refresh();
  return {
    refresh,
    wake: start,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame); cancelAnimationFrame(refreshFrame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', refresh);
      document.documentElement.removeEventListener('pointerleave', resetPointer);
      window.removeEventListener('blur', resetPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      document.fonts.removeEventListener('loadingdone', refresh);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      texture?.dispose(); adjacentTexture?.dispose(); geometry.dispose(); material.dispose(); adjacentMaterial.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      delete host.dataset.webgl;
    },
  };
}
