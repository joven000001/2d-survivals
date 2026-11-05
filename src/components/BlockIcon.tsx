import React, { useEffect, useRef } from 'react';
import { getBlockSprite, getItemTileType } from '../game/blockArt';
import { TILE_SIZE } from '../game/constants';

interface BlockIconProps {
  item: string | null;
  className?: string;
  fallbackColor?: string;
  borderColor?: string;
}

export const BlockIcon: React.FC<BlockIconProps> = React.memo(({
  item,
  className = '',
  fallbackColor = 'transparent',
  borderColor = 'transparent',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tile = item ? getItemTileType(item) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tile === null) return;
    const context = canvas.getContext('2d');
    const sprite = getBlockSprite(tile);
    if (!context || !sprite) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
    context.drawImage(sprite, 0, 0);
  }, [tile]);

  if (item === 'copper_bar' || item === 'iron_bar' || item === 'gold_bar') {
    const palette =
      item === 'copper_bar'
        ? { border: '#431407', dark: '#9a3412', mid: '#ea580c', light: '#fdba74', shine: '#ffedd5' }
        : item === 'iron_bar'
        ? { border: '#1e293b', dark: '#64748b', mid: '#cbd5e1', light: '#f1f5f9', shine: '#ffffff' }
        : { border: '#422006', dark: '#a16207', mid: '#eab308', light: '#fde047', shine: '#fef9c3' };
    return (
      <svg
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        className={`inline-block ${className}`}
        aria-hidden="true"
      >
        {/* Ingot outer silhouette */}
        <rect x="1" y="5" width="14" height="7" fill={palette.border} />
        <rect x="2" y="4" width="12" height="1" fill={palette.border} />
        {/* Beveled lower side */}
        <rect x="2" y="9" width="12" height="2" fill={palette.dark} />
        {/* Ingot body */}
        <rect x="2" y="6" width="12" height="3" fill={palette.mid} />
        {/* Top trapezoid face */}
        <rect x="3" y="5" width="10" height="2" fill={palette.light} />
        {/* Specular gleam */}
        <rect x="4" y="5" width="4" height="1" fill={palette.shine} />
        <rect x="3" y="6" width="2" height="1" fill={palette.shine} />
      </svg>
    );
  }

  if (item === 'stick') {
    return (
      <svg
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        className={`inline-block ${className}`}
        aria-hidden="true"
      >
        <rect x="3" y="11" width="3" height="3" fill="#451a03" />
        <rect x="5" y="9" width="3" height="3" fill="#78350f" />
        <rect x="7" y="7" width="3" height="3" fill="#92400e" />
        <rect x="9" y="5" width="3" height="3" fill="#b45309" />
        <rect x="11" y="3" width="2" height="2" fill="#d97706" />
      </svg>
    );
  }

  if (item === 'protector') {
    return (
      <svg
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        className={`inline-block ${className}`}
        aria-hidden="true"
      >
        {/* Obsidian base */}
        <rect x="2" y="12" width="12" height="3" fill="#0f172a" />
        <rect x="3" y="10" width="10" height="2" fill="#1e293b" />
        {/* Pylon brackets */}
        <rect x="2" y="4" width="2" height="6" fill="#083344" />
        <rect x="12" y="4" width="2" height="6" fill="#083344" />
        <rect x="2" y="5" width="1" height="4" fill="#06b6d4" />
        <rect x="13" y="5" width="1" height="4" fill="#06b6d4" />
        {/* Beacon Crown */}
        <rect x="5" y="1" width="6" height="2" fill="#1e293b" />
        <rect x="6" y="0" width="4" height="1" fill="#06b6d4" />
        {/* Diamond Power Core */}
        <rect x="5" y="4" width="6" height="6" fill="#0891b2" />
        <rect x="6" y="3" width="4" height="8" fill="#06b6d4" />
        <rect x="6" y="5" width="4" height="4" fill="#22d3ee" />
        <rect x="7" y="6" width="2" height="2" fill="#ffffff" />
        {/* Energy runes */}
        <rect x="4" y="12" width="8" height="1" fill="#67e8f9" />
      </svg>
    );
  }

  if (tile === null) {
    return <span className={`inline-block ${className}`} style={{ backgroundColor: fallbackColor, borderColor }} aria-hidden="true" />;
  }

  return (
    <canvas
      ref={canvasRef}
      width={TILE_SIZE}
      height={TILE_SIZE}
      className={className}
      style={{ imageRendering: 'pixelated' }}
      aria-hidden="true"
    />
  );
});