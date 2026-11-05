import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GameEngine } from '../game/engine';

interface TouchControlsProps {
  engine: GameEngine | null;
  visible?: boolean;
  onOpenInventory?: () => void;
  onOpenCreativeCatalog?: () => void;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  engine,
  visible = true,
  onOpenInventory,
  onOpenCreativeCatalog,
}) => {
  const [touchMode, setTouchMode] = useState<'mine' | 'place'>(engine?.touchMode ?? 'mine');
  const [isSprinting, setIsSprinting] = useState(false);
  const [isMining, setIsMining] = useState(false);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const [isJoystickActive, setIsJoystickActive] = useState(false);

  const joystickRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const baseCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Sync touchMode with engine
  useEffect(() => {
    if (!engine) return;
    setTouchMode(engine.touchMode);
    engine.onTouchModeChanged = (mode) => {
      setTouchMode(mode);
    };
  }, [engine]);

  const maxRadius = 42; // Max joystick thumb travel radius in px

  const handleJoystickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    baseCenterRef.current = { x: centerX, y: centerY };
    activePointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsJoystickActive(true);

    // Initial offset calculation
    const rawDx = e.clientX - centerX;
    const rawDy = e.clientY - centerY;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(rawDy, rawDx);
    const x = Math.cos(angle) * clampedDist;
    const y = Math.sin(angle) * clampedDist;

    setStickPos({ x, y });
    const analogX = clampedDist > 4 ? x / maxRadius : 0;
    const analogY = clampedDist > 4 ? y / maxRadius : 0;
    engine?.setVirtualAnalog(analogX, analogY);
  };

  const handleJoystickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    const { x: centerX, y: centerY } = baseCenterRef.current;
    const rawDx = e.clientX - centerX;
    const rawDy = e.clientY - centerY;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(rawDy, rawDx);
    const x = Math.cos(angle) * clampedDist;
    const y = Math.sin(angle) * clampedDist;

    setStickPos({ x, y });
    const analogX = clampedDist > 4 ? x / maxRadius : 0;
    const analogY = clampedDist > 4 ? y / maxRadius : 0;
    engine?.setVirtualAnalog(analogX, analogY);
  };

  const handleJoystickPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was already released
    }
    activePointerIdRef.current = null;
    setIsJoystickActive(false);
    setStickPos({ x: 0, y: 0 });
    engine?.setVirtualAnalog(0, 0);
  };

  const handleJumpPress = (active: boolean, e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    engine?.setVirtualInput('jump', active);
  };

  const handleSprintToggle = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !isSprinting;
    setIsSprinting(next);
    engine?.setVirtualInput('sprint', next);
  };

  const handleAttackPress = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    engine?.performSwordAttack();
  };

  const handleDigPress = (active: boolean, e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMining(active);
    engine?.triggerMine(active);
  };

  const handleInteractPress = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    engine?.interactNearby();
  };

  const handleToggleTouchMode = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!engine) return;
    const next = engine.toggleTouchMode();
    setTouchMode(next);
  };

  const handlePlaceBlockPress = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    engine?.triggerPlaceBlock();
  };

  const handleBagPress = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenInventory?.();
  };

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 select-none overflow-hidden touch-none"
      aria-label="Mobile On-Screen Controls"
      style={{
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* BOTTOM-LEFT: VIRTUAL JOYSTICK & SPRINT */}
      <div className="absolute bottom-3 left-2 sm:bottom-4 sm:left-4 flex flex-col items-center gap-2 pointer-events-auto">
        {/* Sprint Toggle Button above joystick */}
        <button
          type="button"
          onPointerDown={handleSprintToggle}
          aria-label={isSprinting ? 'Sprint Active' : 'Toggle Sprint'}
          className={`px-3 py-1 rounded-full border-2 text-[10px] font-bold font-pixel tracking-wider shadow-lg transition-transform active:scale-95 ${
            isSprinting
              ? 'bg-cyan-500 border-cyan-200 text-slate-950 shadow-cyan-500/50 scale-105'
              : 'bg-slate-950/75 border-slate-600/70 text-cyan-300 backdrop-blur-sm'
          }`}
        >
          ⚡ {isSprinting ? 'SPRINT ON' : 'SPRINT'}
        </button>

        {/* Virtual Joystick Disc */}
        <div
          ref={joystickRef}
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={handleJoystickPointerUp}
          onPointerCancel={handleJoystickPointerUp}
          className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center touch-none shadow-2xl transition-colors ${
            isJoystickActive ? 'border-emerald-400/80 bg-slate-950/85' : 'border-slate-500/50'
          }`}
          style={{ touchAction: 'none' }}
        >
          {/* Subtle directional indicators on base */}
          <div className="absolute inset-2 rounded-full border border-dashed border-white/15 pointer-events-none" />
          <span className="absolute top-1 text-[9px] font-bold text-slate-500 pointer-events-none">▲</span>
          <span className="absolute bottom-1 text-[9px] font-bold text-slate-500 pointer-events-none">▼</span>
          <span className="absolute left-1.5 text-[9px] font-bold text-slate-500 pointer-events-none">◀</span>
          <span className="absolute right-1.5 text-[9px] font-bold text-slate-500 pointer-events-none">▶</span>

          {/* Moveable Thumb / Knob */}
          <div
            className={`w-12 h-12 rounded-full border-2 flex items-center justify-center shadow-lg transition-shadow pointer-events-none ${
              isJoystickActive
                ? 'border-emerald-300 bg-emerald-500 text-slate-950 shadow-emerald-400/50 scale-105'
                : 'border-slate-400/80 bg-slate-800/90 text-slate-200'
            }`}
            style={{
              transform: `translate3d(${stickPos.x}px, ${stickPos.y}px, 0)`,
            }}
          >
            <div className="w-4 h-4 rounded-full bg-white/40" />
          </div>
        </div>
      </div>

      {/* BOTTOM-RIGHT: ACTION CLUSTER (JUMP, ATTACK, INTERACT, DIG, PLACE, MODE, BAG) */}
      <div className="absolute bottom-3 right-2 sm:bottom-4 sm:right-4 flex flex-col items-end gap-2 pointer-events-auto">
        {/* Top row of action cluster: Mode Toggle, Dig, Place, Bag */}
        <div className="flex items-center gap-1.5">
          {/* Touch Mode Toggle: MINE vs PLACE on canvas */}
          <button
            type="button"
            onPointerDown={handleToggleTouchMode}
            aria-label={`Switch touch mode, currently ${touchMode.toUpperCase()}`}
            title="Toggle canvas tap mode between mining and placing"
            className={`px-2 py-1.5 rounded-xl border-2 font-pixel text-[8.5px] sm:text-[9.5px] shadow-lg active:scale-95 transition-all flex items-center gap-1 ${
              touchMode === 'place'
                ? 'bg-amber-600/90 border-amber-300 text-amber-50 shadow-amber-900/60'
                : 'bg-emerald-800/90 border-emerald-300 text-emerald-50 shadow-emerald-950/60'
            }`}
          >
            <span>{touchMode === 'place' ? '🧱 PLACE' : '⛏️ MINE'}</span>
          </button>

          {/* Continuous DIG / MINE Button */}
          <button
            type="button"
            onPointerDown={(e) => handleDigPress(true, e)}
            onPointerUp={(e) => handleDigPress(false, e)}
            onPointerCancel={(e) => handleDigPress(false, e)}
            aria-label="Dig or Mine block in front"
            title="Hold to mine block in front"
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl border-2 font-bold flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all text-xs ${
              isMining
                ? 'bg-emerald-500 border-emerald-200 text-slate-950 scale-105 shadow-emerald-500/50'
                : 'bg-emerald-800/85 border-emerald-400 text-white'
            }`}
          >
            <span className="text-sm leading-none">⛏️</span>
            <span className="text-[7px] font-pixel leading-none mt-0.5">DIG</span>
          </button>

          {/* Instant Place Block Button */}
          <button
            type="button"
            onPointerDown={handlePlaceBlockPress}
            aria-label="Place Block"
            title="Place selected block in front or at target"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-700/85 border-2 border-amber-400 text-white font-bold flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all text-xs"
          >
            <span className="text-sm leading-none">🧱</span>
            <span className="text-[7px] font-pixel leading-none mt-0.5">PUT</span>
          </button>

          {/* Quick Backpack / Inventory Button */}
          <button
            type="button"
            onPointerDown={handleBagPress}
            aria-label="Open Inventory & Crafting"
            title="Open Backpack (Inventory & Crafting)"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#5c4326] border-2 border-[#e4bd68] text-amber-200 font-bold flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all text-xs"
          >
            <span className="text-sm leading-none">🎒</span>
            <span className="text-[7px] font-pixel leading-none mt-0.5">BAG</span>
          </button>

          {/* Creative Flight & Catalog buttons if in Creative Mode */}
          {engine?.isCreative && (
            <>
              <button
                type="button"
                onPointerDown={() => engine.toggleFlight()}
                aria-label="Toggle Flight"
                title="Toggle Flight (Creative)"
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-purple-700/90 border-2 border-purple-300 text-white font-bold flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all text-xs"
              >
                <span className="text-sm leading-none">🪽</span>
                <span className="text-[7px] font-pixel leading-none mt-0.5">FLY</span>
              </button>
              <button
                type="button"
                onPointerDown={() => onOpenCreativeCatalog?.()}
                aria-label="Open Creative Catalog"
                title="Open Creative Catalog"
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-600/90 border-2 border-amber-300 text-white font-bold flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all text-xs"
              >
                <span className="text-sm leading-none">✨</span>
                <span className="text-[7px] font-pixel leading-none mt-0.5">ITEMS</span>
              </button>
            </>
          )}
        </div>

        {/* Main Action Pad */}
        <div className="grid grid-cols-2 gap-2 items-center">
          {/* Attack Button */}
          <button
            type="button"
            onPointerDown={handleAttackPress}
            aria-label="Attack with Weapon"
            title="Attack (Sword swing / attack)"
            className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-rose-700/90 border-2 border-rose-300 text-white font-bold flex flex-col items-center justify-center shadow-xl active:scale-95 active:bg-rose-600 transition-all font-pixel text-xs tracking-tight"
          >
            <span className="text-base">⚔️</span>
            <span className="text-[7.5px] mt-0.5">ATTACK</span>
          </button>

          {/* Interact / Use Button */}
          <button
            type="button"
            onPointerDown={handleInteractPress}
            aria-label="Interact with object or container"
            title="Interact with chests, doors, crafting tables, furnaces, signs, or harvest crops"
            className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-sky-700/90 border-2 border-sky-300 text-white font-bold flex flex-col items-center justify-center shadow-xl active:scale-95 active:bg-sky-600 transition-all font-pixel text-xs tracking-tight"
          >
            <span className="text-base">✋</span>
            <span className="text-[7.5px] mt-0.5">USE</span>
          </button>

          {/* Primary JUMP Button (Spans 2 columns for easy right thumb access) */}
          <button
            type="button"
            onPointerDown={(e) => handleJumpPress(true, e)}
            onPointerUp={(e) => handleJumpPress(false, e)}
            onPointerCancel={(e) => handleJumpPress(false, e)}
            aria-label="Jump"
            className="col-span-2 h-13 sm:h-14 rounded-2xl bg-amber-500/95 border-2 border-amber-200 text-slate-950 font-black flex items-center justify-center shadow-2xl active:scale-95 active:bg-amber-400 transition-all font-pixel text-xs tracking-wider ring-2 ring-amber-400/40"
          >
            JUMP
          </button>
        </div>
      </div>
    </div>
  );
};
