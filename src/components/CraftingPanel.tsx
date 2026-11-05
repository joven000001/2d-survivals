import React, { useMemo, useState } from 'react';
import { Backpack, Hammer, Sparkles, X } from 'lucide-react';
import { Inventory, ITEM_INFO } from '../game/inventory';
import { CraftingRecipe, getVisibleRecipes, isRecipeCraftable, sortRecipesByCraftable, RecipeCategory } from '../game/recipes';
import { AXE_SPEED, PICKAXE_SPEED, SWORD_DAMAGE_BY_TIER } from '../game/toolMining';
import { ToolIcon } from './Hotbar';
import { BlockIcon } from './BlockIcon';

interface CraftingPanelProps {
  inventory: Inventory;
  revision: number;
  onCraft: (recipe: CraftingRecipe) => void;
  onClose?: () => void;
  embedded?: boolean;
  station?: 'inventory' | 'crafting_bench';
}

const CraftingPanelView: React.FC<CraftingPanelProps> = ({
  inventory,
  revision: _revision,
  onCraft,
  onClose,
  embedded = false,
  station = 'crafting_bench',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Dynamically visible recipes based on materials the player currently owns, sorted with craftable first
  const visibleRecipes = useMemo(() => {
    return getVisibleRecipes(station, inventory);
    // _revision is included as dependency to react when quantities change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, _revision, station]);

  const craftableCount = useMemo(() => {
    return visibleRecipes.filter((r) => isRecipeCraftable(r, inventory)).length;
  }, [visibleRecipes, inventory, _revision]);

  // Categories currently present in the visible list
  const availableCategories = useMemo(() => {
    const cats = new Set<RecipeCategory>();
    for (const r of visibleRecipes) cats.add(r.category);
    return Array.from(cats);
  }, [visibleRecipes]);

  const filteredRecipes = useMemo(() => {
    const list = selectedCategory === 'ALL'
      ? visibleRecipes
      : selectedCategory === 'READY'
      ? visibleRecipes.filter((r) => isRecipeCraftable(r, inventory))
      : visibleRecipes.filter((r) => r.category === selectedCategory);
    return sortRecipesByCraftable(list, inventory);
  }, [visibleRecipes, selectedCategory, inventory, _revision]);

  const content = (
    <section
      role="dialog"
      aria-modal={!embedded}
      aria-label={station === 'crafting_bench' ? 'Crafting Bench' : 'Crafting'}
      className={`flex flex-col overflow-hidden rounded-2xl border-[3px] border-[#78b381] bg-[#243c38] shadow-[0_10px_0_#132522,0_20px_60px_#000a] ${
        embedded ? 'w-full max-w-[460px] max-h-[520px]' : 'w-full max-w-3xl max-h-[92vh]'
      }`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-emerald-100/15 px-4 py-3 sm:px-5 bg-[#1a2f2b]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-300/40 bg-amber-950/60 text-amber-300 shadow-inner">
            <Hammer size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-pixel text-xs sm:text-sm text-amber-200">
                {station === 'crafting_bench' ? 'CRAFTING BENCH' : 'CRAFTING'}
              </h2>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[9px] text-emerald-300 border border-emerald-400/30">
                {craftableCount} ready · {visibleRecipes.length} total
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-emerald-100/70 truncate">
              {craftableCount > 0
                ? `${craftableCount} item${craftableCount === 1 ? '' : 's'} craftable now (shown first).`
                : station === 'crafting_bench'
                ? 'Advanced material crafting & tool progression.'
                : 'Wood & basic survival recipes.'}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close crafting"
            className="rounded-lg bg-black/20 p-1.5 text-slate-100 hover:bg-black/40 transition"
          >
            <X size={18} />
          </button>
        )}
      </header>

        {/* Dynamic Category Tabs */}
        {(availableCategories.length > 1 || craftableCount > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-emerald-100/10 bg-[#162724] px-4 py-2 sm:px-6">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                selectedCategory === 'ALL'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'bg-black/30 text-emerald-100/70 hover:bg-black/50 hover:text-white'
              }`}
            >
              All ({visibleRecipes.length})
            </button>
            {craftableCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedCategory('READY')}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition flex items-center gap-1 ${
                  selectedCategory === 'READY'
                    ? 'bg-emerald-400 text-slate-950 shadow-sm font-black'
                    : 'bg-emerald-950/70 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-900/60'
                }`}
              >
                <span>✨ Ready ({craftableCount})</span>
              </button>
            )}
            {availableCategories.map((cat) => {
              const count = visibleRecipes.filter((r) => r.category === cat).length;
              const readyInCat = visibleRecipes.filter((r) => r.category === cat && isRecipeCraftable(r, inventory)).length;
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold transition flex items-center gap-1 ${
                    isActive
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'bg-black/30 text-emerald-100/70 hover:bg-black/50 hover:text-white'
                  }`}
                >
                  <span>{cat}</span>
                  <span>({count})</span>
                  {readyInCat > 0 && !isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block ml-0.5 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Recipes Grid */}
        <div className="grid grid-cols-1 gap-2.5 overflow-y-auto p-3 sm:grid-cols-2 sm:gap-3 sm:p-5">
          {filteredRecipes.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-center text-emerald-100/70">
              <Sparkles size={36} className="mb-3 text-amber-300/50" />
              <p className="font-pixel text-xs text-amber-200">
                {selectedCategory === 'READY' ? 'NO RECIPES READY YET' : 'NO ADVANCED RECIPES DISCOVERED YET'}
              </p>
              <p className="mt-1 max-w-md text-xs text-emerald-100/60">
                {selectedCategory === 'READY'
                  ? 'Gather ingredients like Wood or Stone to enable instant crafting.'
                  : 'Mine materials like Stone, Copper, Iron, Gold, or Diamond to unlock advanced survival gear and tools.'}
              </p>
            </div>
          ) : (
            filteredRecipes.map((recipe, index) => {
              const output = ITEM_INFO[recipe.output];
              const canCraft = isRecipeCraftable(recipe, inventory);
              const missingIngredients = recipe.ingredients.some(
                ({ item, amount }) => (inventory.counts[item] ?? 0) < amount
              );
              const hasRoom = inventory.canStoreAfterConsuming(recipe.output, recipe.ingredients);
              const isFirstUncraftable = !canCraft && (index === 0 || isRecipeCraftable(filteredRecipes[index - 1], inventory));

              return (
                <React.Fragment key={recipe.id}>
                  {index === 0 && canCraft && (
                    <div className="col-span-full flex items-center justify-between pb-1 text-emerald-300 font-pixel text-[10px] uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={13} className="text-amber-300 animate-pulse" />
                        <span>Ready To Craft ({craftableCount})</span>
                      </span>
                      <span className="rounded bg-emerald-500/25 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-300 border border-emerald-400/40">
                        Craftable First
                      </span>
                    </div>
                  )}
                  {isFirstUncraftable && (
                    <div className="col-span-full flex items-center justify-between pt-3 pb-1 border-t border-emerald-900/60 text-slate-400 font-pixel text-[10px] uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <span>Missing Materials</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">
                        {index > 0 ? 'Shown at bottom' : 'Gather items to craft'}
                      </span>
                    </div>
                  )}
                  <article
                    className={`flex min-w-0 flex-col rounded-xl border p-3.5 shadow-inner transition ${
                      canCraft
                        ? 'border-emerald-400/50 bg-[#162e2c]/95 ring-1 ring-emerald-400/20 shadow-[0_4px_12px_rgba(16,185,129,0.15)]'
                        : 'border-emerald-900/30 bg-[#122322]/80 opacity-80'
                    }`}
                  >
                    <div className="mb-2.5 flex items-center gap-3">
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 shadow-inner"
                        style={{ backgroundColor: output.color, borderColor: output.borderColor }}
                        aria-hidden="true"
                      >
                        {output.toolKind && output.toolTier ? (
                          <ToolIcon kind={output.toolKind} tier={output.toolTier} />
                        ) : (
                          <BlockIcon item={recipe.output} fallbackColor={output.color} borderColor={output.borderColor} className="h-7 w-7 rounded-sm border border-white/30" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold text-slate-100 flex items-center gap-1.5">
                          <span>{output.name}</span>
                          {canCraft && (
                            <span className="rounded bg-emerald-500/25 px-1 py-0.2 font-mono text-[8px] font-bold text-emerald-300 border border-emerald-400/30">
                              READY
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-emerald-200/70 font-semibold">
                          {recipe.category}
                          {output.toolTier ? ` · ${output.toolTier} tier ${output.toolKind}` : ''}
                          {output.toolKind === 'sword' && output.toolTier ? ` · ⚔️ ${SWORD_DAMAGE_BY_TIER[output.toolTier]} DMG` : ''}
                          {output.toolKind === 'pickaxe' && output.toolTier ? ` · ⛏️ ${PICKAXE_SPEED[output.toolTier]}× Stone Speed` : ''}
                          {output.toolKind === 'axe' && output.toolTier ? ` · 🪓 ${AXE_SPEED[output.toolTier]}× Tree Speed` : ''}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md bg-slate-950/60 px-2 py-1 font-mono text-xs font-bold text-amber-200">
                        ×{recipe.outputAmount}
                      </span>
                    </div>

                    {/* Dynamic Ingredients breakdown with exact owned / required quantities */}
                    <div className="mb-3 space-y-1 rounded-lg bg-black/25 p-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Materials</div>
                      {recipe.ingredients.map(({ item, amount }) => {
                        const info = ITEM_INFO[item];
                        const owned = inventory.counts[item] ?? 0;
                        const enough = owned >= amount;
                        const isMetalBar =
                          item === 'copper_bar' ||
                          item === 'iron_bar' ||
                          item === 'gold_bar' ||
                          item === 'astral_ingot' ||
                          item === 'celestial_ingot';
                        return (
                          <div key={item} className="space-y-0.5">
                            <div
                              className={`flex items-center justify-between gap-2 text-xs ${
                                enough ? 'text-emerald-200' : 'text-rose-300 font-medium'
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <BlockIcon item={item} fallbackColor={info.color} borderColor={info.borderColor} className="h-4 w-4 shrink-0 rounded-sm border border-white/20 shadow-sm" />
                                <span className="truncate">{info.name}</span>
                              </span>
                              <span className="shrink-0 font-mono text-[11px]">
                                {owned}/{amount}
                              </span>
                            </div>
                            {isMetalBar && !enough && (
                              <div className="pl-6 text-[10px] text-orange-300/90">
                                🔥 Melt {item.replace('_bar', '').replace('_ingot', '')} ore + Coal in a Furnace
                              </div>
                            )}
                            {item === 'diamond' && !enough && (
                              <div className="pl-6 text-[10px] text-cyan-300/90">
                                💎 Mined from Diamond Ore (no smelting needed)
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-1 border-t border-emerald-900/30">
                      <span
                        className={`min-w-0 text-[11px] font-medium ${
                          missingIngredients
                            ? 'text-rose-300'
                            : !hasRoom
                            ? 'text-amber-300'
                            : 'text-emerald-300'
                        }`}
                      >
                        {missingIngredients ? 'Missing materials' : !hasRoom ? 'Inventory full' : 'Ready to craft'}
                      </span>
                      <button
                        type="button"
                        disabled={!canCraft}
                        onClick={() => onCraft(recipe)}
                        className={`shrink-0 rounded-lg border px-3.5 py-1.5 text-xs font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500 ${
                          canCraft
                            ? 'border-amber-200/50 bg-amber-400 text-slate-950 hover:bg-amber-300 shadow-md'
                            : ''
                        }`}
                      >
                        Craft ×{recipe.outputAmount}
                      </button>
                    </div>
                  </article>
                </React.Fragment>
              );
            })
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-emerald-100/15 bg-[#1a2f2b] px-4 py-2.5 text-[10px] text-emerald-100/70 sm:px-6">
          <span className="flex items-center gap-1.5">
            <Backpack size={13} /> Output is placed into your inventory.
          </span>
          <span>{station === 'crafting_bench' ? 'CRAFTING TABLE' : 'BASIC CRAFTING'}</span>
        </footer>
      </section>
  );

  if (embedded) {
    return content;
  }

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-[#101a1b]/85 p-2 sm:p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onClose) onClose();
      }}
    >
      {content}
    </div>
  );
};

export const CraftingPanel = React.memo(CraftingPanelView);
