# Pixel Frontier

Pixel Frontier is a browser-based 2D pixel sandbox survival and exploration game built with React, TypeScript, and Canvas.

For setup instructions, architecture notes, the current development state, known limitations, and the planned next feature, see [PIXEL_FRONTIER_CONTINUE.md](./PIXEL_FRONTIER_CONTINUE.md).

Quick start: install dependencies with `bun install` (or `npm install`), then run `npm run dev`. TypeScript validation is `npm run lint`; a production bundle is `npm run build`.

## Multiplayer lobby development (Stage 1)

The lobby server handles lobby membership and identity only. It does not synchronize gameplay.

1. Install dependencies: `npm install`
2. In one terminal, start the lobby server: `npm run server` (defaults to port 3001; set `PORT` to change it).
3. In a second terminal, start the Vite client: `npm run dev` (port 3000).
4. Open `http://localhost:3000` in two browser windows, select **Multiplayer**, enter the same lobby name (for example `111`), and select **Join**. Both windows should show the same lobby, seed `111`, distinct player IDs, and player count `2`.
5. Open a third window with lobby name `222`; it should show seed `222` and a different lobby. Leave or close one of the first two windows; the remaining client should show the count decrease to `1`.

The client connects to `ws://<current-host>:3001` by default. Set `VITE_MULTIPLAYER_SERVER_URL` before starting Vite to use a different WebSocket server URL. Lobby seeds use the same `worldInputToSeed` conversion as Single Player, including direct numeric seeds and the existing named-world hash.

## Save persistence and deployments

Single Player world edits, Home locations, player position, survival stats, and inventory are stored in the browser's local storage, keyed by world seed. Those saves survive refreshes and new game builds served from the same origin in the same browser profile, but do not automatically move to another browser/device and can be lost if browser site data is cleared. Verified Firebase accounts also use the existing cloud world-save feature for the fields it supports; it is not a complete backup of all world entities or chest contents.

Multiplayer world snapshots (including block edits/removals, chests and their contents, world objects, drops, and wildlife state), player profiles, accounts, friends, and leaderboard data are stored on the server under `data/multiplayer` by default. This historical default is retained so existing files are not moved or overwritten. For deployment, set `PIXEL_FRONTIER_DATA_DIR` to a mounted persistent directory and copy the existing `data/multiplayer` contents there before switching the setting. A server restart preserves saves only when that filesystem persists; an ephemeral container or deployment that replaces its filesystem can lose server-side saves. Client-side multiplayer backup is best-effort for some block and player data and does not replace a persistent server volume, especially for chest contents. Guest identities are browser-local; use the same account identity to restore a profile on another device.
