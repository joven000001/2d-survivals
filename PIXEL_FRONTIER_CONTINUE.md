# Pixel Frontier: Continuation Guide

## What Pixel Frontier Is

Pixel Frontier is a browser-based 2D pixel sandbox survival and exploration game. It uses React and TypeScript for the application and interface, and a Canvas renderer for the real-time game world. Terrain and biomes are generated from a world seed.

## Install and Run

Prerequisites: Node.js and either npm or Bun.

```sh
# Bun uses the included bun.lock
bun install

# Or install with npm (npm may create its own package-lock.json)
npm install

npm run dev
```

Vite serves the development build on port 3000 and binds to `0.0.0.0`. Use `npm run lint` for TypeScript checking and `npm run build` for a production bundle in `dist/`. Use `npm run preview` to preview that bundle.

The game does not need a Gemini API key to run in its current state. `.env.example` contains placeholder names only; configure actual credentials through a secrets manager if a future integration needs them. Never add real secrets to source control or the portable archive.

## Project Structure

```text
src/
  App.tsx                  React application, HUD, menus, inventory and crafting UI
  main.tsx                 React entry point
  index.css                Application styling
  components/              Hotbar, crafting panel, touch controls, minimap
  game/                    Engine, generation, simulation, inventory and rendering
index.html                 Vite HTML entry and page metadata
metadata.json              Project metadata
package.json               Dependencies and commands
bun.lock                   Locked dependency graph for Bun
tsconfig.json              TypeScript configuration
vite.config.ts             Vite, React and Tailwind configuration
.env.example               Placeholder environment variable names
.gitignore                 Generated files and secret environment files to ignore
```

## Important Game Files

- `src/game/engine.ts` coordinates input, simulation, world state, updates, autosave, and rendering.
- `src/game/chunkManager.ts` streams, queues, stages, caches, and unloads chunks.
- `src/game/terrainGen.ts` generates seeded terrain and underground features.
- `src/game/biomes.ts` defines biome metadata, categories, and rarity.
- `src/game/blocks.ts` defines block and item identities and block behavior.
- `src/game/constants.ts` contains tile/chunk dimensions and performance limits.
- `src/game/renderer.ts` draws chunks, the player, tools, creatures, drops, effects, and lighting on Canvas.
- `src/game/physics.ts` and `src/game/blockInteraction.ts` handle movement, collision, mining, and placement.
- `src/game/inventory.ts` owns item counts, the 49 inventory slots, the eight hotbar slots, permanent sword rules, and slot moves/swaps.
- `src/game/recipes.ts` is the data-driven crafting recipe list; `src/components/CraftingPanel.tsx` renders it.
- `src/game/toolMining.ts` defines pickaxe requirements, mining speed tiers, and axe behavior.
- `src/game/wildlife.ts` handles deterministic species placement and lightweight wildlife behavior.
- `src/game/worldModifications.ts` stores player block edits, the current seed, and Home locations in browser local storage.
- `src/game/profiler.ts` collects runtime performance information for the HUD/debug panel.

## Current Development State

The current game includes:

- 48 biomes, including large and rare biome regions
- Large, rare oceans; seeded rivers and waterfalls
- Winding caves, cave entrances, underground lakes, and depth-based ore veins
- Peaceful biome-specific wildlife
- Crafting recipes and crafted tools
- Tool-based mining progression and axe wood harvesting
- Inventory drag-and-drop and visible tool sprites/swing animations
- A permanent sword and an eight-slot hotbar
- Home and biome teleporting
- Fullscreen and camera zoom
- Saved world seed, saved player block edits, and Home location
- Chunk streaming, staged generation, and performance profiling/optimizations

The implemented wildlife species are Deer, Rabbit, Boar, Fox, Bird, and Fish. Wildlife is peaceful; hunting, meat drops, breeding, and taming are not implemented.

## Architecture and Performance

`src/main.tsx` mounts the React application in `src/App.tsx`. The app creates a `GameEngine`, which owns the player, camera, inventory, chunk manager, interactions, wildlife, enemies, item drops, and Canvas renderer. React handles menus and HUD state; the Canvas game loop handles world drawing and simulation.

