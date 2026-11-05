import React, { useRef, useState } from 'react';
import { Flame, ArrowRight, X } from 'lucide-react';
import { ChestEndpoint, ChestSlot } from '../game/chests';
import { Inventory, ITEM_INFO } from '../game/inventory';
import { ItemType } from '../game/blocks';
import { CraftingRecipe, FURNACE_SMELT_RECIPES, isRecipeCraftable, sortRecipesByCraftable } from '../game/recipes';
import { BlockIcon } from './BlockIcon';

interface ChestPanelProps {
  chestId: string;
  containerName?: string;
  slots: ChestSlot[];
  inventory: Inventory;
  revision: number;
  pending: boolean;
  notice: string;
  onTransfer: (from: ChestEndpoint, to: ChestEndpoint, count?: number) => void;
  onSmelt?: (recipe: CraftingRecipe) => void;
  onClose: () => void;
}

function endpointFromElement(target: EventTarget | null): ChestEndpoint | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('[data-chest-kind][data-chest-index]');
  if (!element) return null;
  const kind = element.dataset.chestKind;
  const index = Number(element.dataset.chestIndex);
  if (!Number.isInteger(index)) return null;
  if (kind === 'chest' || kind === 'inventory' || kind === 'hotbar') {
    return { kind, index } as ChestEndpoint;
  }
  return null;
}

