import React from 'react';
import { ItemType } from '../game/blocks';

export const MeatIcon: React.FC<{ type: ItemType | string; className?: string }> = ({ type, className = "h-5 w-5 sm:h-7 sm:w-7" }) => {
  switch (type) {
    case 'venison':
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Bone stem */}
          <path d="M2 13h3v2H2zM1 11h2v3H1z" fill="#f8fafc" stroke="#334155" />
          <path d="M3 10l3-3" stroke="#e2e8f0" strokeWidth="2" />
          {/* Rich marbled venison steak */}
          <path d="M5 5h7v2h2v4h-2v2H7V9H5z" fill="#881337" stroke="#4c0519" />
          <path d="M7 6h4v1H7zM8 8h4v1H8z" fill="#be123c" />
          <path d="M9 7h2v1H9zM10 9h2v1h-2z" fill="#fda4af" opacity=".8" />
        </svg>
      );
    case 'rabbit_meat':
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Little bone nub */}
          <path d="M3 13h2v2H3zM2 11h2v2H2z" fill="#f8fafc" stroke="#334155" />
          {/* Tender rabbit drumstick */}
          <path d="M5 8h4v1h3v3h-2v2H7v-2H5z" fill="#e11d48" stroke="#881337" />
          <path d="M6 9h3v1H6zM7 10h4v1H7z" fill="#fb7185" />
          <path d="M8 9h1v1H8z" fill="#fff" opacity=".6" />
        </svg>
      );
    case 'boar_meat':
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Bone handle */}
          <path d="M3 12h2v3H3zM1 13h3v2H1z" fill="#f8fafc" stroke="#334155" />
          {/* Thick fat rind */}
          <path d="M5 4h8v2h1v5h-1v2H7v-1H5z" fill="#fef08a" stroke="#ca8a04" />
          {/* Crimson boar meat slab */}
          <path d="M6 5h6v1h1v4h-1v1H7v-1H6z" fill="#991b1b" />
          <path d="M7 6h4v1H7zM8 8h3v1H8z" fill="#dc2626" />
          <path d="M9 7h2v1H9z" fill="#fecaca" opacity=".7" />
        </svg>
      );
    case 'fox_meat':
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Lean game meat cut */}
          <path d="M4 6h8v2h2v4h-2v2H5v-2H3V9h1z" fill="#ea580c" stroke="#7c2d12" />
          <path d="M5 7h6v2h1v2H6V9H5z" fill="#f97316" />
          <path d="M7 8h3v1H7zM8 10h2v1H8z" fill="#fed7aa" opacity=".75" />
        </svg>
      );
    case 'bird_meat':
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Poultry drumstick: bone stem */}
          <path d="M2 13h3v2H2zM1 11h2v3H1z" fill="#f8fafc" stroke="#475569" />
          <path d="M4 11l3-3" stroke="#f1f5f9" strokeWidth="2" />
          {/* Plump roasted bird drumstick */}
          <path d="M6 4h5v2h2v4h-2v2H8v-1H6z" fill="#ea580c" stroke="#9a3412" />
          <path d="M7 5h3v2h2v2h-2v1H8V7H7z" fill="#fb923c" />
          <path d="M9 6h2v1H9zM8 8h2v1H8z" fill="#ffedd5" opacity=".7" />
        </svg>
      );
    case 'fish':
      return (
        <svg viewBox="0 0 16 16" className={className} shapeRendering="crispEdges" aria-hidden="true">
          {/* Tail fin */}
          <path d="M1 5h2v6H1zM3 7h2v2H3z" fill="#0891b2" stroke="#083344" />
          {/* Fish body */}
          <path d="M4 6h7v1h3v2h-3v1H4z" fill="#06b6d4" stroke="#083344" />
          {/* Belly & scales */}
          <path d="M5 7h5v1H5zM6 8h4v1H6z" fill="#67e8f9" />
          {/* Eye sparkle */}
          <path d="M12 6h1v1h-1z" fill="#ffffff" />
          <path d="M12 7h1v1h-1z" fill="#0f172a" />
        </svg>
      );
    default:
      return null;
  }
};
