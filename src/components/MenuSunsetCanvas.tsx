import { useEffect, useRef } from 'react';
import { MOON_PHASES } from '../game/renderer';

type CloudShape = { x: number; y: number; width: number; speed: number; scale: number };
type TreeShape = { x: number; height: number; width: number };
type StarShape = { x: number; y: number; size: number; phase: number; speed: number; color: string; beacon: boolean };

const SCENE_PERIOD = 1200;
const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

export function MenuSunsetCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const clouds: CloudShape[] = [
      { x: 90, y: 0.34, width: 108, speed: 3.5, scale: 0.82 },
      { x: 370, y: 0.43, width: 146, speed: 2.7, scale: 1 },
      { x: 700, y: 0.29, width: 120, speed: 3.1, scale: 0.76 },
      { x: 1010, y: 0.39, width: 158, speed: 2.4, scale: 0.92 },
    ];
    const trees: TreeShape[] = Array.from({ length: 18 }, (_, index) => ({
      x: mod(index * 79 + (index % 3) * 19, SCENE_PERIOD),
      height: 46 + ((index * 37) % 42),
      width: 13 + ((index * 11) % 10),
    }));
    const starPalette = ['#ffffff', '#dbeafe', '#fef08a', '#fbcfe8', '#e9d5ff'];
    const stars: StarShape[] = Array.from({ length: 96 }, (_, index) => ({
      x: mod(index * 167 + 31, SCENE_PERIOD),
      y: 0.025 + ((index * 41) % 46) / 100,
      size: index % 8 === 0 ? 2 : 1,
      phase: index * 1.7,
      speed: 1.2 + (index % 5) * 0.45,
      color: starPalette[index % starPalette.length],
      beacon: index % 9 === 0,
    }));

    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let frame = 0;
    let lastTime = 0;
    let elapsed = 0;
    let isAnimating = false;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.imageSmoothingEnabled = false;
      draw(elapsed);
    };

    const drawMoonPhase = (cx: number, cy: number, phaseIndex: number) => {
      const phase = MOON_PHASES[phaseIndex % MOON_PHASES.length];
      const haloRadius = 32 + phase.illumination * 24;
      const halo = context.createRadialGradient(cx, cy, 4, cx, cy, haloRadius);
      halo.addColorStop(0, `rgba(226, 232, 240, ${(0.22 + phase.illumination * 0.25).toFixed(3)})`);
      halo.addColorStop(0.5, 'rgba(148, 163, 184, 0.12)');
      halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
      context.fillStyle = halo;
      context.beginPath();
      context.arc(cx, cy, haloRadius, 0, Math.PI * 2);
      context.fill();

      const texel = 2;
      const gridR = 8;
      const pIdx = ((phase.index % 4) + 4) % 4;
      for (let gy = -gridR; gy < gridR; gy++) {
        for (let gx = -gridR; gx < gridR; gx++) {
          const nx = (gx + 0.5) / gridR;
          const ny = (gy + 0.5) / gridR;
          const distSq = nx * nx + ny * ny;
          if (distSq > 1.0) continue;
          const isRim = distSq >= 0.76;

          let isLit = true;
          switch (pIdx) {
            case 0:
              isLit = true;
              break;
            case 1:
              isLit = nx >= 0;
              break;
            case 2: {
              const sdx = nx + 0.36;
              const sdy = ny - 0.04;
              isLit = sdx * sdx + sdy * sdy >= 0.72;
              break;
            }
            case 3:
            default:
              isLit = false;
              break;
          }

          const px = Math.floor(cx + gx * texel);
          const py = Math.floor(cy + gy * texel);
          const isCrater =
            (gx === -3 && gy === -2) ||
            (gx === -2 && gy === -2) ||
            (gx === 2 && gy === 1) ||
            (gx === 3 && gy === 2) ||
            (gx === -1 && gy === 3);

          if (isLit) {
            context.fillStyle = isRim ? '#ffffff' : isCrater ? '#cbd5e1' : '#fefce8';
            context.fillRect(px, py, texel, texel);
          } else {
            context.fillStyle = isRim ? 'rgba(148, 163, 184, 0.42)' : 'rgba(10, 15, 30, 0.88)';
            context.fillRect(px, py, texel, texel);
          }
        }
      }
    };

    const draw = (time: number) => {
      const horizon = height * 0.68;
      const distantShift = mod(time * 2.1, SCENE_PERIOD);
      const nearShift = mod(time * 5.2, SCENE_PERIOD);

      // Rich twilight-to-blazing-sunset gradient
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0.0, '#05081c');
      sky.addColorStop(0.24, '#1b1447');
      sky.addColorStop(0.46, '#581c87');
      sky.addColorStop(0.66, '#e11d48');
      sky.addColorStop(0.84, '#f97316');
      sky.addColorStop(1.0, '#fde047');
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      // Upper-sky Aurora Borealis ribbons with dynamic color shifting & geomagnetic flickering
      const stripW = Math.max(6, Math.floor(width / 72));
      const clampCh = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
      for (let band = 0; band < 2; band++) {
        const baseY = height * (0.11 + band * 0.075);
        const speed = band === 0 ? 0.45 : -0.36;
        for (let sx = 0; sx < width + stripW; sx += stripW) {
          const waveY =
            Math.sin(sx * 0.006 + time * speed + band * 2) * (height * 0.036) +
            Math.cos(sx * 0.015 - time * speed * 0.8) * (height * 0.018);
          const slowPulse =
            0.35 +
            0.65 *
              Math.pow((Math.sin(sx * 0.03 + time * 1.1 + band) + 1) * 0.5, 1.4);
          const fastFlicker =
            0.82 +
            0.18 *
              Math.sin(sx * 0.065 - time * 5.1 + band * 2.3) *
              Math.cos(time * 7.4 + sx * 0.039);
          const rayPulse = slowPulse * fastFlicker;
          const env = 0.45 + 0.55 * Math.sin(sx * 0.003 + time * 0.15 + band * 1.7);
          const alpha = rayPulse * env * (band === 0 ? 0.36 : 0.27);
          if (alpha <= 0.03) continue;

          const colorShift = Math.sin(sx * 0.0045 - time * 0.52 + band * 1.4) * 32;
          const roseShift = Math.max(0, Math.sin(sx * 0.009 + time * 0.88 + band)) * 36;
          const lowR = clampCh(52 + colorShift * 0.5);
          const lowG = clampCh(215 + colorShift * 0.6);
          const lowB = clampCh(165 - colorShift * 0.6);
          const midR = clampCh(48 + roseShift * 0.7);
          const midG = clampCh(205 - colorShift * 0.5);
          const midB = clampCh(238 + colorShift * 0.4);
          const highR = clampCh(175 + roseShift);
          const highG = clampCh(88 - roseShift * 0.3);
          const highB = clampCh(247);

          const rayH = Math.floor(height * (0.09 + rayPulse * 0.075));
          const botY = Math.floor(baseY + waveY + rayH);
          const h1 = Math.max(3, Math.floor(rayH * 0.18));
          const h2 = Math.max(5, Math.floor(rayH * 0.36));
          const h3 = Math.max(6, rayH - h1 - h2);

          if (rayPulse > 0.74) {
            context.fillStyle = `rgba(185, 255, 235, ${Math.min(0.85, alpha * 1.45).toFixed(3)})`;
            context.fillRect(sx, botY - 2, stripW, 2);
          }
          context.fillStyle = `rgba(${lowR}, ${lowG}, ${lowB}, ${Math.min(0.78, alpha * 1.38).toFixed(3)})`;
          context.fillRect(sx, botY - h1, stripW, h1);
          context.fillStyle = `rgba(${midR}, ${midG}, ${midB}, ${alpha.toFixed(3)})`;
          context.fillRect(sx, botY - h1 - h2, stripW, h2);
          context.fillStyle = `rgba(${highR}, ${highG}, ${highB}, ${(alpha * 0.58).toFixed(3)})`;
          context.fillRect(sx, botY - rayH, stripW, h3);
        }
      }

      // Multi-harmonic twinkling stars & 4-point glints
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const w1 = Math.sin(time * star.speed + star.phase);
        const w2 = Math.cos(time * (star.speed * 1.71) - star.phase * 0.63);
        const w3 = Math.sin(time * (star.speed * 3.3) + i * 1.7);
        const combined = w1 * 0.58 + w2 * 0.30 + w3 * 0.12;
        const norm = (combined + 1) * 0.5;
        const alpha = 0.12 + Math.pow(norm, 1.65) * 0.86;
        const sx = Math.floor(mod((star.x / SCENE_PERIOD) * width, width));
        const sy = Math.floor(star.y * height);
        const flaring = combined > 0.46;
        const sz = star.size === 1 && flaring && i % 3 === 0 ? 2 : star.size;

        context.globalAlpha = Math.max(0, Math.min(1, alpha));
        context.fillStyle = flaring ? '#ffffff' : star.color;
        context.fillRect(sx, sy, sz, sz);
        if ((star.beacon && combined > -0.1) || (flaring && i % 2 === 0)) {
          context.globalAlpha = Math.min(1, alpha * 0.68);
          context.fillStyle = star.color;
          context.fillRect(sx - 2, sy, 2, 1);
          context.fillRect(sx + sz, sy, 2, 1);
          context.fillRect(sx, sy - 2, 1, 2);
          context.fillRect(sx, sy + sz, 1, 2);
        }
      }
      context.globalAlpha = 1.0;

      // Cycling Moon Phase in upper right twilight sky (cycles every 6 seconds)
      const activeMoonPhase = Math.floor(time / 6) % 8;
      drawMoonPhase(width * 0.82, height * 0.17, activeMoonPhase);

      // Blazing Sunset Radial Glow & Crepuscular Rays
      const sunX = width * 0.52;
      const sunY = horizon * 0.79;
      const glow = context.createRadialGradient(sunX, horizon * 0.92, 8, sunX, horizon * 0.92, height * 0.58);
      glow.addColorStop(0, 'rgba(254, 240, 138, 0.52)');
      glow.addColorStop(0.35, 'rgba(251, 146, 60, 0.28)');
      glow.addColorStop(0.7, 'rgba(225, 29, 72, 0.14)');
      glow.addColorStop(1, 'rgba(225, 29, 72, 0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      const sunSize = Math.min(width * 0.17, height * 0.28, 132);
      context.fillStyle = 'rgba(251, 146, 60, 0.22)';
      context.fillRect(sunX - sunSize * 0.82, sunY - sunSize * 0.82, sunSize * 1.64, sunSize * 1.64);
      context.fillStyle = '#e11d48';
      context.fillRect(sunX - sunSize / 2, sunY - sunSize / 2, sunSize, sunSize);
      context.fillStyle = '#f97316';
      context.fillRect(sunX - sunSize * 0.42, sunY - sunSize * 0.42, sunSize * 0.84, sunSize * 0.84);
      context.fillStyle = '#fde047';
      context.fillRect(sunX - sunSize * 0.32, sunY - sunSize * 0.32, sunSize * 0.64, sunSize * 0.64);
      context.fillStyle = '#ffffff';
      context.fillRect(sunX - sunSize * 0.2, sunY - sunSize * 0.26, sunSize * 0.18, sunSize * 0.08);

      // Sunset scanline bands across lower sun
      context.fillStyle = 'rgba(190, 24, 93, 0.45)';
      context.fillRect(sunX - sunSize / 2, sunY + sunSize * 0.12, sunSize, 4);
      context.fillRect(sunX - sunSize / 2, sunY + sunSize * 0.26, sunSize, 4);

      for (const cloud of clouds) {
        const cloudX = mod(cloud.x + time * cloud.speed, width + cloud.width * 2) - cloud.width;
        const cloudY = cloud.y * height;
        const cloudWidth = cloud.width * cloud.scale * Math.max(0.72, width / 1200);
        const block = Math.max(5, Math.round(cloudWidth / 12));
        context.fillStyle = 'rgba(131, 24, 67, 0.46)';
        context.fillRect(cloudX + block, cloudY + block, cloudWidth * 0.78, block * 1.3);
        context.fillStyle = 'rgba(254, 215, 170, 0.78)';
        context.fillRect(cloudX, cloudY, cloudWidth, block * 1.2);
        context.fillRect(cloudX + block * 2, cloudY - block, cloudWidth * 0.58, block * 1.2);
        context.fillRect(cloudX + block * 5, cloudY - block * 2, cloudWidth * 0.29, block * 1.2);
        context.fillStyle = 'rgba(244, 63, 94, 0.52)';
        context.fillRect(cloudX + block * 0.5, cloudY + block * 0.9, cloudWidth * 0.84, 3);
      }

      const drawRidge = (baseY: number, amplitude: number, color: string, shift: number, step: number, phase: number) => {
        context.beginPath();
        context.moveTo(0, height);
        for (let x = -step; x <= width + step; x += step) {
          const worldX = x + shift;
          const wave = Math.sin(((worldX + phase) * Math.PI * 2) / SCENE_PERIOD);
          const detail = Math.sin(((worldX + phase) * Math.PI * 6) / SCENE_PERIOD) * amplitude * 0.2;
          const y = baseY - wave * amplitude - detail;
          context.lineTo(Math.round(x), Math.round(y));
        }
        context.lineTo(width, height);
        context.closePath();
        context.fillStyle = color;
        context.fill();
      };

      drawRidge(horizon + height * 0.015, height * 0.105, '#6b21a8', distantShift, 14, 90);
      drawRidge(height * 0.79, height * 0.095, '#4c1d95', distantShift * 1.35, 11, 390);
      drawRidge(height * 0.88, height * 0.075, '#1e293b', nearShift, 8, 170);

      const groundTop = height * 0.89;
      for (const tree of trees) {
        const treeX = (mod(tree.x + nearShift, SCENE_PERIOD) / SCENE_PERIOD) * width;
        const treeHeight = tree.height * Math.max(0.75, height / 720);
        const treeWidth = tree.width * Math.max(0.75, height / 720);
        context.fillStyle = '#0f172a';
        context.fillRect(treeX - treeWidth * 0.13, groundTop - treeHeight * 0.46, treeWidth * 0.26, treeHeight * 0.48);
        context.fillRect(treeX - treeWidth * 0.58, groundTop - treeHeight * 0.62, treeWidth * 1.16, treeHeight * 0.18);
        context.fillRect(treeX - treeWidth * 0.4, groundTop - treeHeight * 0.79, treeWidth * 0.8, treeHeight * 0.2);
        context.fillRect(treeX - treeWidth * 0.21, groundTop - treeHeight * 0.96, treeWidth * 0.42, treeHeight * 0.2);
      }

      drawRidge(height * 0.965, height * 0.018, '#091520', nearShift, 7, 650);

      // Swaying foreground grass blades along the sunset ridge
      for (let gx = 6; gx < width; gx += 14) {
        const worldGX = gx + nearShift;
        const ridgeWave = Math.sin(((worldGX + 650) * Math.PI * 2) / SCENE_PERIOD);
        const ridgeDetail = Math.sin(((worldGX + 650) * Math.PI * 6) / SCENE_PERIOD) * (height * 0.018) * 0.2;
        const baseY = Math.round(height * 0.965 - ridgeWave * (height * 0.018) - ridgeDetail);
        const sway = Math.round(Math.sin(time * 2.4 + gx * 0.08) * 2.5);
        const bladeH = 8 + ((gx * 7) % 6);
        context.fillStyle = '#0f172a';
        context.fillRect(gx, baseY - Math.floor(bladeH * 0.5), 2, Math.ceil(bladeH * 0.5));
        context.fillStyle = '#1e293b';
        context.fillRect(gx + sway, baseY - bladeH, 2, Math.ceil(bladeH * 0.55));
        context.fillStyle = 'rgba(251, 146, 60, 0.55)';
        context.fillRect(gx + sway, baseY - bladeH, 1, 2);
      }

      // Drifting golden twilight fireflies above the silhouette
      for (let f = 0; f < 14; f++) {
        const fx = mod(f * 137 + time * (10 + (f % 4) * 4) + Math.sin(time * 1.4 + f) * 18, width);
        const fy = groundTop - 16 - ((f * 29) % Math.max(40, Math.floor(height * 0.22))) + Math.cos(time * 1.8 + f * 2.1) * 8;
        const pulse = (Math.sin(time * (2.6 + (f % 3) * 0.7) + f * 3.7) + 1) * 0.5;
        if (pulse > 0.2) {
          context.fillStyle = `rgba(251, 191, 36, ${(pulse * 0.28).toFixed(3)})`;
          context.fillRect(Math.round(fx) - 2, Math.round(fy) - 2, 6, 6);
          context.fillStyle = `rgba(254, 249, 195, ${(0.35 + pulse * 0.6).toFixed(3)})`;
          context.fillRect(Math.round(fx), Math.round(fy), 2, 2);
        }
      }

      const foreground = context.createLinearGradient(0, groundTop, 0, height);
      foreground.addColorStop(0, 'rgba(251, 146, 60, 0.22)');
      foreground.addColorStop(0.16, 'rgba(31, 49, 48, 0.18)');
      foreground.addColorStop(1, 'rgba(5, 10, 24, 0.42)');
      context.fillStyle = foreground;
      context.fillRect(0, groundTop, width, height - groundTop);
    };

    const animate = (now: number) => {
      const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
      lastTime = now;
      elapsed += delta;
      draw(elapsed);
      if (isAnimating) frame = window.requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (isAnimating || document.hidden || reducedMotion.matches) return;
      isAnimating = true;
      lastTime = 0;
      frame = window.requestAnimationFrame(animate);
    };

    const stopAnimation = () => {
      isAnimating = false;
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    };

    const updateMotion = () => {
      if (reducedMotion.matches) {
        stopAnimation();
        draw(elapsed);
      } else {
        startAnimation();
      }
    };

    const updateVisibility = () => {
      if (document.hidden) stopAnimation();
      else startAnimation();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    document.addEventListener('visibilitychange', updateVisibility);
    reducedMotion.addEventListener('change', updateMotion);
    startAnimation();

    return () => {
      stopAnimation();
      document.removeEventListener('visibilitychange', updateVisibility);
      reducedMotion.removeEventListener('change', updateMotion);
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
