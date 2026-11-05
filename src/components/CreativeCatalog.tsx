import React, { useState, useMemo } from 'react';
import { GameEngine } from '../game/engine';
import { BlockIcon } from './BlockIcon';
import { MeatIcon } from './MeatIcon';
import { CREATIVE_ITEMS, CREATIVE_CREATURES, CreativeItemEntry, CreativeCreatureEntry } from '../game/creativeCatalog';
import { isMeatItem, ItemType } from '../game/blocks';
import { ITEM_INFO } from '../game/inventory';
import { sound } from '../game/audio';
import { Search, Sparkles, Feather, X, Trash2, Wand2 } from 'lucide-react';

interface CreativeCatalogProps {
  engine: GameEngine | null;
  onClose?: () => void;
  onInventoryChanged: () => void;
  isFlying?: boolean;
  embedded?: boolean;
  selectedInvSlot?: number | null;
}

type CatalogCategory = 'all' | 'blocks' | 'flora' | 'ores' | 'food' | 'tools' | 'utility' | 'creatures';

export const CreativeCatalog: React.FC<CreativeCatalogProps> = ({
  engine,
  onClose,
  onInventoryChanged,
  isFlying = false,
  embedded = false,
  selectedInvSlot = null,
}) => {
  const [activeCategory, setActiveCategory] = useState<CatalogCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackNotice, setFeedbackNotice] = useState<string>('');

  const showNotice = (msg: string) => {
    setFeedbackNotice(msg);
    setTimeout(() => {
      setFeedbackNotice((curr) => (curr === msg ? '' : curr));
    }, 2000);
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (activeCategory === 'creatures') return [];

    return CREATIVE_ITEMS.filter((item) => {
      const matchCat = activeCategory === 'all' || item.category === activeCategory;
      const matchQuery = !q || item.name.toLowerCase().includes(q) || item.type.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [activeCategory, searchQuery]);

  const filteredCreatures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (activeCategory !== 'all' && activeCategory !== 'creatures') return [];

    return CREATIVE_CREATURES.filter((c) => {
      return !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    });
  }, [activeCategory, searchQuery]);

  const handleSelectItem = (entry: CreativeItemEntry) => {
    if (!engine) return;
    sound.playItemPickup();
    const count = 99;

    if (selectedInvSlot !== null && selectedInvSlot !== undefined && selectedInvSlot >= 0) {
      engine.inventory.setItem(selectedInvSlot, entry.type, count);
      onInventoryChanged();
      showNotice(`Placed ×${count} ${entry.name} in slot #${selectedInvSlot + 1}`);
      return;
    }

    const added = engine.inventory.addItem(entry.type, count);
    if (added) {
      onInventoryChanged();
      showNotice(`+${count} ${entry.name}`);
    } else {
      // If full, place in active slot directly
      const activeIdx = engine.inventory.activeSlot;
      engine.inventory.setItem(activeIdx, entry.type, count);
      onInventoryChanged();
      showNotice(`Placed ${count} ${entry.name} in active slot`);
    }
  };

  const handleSpawnCreature = (creature: CreativeCreatureEntry) => {
    if (!engine) return;
    sound.playCraft();
    if (creature.id === 'slime') {
      const ok = engine.spawnEnemyAtPlayer('slime');
      if (ok) showNotice(`Spawned Cave Slime! 🟢`);
    } else {
      const ok = engine.spawnAnimalAtPlayer(creature.id);
      if (ok) showNotice(`Spawned ${creature.name}! ${creature.icon}`);
    }
  };

  const handleToggleFlight = () => {
    if (!engine) return;
    const flying = engine.toggleFlight();
    showNotice(flying ? 'Flight Enabled 🪽' : 'Flight Disabled');
  };

  const handleFillBuildingKit = () => {
    if (!engine) return;
    const kit: ItemType[] = [
      'celestial_pickaxe',
      'diamond_axe',
      'celestial_sword',
      'wood',
      'stone',
      'planks',
      'torch',
      'chest',
    ];
    kit.forEach((type, idx) => {
      engine.inventory.setItem(idx, type, 99);
    });
    onInventoryChanged();
    showNotice('Loaded Master Builder Kit! 🛠️');
  };

  const handleClearInventory = () => {
    if (!engine) return;
    engine.inventory.clearAll();
    onInventoryChanged();
    showNotice('Cleared Inventory 🗑️');
  };

  const content = (
    <div
      className={`flex flex-col rounded-2xl border-[3px] border-[#e4bd68] bg-[#111a2e] text-slate-100 shadow-[0_10px_0_#0a101d,0_20px_60px_#000a] overflow-hidden ${
        embedded ? 'w-full max-w-[480px] max-h-[560px]' : 'h-full max-h-[92vh] w-full max-w-4xl border-2'
      }`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4bd68]/30 bg-gradient-to-r from-[#1e1338] via-[#162138] to-[#102430] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-amber-300/40 bg-amber-400/20 text-amber-300 shadow-inner">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-pixel text-xs sm:text-sm tracking-wider text-[#fff0bd]">
                CREATIVE CATALOG
              </h2>
              <span className="rounded bg-purple-500/25 px-1.5 py-0.5 text-[9px] font-mono uppercase text-purple-200 border border-purple-400/40">
                Infinite
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {selectedInvSlot !== null
                ? `Click any item to place in Slot #${selectedInvSlot + 1}`
                : 'Click any item for infinite stacks • Instant mining'}
            </p>
          </div>
        </div>

        {/* Quick Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleFlight}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-pixel text-[9px] uppercase tracking-wider transition ${
              isFlying
                ? 'border-sky-300 bg-sky-500/30 text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.5)]'
                : 'border-slate-600 bg-slate-800/80 text-slate-300 hover:border-sky-400'
            }`}
            title="Double-tap Space to fly anytime"
          >
            <Feather className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isFlying ? 'Flying (ON)' : 'Fly (OFF)'}</span>
          </button>

          <button
            type="button"
            onClick={handleFillBuildingKit}
            className="flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/20 px-2 py-1 font-pixel text-[9px] text-amber-200 hover:bg-amber-500/30"
            title="Fill hotbar with tools and building blocks"
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span>Kit</span>
          </button>

          <button
            type="button"
            onClick={handleClearInventory}
            className="flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2 py-1 font-pixel text-[9px] text-rose-200 hover:bg-rose-500/25"
            title="Clear all inventory slots"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-600 bg-slate-800 text-slate-300 hover:border-amber-400 hover:text-white"
              aria-label="Close Creative Catalog"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-2.5 border-b border-white/10 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search blocks, seeds, tools, food, creatures..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950/80 py-1.5 pl-9 pr-4 text-xs font-mono text-white placeholder-slate-500 outline-none focus:border-amber-400"
            />
          </div>

          {/* Toast / Feedback Notice */}
          {feedbackNotice && (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-950/70 px-3 py-1 text-xs font-mono text-emerald-300 animate-pulse">
              {feedbackNotice}
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-white/10 bg-black/20 p-2 scrollbar-none">
          {[
            { id: 'all', label: 'All' },
            { id: 'blocks', label: '🧱 Blocks' },
            { id: 'flora', label: '🌱 Flora & Seeds' },
            { id: 'ores', label: '💎 Ores' },
            { id: 'food', label: '🍖 Food' },
            { id: 'tools', label: '⚔️ Weapons & Tools' },
            { id: 'utility', label: '🪑 Utility & Items' },
            { id: 'creatures', label: '🐾 Spawners' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id as CatalogCategory)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-pixel text-[10px] uppercase tracking-wider transition ${
                activeCategory === tab.id
                  ? 'border border-amber-300/80 bg-gradient-to-b from-amber-400/25 to-amber-600/30 text-amber-200 shadow-sm'
                  : 'border border-slate-700/60 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Catalog Item Grid */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-5">
          {/* Creatures & Animals Section */}
          {filteredCreatures.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between border-b border-purple-400/20 pb-1">
                <span className="font-pixel text-xs uppercase tracking-wider text-purple-300">
                  🐾 Creature & Animal Spawners
                </span>
                <span className="text-[10px] text-slate-400">
                  Click to spawn in world
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {filteredCreatures.map((creature) => (
                  <button
                    key={creature.id}
                    type="button"
                    onClick={() => handleSpawnCreature(creature)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-purple-400/30 bg-purple-950/20 p-2.5 text-center transition hover:-translate-y-0.5 hover:border-purple-300 hover:bg-purple-900/30 active:translate-y-0"
                    title={creature.description}
                  >
                    <span className="text-2xl drop-shadow-md">{creature.icon}</span>
                    <span className="font-pixel text-[10px] text-purple-100">
                      {creature.name}
                    </span>
                    <span className="rounded bg-purple-500/20 px-1 py-0.5 text-[8px] font-mono text-purple-300">
                      Spawn
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Items & Blocks Section */}
          {filteredItems.length > 0 && (
            <div>
              {filteredCreatures.length > 0 && (
                <div className="mb-2 flex items-center justify-between border-b border-amber-400/20 pb-1">
                  <span className="font-pixel text-xs uppercase tracking-wider text-amber-300">
                    📦 Blocks & Items
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Click to add ×99 stack
                  </span>
                </div>
              )}
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                {filteredItems.map((item) => {
                  const info = ITEM_INFO[item.type];
                  const isMeat = isMeatItem(item.type);

                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className="group relative flex aspect-square flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 p-1.5 transition hover:-translate-y-0.5 hover:border-amber-400 hover:bg-slate-800/80 hover:shadow-[0_4px_12px_rgba(251,191,36,0.2)] active:translate-y-0"
                      title={`${item.name} (Click for 99x)`}
                    >
                      <div className="h-8 w-8 sm:h-9 sm:w-9 grid place-items-center">
                        {isMeat ? (
                          <MeatIcon type={item.type} className="h-7 w-7 sm:h-8 sm:w-8" />
                        ) : (
                          <BlockIcon
                            item={item.type}
                            className="h-7 w-7 sm:h-8 sm:w-8"
                            fallbackColor={info?.color || '#a855f7'}
                            borderColor={info?.borderColor || '#6b21a8'}
                          />
                        )}
                      </div>
                      <span className="mt-1 w-full truncate text-center font-pixel text-[8px] text-slate-300 group-hover:text-amber-200">
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredItems.length === 0 && filteredCreatures.length === 0 && (
            <div className="grid place-items-center py-16 text-center text-slate-400">
              <p className="font-pixel text-xs text-amber-200">No matching items or creatures found</p>
              <p className="mt-1 text-xs font-mono">Try searching with a different keyword or selecting 'All'</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/70 px-4 py-2.5 text-[11px] font-mono text-slate-400">
          <span>
            Creative Mode active: Infinite blocks & zero tool wear
          </span>
          <span className="hidden sm:inline">
            Flight: Double-tap Space or click 🪽 Fly
          </span>
        </div>
      </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      {content}
    </div>
  );
};