World chunks are 32 by 32 tiles. The chunk manager keeps nearby chunks loaded, unloads distant chunks, and advances queued chunk generation in stages. The normal per-frame chunk-generation time budget is 2.5 ms (`CHUNK_GEN_TIME_BUDGET_MS` in `src/game/constants.ts`); the queue yields between bounded generation steps. Terrain and wildlife placement are seeded/cacheable, and heavy generation is not recomputed for every rendered frame. The game includes frame, render, physics, chunk-management, and chunk-generation measurements.

## World and Save System

The world seed determines terrain, biome placement, and seeded world features. The current seed is stored in browser local storage under `pixel_frontier_current_seed`. Player block edits are stored under `pixel_frontier_mods_<seed>` and applied over generated chunk data, so edits take precedence. Player position, survival stats, and inventory are saved per seed under `pixel_frontier_player_state_<seed>`. Home is stored per seed under `pixel_frontier_home_<seed>`. These browser saves are scoped to the same browser profile and site origin.

Multiplayer worlds and player profiles are saved by the server under `data/multiplayer` by default. Set `PIXEL_FRONTIER_DATA_DIR` to a persistent mounted directory before starting the server when deploying, and copy the existing save directory contents there before changing paths. A restart or redeployment preserves multiplayer data only if the configured storage filesystem persists. The client-side multiplayer backup is best-effort and does not contain every world field (notably chest contents), so it is not a substitute for persistent server storage.

These saves belong to the browser profile and origin. They are not included in this source archive. Back up browser data separately if you need to move a particular world; the project ZIP contains code, not the user's world save.

## Inventory and Hotbar

The inventory has exactly 49 slots (7×7), and the hotbar has exactly eight slots. Item counts are tracked separately from slot placement. Dragging moves an item; dropping onto an occupied slot swaps the two item identities. The permanent sword remains locked to hotbar slot 1. Number keys 1–8 select hotbar slots, and mouse-wheel hotbar cycling remains available. The current inventory model stores each item type in a single slot and tracks its quantity as a count.

## Crafting System

Recipes are data-driven in `src/game/recipes.ts`. The crafting panel shows ingredient requirements and current quantities, blocks crafting when materials are insufficient, and checks output capacity before consuming ingredients. Starter recipes cover planks, crafting tables, wooden and stone tools, copper/iron/gold pickaxes and axes, torches, and furnaces. The permanent sword is separate from crafted tools.

## Tool-Mining System

Pickaxe tiers progress from Wood through Gold, with tier-based speed multipliers and ore mining requirements defined in `src/game/toolMining.ts`. Axes speed up wood harvesting. The selected hotbar item determines tool behavior; sword attacks retain the permanent sword's combat behavior. Tool durability and Diamond tools are not implemented. Tools are drawn as small pixel silhouettes in the hotbar/inventory and in the player's hand, with lightweight swings while mining or attacking.

## Wildlife System

Wildlife spawns deterministically from world/chunk coordinates and preferred biomes. The current species are Deer, Rabbit, Boar, Fox, Bird, and Fish. Creatures have lightweight idle/wander behavior, population caps, and chunk-aware active/dormant handling; fish stay associated with aquatic environments. They do not attack the player, and there are no hunting or animal drops yet.

## Known Limitations

- Browser saves do not automatically move to another browser/device or survive cleared site data. Verified Firebase accounts use the existing cloud save for supported world fields, but it does not include every multiplayer field or chest contents.
- World saves do not travel with this project archive. The archive is a code/configuration backup, not a save migration.
- Wildlife behavior is intentionally simple. Hunting and meat drops are now implemented.
- Water is rendered as static terrain features; there is no general fluid simulation.
- There is no tool durability, Diamond Pickaxe, animal breeding, or complex creature AI.
- `.env.example` holds names/placeholders only. Credentials must be configured separately if future code requires them.

## Implemented Feature

**ANIMAL HUNTING AND MEAT DROPS** has been implemented. Peaceful animals take damage from the player's sword, produce floating damage indicators and hurt feedback, drop their respective collectible meat item upon death (Venison, Rabbit Meat, Boar Meat, Fox Meat, Bird Meat, Fish), respect chunk reload death persistence, and feature custom pixel-art icons across the hotbar, 49-slot inventory, and physical world drops.
