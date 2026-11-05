import React from 'react';
import { Backpack } from 'lucide-react';
import { HotbarItem } from '../game/types';
import { InventorySlotRef } from '../game/inventory';
import { isMeatItem } from '../game/blocks';
import { MeatIcon } from './MeatIcon';
import { BlockIcon } from './BlockIcon';

interface HotbarProps {
  slots: HotbarItem[];
  activeSlot: number;
  onSelectSlot: (index: number) => void;
  onOpenInventory: () => void;
  onDragStart: (slot: InventorySlotRef) => void;
  onDragOver: (slot: InventorySlotRef) => void;
  onDrop: (slot: InventorySlotRef) => void;
  dragTarget: InventorySlotRef | null;
  onSlotPointerDown?: (slot: InventorySlotRef, item: HotbarItem, e: React.PointerEvent) => void;
  isTouchActive?: boolean;
}

const TOOL_COLORS: Record<string, string> = {
  wood: '#b77943',
  stone: '#94a3b8',
  copper: '#c87953',
  iron: '#dbe4ee',
  gold: '#facc15',
  diamond: '#38bdf8',
  astral: '#fbbf24',
  celestial: '#c084fc',
};
export const ToolIcon: React.FC<{ kind: 'pickaxe'|'axe'|'sword'|'hoe'; tier: string }> = React.memo(({kind,tier}) => {
  const metal = TOOL_COLORS[tier] ?? '#dbe4ee';
  if (kind === 'sword') return <svg viewBox="0 0 16 16" className="h-5 w-5 sm:h-7 sm:w-7" shapeRendering="crispEdges" aria-hidden="true"><path d="M11 1h4v4L7 13l-3-3z" fill={metal} stroke="#263238"/><path d="m11 3 2 1-7 7-1-1z" fill="#fff3bf"/><path d="M2 11h6v2H2zM3 13h2v2H3z" fill="#713f12"/></svg>;
  if (kind === 'hoe') return <svg viewBox="0 0 16 16" className="h-5 w-5 sm:h-7 sm:w-7" shapeRendering="crispEdges" aria-hidden="true"><path d="M3 12 6 9l4 4-2 2z" fill="#513f26" stroke="#422006"/><path d="M8 7h5l2 2-7 6-2-2z" fill={metal} stroke="#263238"/><path d="M5 11l2 2" stroke="#e5d2a1" strokeWidth="1.2"/><path d="M9 3v5H7l-1 2H5l1-3V3z" fill="#9a6d3f" stroke="#422006"/></svg>;
  return <svg viewBox="0 0 16 16" className="h-5 w-5 sm:h-7 sm:w-7" shapeRendering="crispEdges" aria-hidden="true">
    <path d="M3 12 5 10l2 2-2 2zM5 10l2-2 2 2-2 2zM7 8l2-2 2 2-2 2z" fill="#854d0e" stroke="#422006"/>
    {kind === 'pickaxe' ? <><path d="M2 4 4 2h8l2 2-2 2H8L6 5H4L3 6z" fill={metal} stroke="#263238"/><path d="M5 3h5v1H5z" fill="#fff" opacity=".7"/></> : <><path d="M7 3h6v2l-2 1H9L8 8 6 7V5z" fill={metal} stroke="#263238"/><path d="M9 4h3v1H9z" fill="#fff" opacity=".7"/></>}
  </svg>;
});