export const ChestPanel: React.FC<ChestPanelProps> = ({
  chestId, containerName = 'Chest', slots, inventory, revision: _revision, pending, notice, onTransfer, onSmelt, onClose,
}) => {
  const sourceRef = useRef<ChestEndpoint | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [selected, setSelected] = useState<ChestEndpoint | null>(null);
  const [selectedCount, setSelectedCount] = useState<number | undefined>(undefined);
  const [smeltFlashId, setSmeltFlashId] = useState<string | null>(null);
  const playerSlots = inventory.getInventorySlots();
  const hotbarSlots = inventory.getSlots();
  const isFurnace = containerName.toLowerCase() === 'furnace';

  const choose = (endpoint: ChestEndpoint) => {
    if (pending) return;
    if (!selected) {
      setSelected(endpoint);
      return;
    }
    if (selected.kind !== endpoint.kind || selected.index !== endpoint.index) {
      onTransfer(selected, endpoint, selectedCount);
      setSelected(null);
      setSelectedCount(undefined);
      sourceRef.current = null;
    } else {
      setSelected(null);
    }
  };

  const renderSlot = (endpoint: ChestEndpoint, slot: { type: string | null; count: number } | ChestSlot) => {
    const type = ('item' in slot ? slot.item : slot.type) as ItemType | null;
    const count = slot.count;
    const info = type ? ITEM_INFO[type] : null;
    const isSelected = selected?.kind === endpoint.kind && selected.index === endpoint.index;
    const empty = !type || count <= 0;
    return (
      <button
        key={`${endpoint.kind}-${endpoint.index}`}
        type="button"
        data-chest-kind={endpoint.kind}
        data-chest-index={endpoint.index}
        disabled={pending || (endpoint.kind !== 'chest' && type === 'sword')}
        aria-label={empty ? `Empty ${endpoint.kind} slot ${endpoint.index + 1}` : `${info?.name ?? type}, ${count}, ${endpoint.kind} slot ${endpoint.index + 1}`}
        title={empty ? 'Empty slot' : `${info?.name ?? type} ×${count}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || empty || (endpoint.kind !== 'chest' && type === 'sword')) return;
          sourceRef.current = endpoint;
          pointerStartRef.current = { x: event.clientX, y: event.clientY };
          draggingRef.current = false;
          setSelected(endpoint);
        }}
        onPointerUp={(event) => {
          const source = sourceRef.current;
          const target = endpointFromElement(event.target);
          if (source && target && draggingRef.current && (source.kind !== target.kind || source.index !== target.index)) {
            suppressClickRef.current = true;
            onTransfer(source, target);
            setSelected(null);
            setSelectedCount(undefined);
          }
          sourceRef.current = null;
          pointerStartRef.current = null;
          draggingRef.current = false;
        }}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (event.shiftKey && !empty) {
          setSelected(endpoint);
          setSelectedCount(Math.ceil(count / 2));
          return;
        }
        choose(endpoint);
        }}
        className={`relative grid aspect-square min-h-7 sm:min-h-8 place-items-center rounded-lg border-2 bg-[#142a29] shadow-inner transition ${
          isSelected ? 'border-cyan-200 ring-2 ring-cyan-300/70' : 'border-[#668875] hover:border-amber-200/70'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {info && <BlockIcon item={type} fallbackColor={info.color} className="h-[68%] w-[68%] rounded-md border border-white/30 shadow-inner" />}
        {type && count > 0 && <span className="absolute bottom-0 right-1 text-[9px] font-bold text-white drop-shadow">{count}</span>}
      </button>
    );
  };

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center overflow-y-auto bg-[#101a1b]/85 p-2 pb-24 backdrop-blur-sm sm:p-4"
      onPointerMove={(event) => {
        const start = pointerStartRef.current;
        if (sourceRef.current && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
          draggingRef.current = true;
        }
      }}
      onPointerUp={(event) => {
        if (event.target === event.currentTarget) {
          sourceRef.current = null;
          pointerStartRef.current = null;
          draggingRef.current = false;
          setSelected(null);
          setSelectedCount(undefined);
        }
      }}
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}
      tabIndex={-1}
    >
      <section role="dialog" aria-modal="true" aria-label={`World ${containerName.toLowerCase()}`} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-[3px] border-[#78b381] bg-[#243c38] shadow-[0_10px_0_#132522,0_20px_60px_#000a]">
        <header className="flex items-center justify-between border-b border-emerald-100/15 bg-[#1a2f2b] px-3 py-2.5 sm:px-4 sm:py-3">
          <div>
            <h2 className="flex items-center gap-2 font-pixel text-xs sm:text-sm text-amber-200">
              {isFurnace && <Flame size={16} className="text-orange-400 animate-pulse" />}
              {isFurnace ? 'FURNACE SMELTING FORGE' : containerName.toUpperCase()}
            </h2>
            <p className="font-mono text-[9px] sm:text-[10px] text-emerald-100/65">
              {isFurnace
                ? 'Melt raw Copper, Iron, and Gold Ores with Coal into Metal Bars for tool crafting'
                : `27 shared slots · ${chestId}`}
            </p>
          </div>
          <button type="button" aria-label="Close chest" title="Close chest (Esc)" onClick={onClose} className="grid h-9 w-9 sm:h-11 sm:w-11 place-items-center rounded-xl border-2 border-red-300 bg-red-600 text-white shadow-lg hover:bg-red-500 active:scale-95 transition">
            <X size={20} strokeWidth={3} className="sm:w-[25px] sm:h-[25px]" />
          </button>
        </header>
        <div className="overflow-y-auto p-2 sm:p-5">
          {isFurnace && (
            <div className="mb-3 sm:mb-4 rounded-xl border-2 border-orange-500/40 bg-gradient-to-b from-[#2b1d16] to-[#1a2926] p-2.5 sm:p-3.5 shadow-inner">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-pixel text-[9px] sm:text-[10px] text-orange-300">
                  <Flame size={13} className="text-amber-400" />
                  SMELT ORES INTO METAL BARS (REQUIRES COAL)
                </h3>
                <span className="rounded-md border border-amber-400/30 bg-black/40 px-2 py-0.5 font-mono text-[10px] text-amber-200">
                  Coal Owned: {inventory.counts.coal ?? 0}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sortRecipesByCraftable(FURNACE_SMELT_RECIPES, inventory).map((recipe) => {
                  const output = ITEM_INFO[recipe.output];
                  const canSmelt = isRecipeCraftable(recipe, inventory);
                  const ownedOutput = inventory.counts[recipe.output] ?? 0;
                  const canSmeltFive =
                    recipe.ingredients.every(({ item, amount }) => (inventory.counts[item] ?? 0) >= amount * 5) &&
                    inventory.canStoreAfterConsuming(recipe.output, recipe.ingredients);
                  const isFlashing = smeltFlashId === recipe.id;

                  return (
                    <div
                      key={recipe.id}
                      className={`flex flex-col justify-between rounded-xl border p-2.5 transition ${
                        isFlashing
                          ? 'border-amber-300 bg-orange-950/80 ring-2 ring-amber-400/60'
                          : canSmelt
                          ? 'border-orange-400/40 bg-[#1e1b18]/90'
                          : 'border-slate-700/50 bg-[#141d1c]/80 opacity-85'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {recipe.ingredients.map(({ item, amount }, idx) => {
                            const ingInfo = ITEM_INFO[item];
                            const owned = inventory.counts[item] ?? 0;
                            const enough = owned >= amount;
                            return (
                              <React.Fragment key={item}>
                                {idx > 0 && <span className="font-mono text-xs font-bold text-orange-300">+</span>}
                                <div
                                  className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 ${
                                    enough
                                      ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200'
                                      : 'border-rose-500/40 bg-rose-950/40 text-rose-300'
                                  }`}
                                  title={`${ingInfo.name}: ${owned}/${amount}`}
                                >
                                  <BlockIcon
                                    item={item}
                                    fallbackColor={ingInfo.color}
                                    borderColor={ingInfo.borderColor}
                                    className="h-4 w-4 shrink-0 rounded-xs border border-white/25"
                                  />
                                  <span className="font-mono text-[10px] font-bold">
                                    {owned}/{amount}
                                  </span>
                                </div>
                              </React.Fragment>
                            );
                          })}
                          <ArrowRight size={13} className="shrink-0 text-amber-400" />
                          <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-950/40 px-2 py-1">
                            <BlockIcon
                              item={recipe.output}
                              fallbackColor={output.color}
                              borderColor={output.borderColor}
                              className="h-5 w-5 shrink-0"
                            />
                            <div className="leading-tight">
                              <div className="text-[11px] font-bold text-amber-100">{output.name}</div>
                              <div className="font-mono text-[9px] text-amber-300/80">
                                ×{recipe.outputAmount} (Owned: {ownedOutput})
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-white/10 pt-2">
                        <span className="truncate text-[10px] text-emerald-100/70">
                          {recipe.ingredients.map((i) => `${i.amount} ${ITEM_INFO[i.item].name}`).join(' + ')}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={!canSmelt || pending || !onSmelt}
                            onClick={() => {
                              if (!onSmelt) return;
                              onSmelt(recipe);
                              setSmeltFlashId(recipe.id);
                              window.setTimeout(() => setSmeltFlashId((prev) => (prev === recipe.id ? null : prev)), 350);
                            }}
                            className="rounded-lg border border-orange-300/50 bg-gradient-to-r from-orange-600 to-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 shadow transition hover:from-orange-500 hover:to-amber-400 active:scale-95 disabled:cursor-not-allowed disabled:border-slate-700 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500"
                          >
                            🔥 Smelt ×{recipe.outputAmount}
                          </button>
                          {canSmeltFive && onSmelt && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                for (let i = 0; i < 5; i++) onSmelt(recipe);
                                setSmeltFlashId(recipe.id);
                                window.setTimeout(() => setSmeltFlashId((prev) => (prev === recipe.id ? null : prev)), 350);
                              }}
                              className="rounded-lg border border-amber-300/50 bg-amber-600/90 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-amber-500 active:scale-95"
                              title="Smelt 5 batches at once"
                            >
                              ×{recipe.outputAmount * 5}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mb-3 sm:mb-4 rounded-xl border border-emerald-100/10 bg-[#192e2b] p-2 sm:p-3">
            <h3 className="mb-1.5 sm:mb-2 font-pixel text-[9px] sm:text-[10px] text-amber-100">
              {isFurnace ? 'FURNACE STORAGE · 3 × 9' : 'CHEST STORAGE · 3 × 9'}
            </h3>
            <div className="grid grid-cols-9 gap-1 sm:gap-2">
              {Array.from({ length: 27 }, (_, index) => renderSlot({ kind: 'chest', index }, slots[index] ?? { item: null, count: 0 }))}
            </div>
          </div>
          <div className="mb-3 sm:mb-4 rounded-xl border border-emerald-100/10 bg-[#192e2b] p-2 sm:p-3">
            <h3 className="mb-1.5 sm:mb-2 font-pixel text-[9px] sm:text-[10px] text-amber-100">PLAYER INVENTORY · 7 × 7</h3>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {playerSlots.map((slot, index) => renderSlot({ kind: 'inventory', index }, slot))}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-100/10 bg-[#192e2b] p-2 sm:p-3">
            <h3 className="mb-1.5 sm:mb-2 font-pixel text-[9px] sm:text-[10px] text-amber-100">HOTBAR</h3>
            <div className="grid grid-cols-8 gap-1 sm:gap-2">
              {hotbarSlots.map((slot, index) => renderSlot({ kind: 'hotbar', index }, slot))}
            </div>
          </div>
          <div className="mt-3 flex min-h-5 items-center justify-between text-[10px] font-mono text-emerald-100/70">
            <span>{notice || (selected ? `Choose a destination slot to transfer ${selectedCount ? `×${selectedCount}` : 'items'}.` : 'Drag a slot or tap source and destination. Shift-click selects half a stack.')}</span>
            <span>{pending ? 'SYNCING…' : 'ESC TO CLOSE'}</span>
          </div>
        </div>
      </section>
    </div>
  );
};