export const Hotbar: React.FC<HotbarProps> = React.memo(({
  slots,
  activeSlot,
  onSelectSlot,
  onOpenInventory,
  onDragStart,
  onDragOver,
  onDrop,
  dragTarget,
  onSlotPointerDown,
  isTouchActive = false,
}) => {
  return (
    <div
      onWheel={(e) => {
        if (Math.abs(e.deltaY) < 1) return;
        e.stopPropagation();
        const dir = e.deltaY > 0 ? 1 : -1;
        onSelectSlot((activeSlot + dir + 8) % 8);
      }}
      className={`fixed ${
        isTouchActive
          ? 'max-sm:bottom-28 max-sm:portrait:bottom-28 bottom-2 sm:bottom-3 md:bottom-5'
          : 'bottom-2 sm:bottom-3 md:bottom-5'
      } left-1/2 -translate-x-1/2 max-w-[calc(100vw-0.5rem)] overflow-x-auto select-none z-50 pointer-events-auto touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden`}
    >
      <div className="flex w-max items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 bg-[#182b2b]/95 border-2 border-[#6eaa7c] rounded-2xl shadow-[0_8px_0_#10201f,0_14px_30px_#0008] backdrop-blur-md">
        {slots.slice(0, 8).map((slot, idx) => {
          const isActive = idx === activeSlot;
          const isSword = !!(slot.isWeapon || slot.toolKind === 'sword' || slot.type === 'sword' || slot.isPermanent);
          const isPermanentSlot = !!(slot.isPermanent || slot.type === 'sword' || idx === 0);
          const isEmpty = !isPermanentSlot && slot.count <= 0;
          const isTarget = dragTarget?.kind === 'hotbar' && dragTarget.index === idx;

          return (
            <button
              key={`${slot.type}-${idx}`}
              type="button"
              aria-label={`${idx + 1}: ${slot.name || 'Empty'}${slot.toolTier ? `, ${slot.toolTier} tier ${slot.toolKind}` : ''}, quantity ${isSword ? 'unlimited' : slot.count}`}
              title={slot.name ? `${slot.name}${slot.toolTier ? ` · ${slot.toolTier} tier ${slot.toolKind}` : ''} · ${isSword ? 'permanent' : `×${slot.count}`}` : `Empty slot ${idx + 1}`}
              onClick={() => onSelectSlot(idx)}
              data-slot-kind="hotbar"
              data-slot-index={idx}
              onPointerDown={(e) => {
                if (e.button === 0 && idx !== 0 && slot.type) {
                  onSlotPointerDown?.({ kind: 'hotbar', index: idx }, slot, e);
                }
              }}
              draggable={false}
              onDragStart={(e) => { if (idx === 0 || !slot.type) { e.preventDefault(); return; } e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('application/x-pixel-frontier-slot', `${idx}`); onDragStart({kind:'hotbar',index:idx}); }}
              onDragOver={(e) => { if (idx !== 0) { e.preventDefault(); e.dataTransfer.dropEffect='move'; onDragOver({kind:'hotbar',index:idx}); } }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (idx !== 0) onDrop({kind:'hotbar',index:idx}); }}
              onDragEnd={() => onDrop({kind:'hotbar',index:-1})}
              className={`relative flex flex-col items-center justify-between min-w-[34px] w-9 h-10 sm:min-w-0 sm:w-11 sm:h-11 md:w-12 md:h-12 p-0.5 sm:p-1 rounded-lg border-2 transition-all font-mono text-xs cursor-pointer touch-manipulation ${
                isTarget
                  ? 'ring-2 ring-cyan-300 bg-cyan-400/25 border-cyan-200 scale-105'
                  : isActive
                  ? 'bg-slate-800/95 border-amber-400 scale-105 shadow-xl shadow-amber-500/25 ring-2 ring-amber-400/30'
                  : isSword
                  ? 'bg-slate-900/90 border-amber-500/40 hover:border-amber-400 hover:bg-slate-850'
                  : isEmpty
                  ? 'bg-slate-950/50 border-dashed border-slate-800 hover:border-slate-750 hover:bg-slate-900/40'
                  : 'bg-slate-900/85 border-slate-700 hover:border-slate-500 hover:bg-slate-850'
              }`}
            >
              {/* Header: Slot number (1-5) & Status Indicator */}
              <div className="w-full flex items-center justify-between text-[10px] leading-none">
                <span
                  className={`font-bold font-pixel text-[9px] ${
                    isActive ? 'text-amber-300' : isSword ? 'text-amber-400/80' : 'text-slate-400'
                  } ${isTarget ? 'ring-2 ring-cyan-300 bg-cyan-400/20 border-cyan-200' : ''}`}
                >
                  {idx + 1}
                </span>

                {isSword ? (
                  <span className="text-[7.5px] font-bold px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-tighter">
                    <span className="hidden sm:inline">EQUIP</span>
                  </span>
                ) : isActive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                ) : null}
              </div>

              {/* Slot Center: Tool/Weapon Icon vs Solid Block vs Empty Slot */}
              {isEmpty ? (
                /* Empty material slot silhouette */
                <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-xs border border-dashed border-slate-700/50 bg-slate-900/30 flex items-center justify-center">
                  <span className="text-slate-650 text-[10px] select-none">+</span>
                </div>
              ) : slot.toolKind && slot.toolTier ? (
                <ToolIcon kind={slot.toolKind} tier={slot.toolTier}/>
              ) : isSword ? (
                <ToolIcon kind="sword" tier={slot.toolTier ?? 'wood'}/>
              ) : slot.type && (slot.isMeat || isMeatItem(slot.type)) ? (
                <MeatIcon type={slot.type} />
              ) : (
                /* Filled material block cube */
                <BlockIcon
                  item={slot.type}
                  fallbackColor={slot.color}
                  borderColor={slot.borderColor}
                  className="h-5 w-5 sm:h-7 sm:w-7 rounded-xs shadow-md border"
                />
              )}

              {/* Footer: Name & Count */}
              <div className="w-full flex items-center justify-between px-0.5 leading-none">
                <span
                  className={`hidden sm:inline truncate max-w-[32px] text-[9px] ${
                    isSword
                      ? 'text-amber-300 font-bold'
                      : isEmpty
                      ? 'text-slate-600'
                      : 'text-slate-300 font-medium'
                  }`}
                >
                  {slot.name}
                </span>

                <span
                  className={`text-[10px] font-bold ${
                    isSword
                      ? 'text-amber-300'
                      : isEmpty
                      ? 'text-slate-700'
                      : 'text-emerald-400'
                  }`}
                >
                  {isPermanentSlot ? '∞' : slot.count > 0 ? slot.count : '0'}
                </span>
              </div>
            </button>
          );
        })}
        <button type="button" onClick={onOpenInventory} aria-label="Open inventory" title="Inventory (I)" className="ml-0.5 sm:ml-1 min-w-[38px] w-10 h-11 sm:min-w-0 sm:w-12 sm:h-12 grid place-items-center rounded-lg border-2 border-[#e4bd68] bg-[#654f31] text-amber-100 shadow-inner hover:bg-[#80623b] hover:-translate-y-0.5 active:scale-95 transition touch-manipulation"><Backpack size={18} className="sm:w-[21px] sm:h-[21px]"/></button>
      </div>
    </div>
  );
});
