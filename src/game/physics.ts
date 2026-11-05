import {
  ACCELERATION,
  AIR_ACCELERATION,
  AIR_FRICTION,
  BEDROCK_Y,
  COYOTE_TIME,
  FRICTION,
  GRAVITY,
  JUMP_BUFFER,
  JUMP_RELEASE_DAMPING,
  JUMP_VELOCITY,
  MOVE_SPEED,
  TERMINAL_VELOCITY,
  TILE_DEFS,
  TILE_SIZE,
} from './constants';
import { ChunkManager } from './chunkManager';
import { InputState, Player, TileType, WeatherType } from './types';

export interface CollisionEvent {
  justLanded: boolean;
  justJumped: boolean;
  footstep: boolean;
  waterSplash?: boolean;
  swimStroke?: boolean;
}

/**
 * Checks whether the player is exposed to overhead weather conditions (rain, snow)
 * or sheltered under solid blocks / deep inside a subterranean cave.
 */
export function isPlayerExposedToWeather(player: Player, chunkManager: ChunkManager): boolean {
  const pLeft = Math.floor(player.x / TILE_SIZE);
  const pRight = Math.floor((player.x + player.width - 0.01) / TILE_SIZE);
  const pTop = Math.floor(player.y / TILE_SIZE);
  const centerX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
  const surfaceY = chunkManager.terrainGen.getSurfaceHeight(centerX);

  // If the player is deep in underground caves, they are completely sheltered
  if (pTop > surfaceY + 6) {
    return false;
  }

  // Scan upward from player's head for any solid roof block up to 28 blocks high
  const checkCeilingLimit = Math.max(0, pTop - 28);
  for (let ty = pTop - 1; ty >= checkCeilingLimit; ty--) {
    for (let tx = pLeft; tx <= pRight; tx++) {
      const tile = chunkManager.getTile(tx, ty);
      if (TILE_DEFS[tile]?.isSolid) {
        return false; // Solid overhead shelter found
      }
    }
  }

  return true; // Open to the sky/weather
}

/**
 * Checks whether the player is near a lit campfire within radius (default 5 blocks) for warmth.
 */
export function isPlayerNearHeatSource(player: Player, chunkManager: ChunkManager, radius = 5): boolean {
  const pCenterTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
  const pCenterTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tile = chunkManager.getTile(pCenterTileX + dx, pCenterTileY + dy);
      if (tile === TileType.CAMPFIRE) {
        return true;
      }
    }
  }
  return false;
}

export function updatePlayerPhysics(
  player: Player,
  chunkManager: ChunkManager,
  input: InputState,
  dt: number,
  weather?: WeatherType,
  weatherIntensity?: number,
  exposed?: boolean
): CollisionEvent {
  const events: CollisionEvent = {
    justLanded: false,
    justJumped: false,
    footstep: false,
  };

  // Use the existing WATER tile field. Check overlap at the player's body center
  // so surface contact and shallow water both enter the swim movement mode.
  const overlapsWater = () => {
    const left = Math.floor((player.x + 2) / TILE_SIZE);
    const right = Math.floor((player.x + player.width - 2) / TILE_SIZE);
    const top = Math.floor((player.y + 2) / TILE_SIZE);
    const bottom = Math.floor((player.y + player.height - 2) / TILE_SIZE);
    for (let ty = top; ty <= bottom; ty++) for (let tx = left; tx <= right; tx++) {
      if (chunkManager.getTile(tx, ty) === TileType.WATER) return true;
    }
    return false;
  };
  player.isInWater = overlapsWater();
  player.isSwimming = player.isInWater;

  // Timers update
  if (player.isGrounded) {
    player.coyoteTimer = COYOTE_TIME;
  } else {
    player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);
  }

  if (input.jumpJustPressed) {
    player.jumpBufferTimer = JUMP_BUFFER;
  } else {
    player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);
  }

  // 1. Horizontal Acceleration / Friction
  const hasSpeedBuff = player.activeBuffs?.some((b) => b.id === 'swiftness');
  const hasAmphibiousBuff = player.activeBuffs?.some((b) => b.id === 'amphibious');

  let accel = player.isGrounded ? ACCELERATION : AIR_ACCELERATION;
  let fric = player.isGrounded ? FRICTION : AIR_FRICTION;
  let maxSpeed = player.isSprinting ? MOVE_SPEED * 1.45 : MOVE_SPEED;
  if (hasSpeedBuff) maxSpeed *= 1.4;

  // Weather Impact on Movement Speed when exposed to outdoor elements
  const isExposed = exposed !== undefined ? exposed : isPlayerExposedToWeather(player, chunkManager);
  const intensity = typeof weatherIntensity === 'number' ? weatherIntensity : 0;
  if (isExposed && weather && intensity > 0.08) {
    if (weather === 'rain') {
      // Slippery mud and downpour: 12% - 18% speed reduction
      // Amphibious buff adapts to rain and negates the penalty
      if (!hasAmphibiousBuff) {
        const rainSlowdown = 0.16 * Math.min(1, intensity);
        maxSpeed *= (1 - rainSlowdown);
      }
    } else if (weather === 'snow') {
      // Freezing snowdrifts: 18% - 24% speed reduction
      // Swiftness buff reduces the snow penalty
      const snowSlowdown = (hasSpeedBuff ? 0.10 : 0.22) * Math.min(1, intensity);
      maxSpeed *= (1 - snowSlowdown);
      fric = Math.max(320, fric * 0.85); // Slick winter footing
    }
  }

  if (input.analogX !== undefined && Math.abs(input.analogX) > 0.05) {
    const targetVx = input.analogX * maxSpeed;
    if (targetVx > player.vx) {
      player.vx = Math.min(targetVx, player.vx + accel * (player.isSprinting ? 1.3 : 1) * dt);
    } else {
      player.vx = Math.max(targetVx, player.vx - accel * (player.isSprinting ? 1.3 : 1) * dt);
    }
    if (Math.abs(input.analogX) > 0.08) {
      player.facingRight = input.analogX > 0;
    }
  } else if (input.left && !input.right) {
    player.vx = Math.max(-maxSpeed, player.vx - accel * (player.isSprinting ? 1.3 : 1) * dt);
    player.facingRight = false;
  } else if (input.right && !input.left) {
    player.vx = Math.min(maxSpeed, player.vx + accel * (player.isSprinting ? 1.3 : 1) * dt);
    player.facingRight = true;
  } else {
    // Decelerate towards 0
    if (player.vx > 0) {
      player.vx = Math.max(0, player.vx - fric * dt);
    } else if (player.vx < 0) {
      player.vx = Math.min(0, player.vx + fric * dt);
    }
  }

  // 2. Jump Handling & Vertical Physics
  const ladderLeft = Math.floor(player.x / TILE_SIZE);
  const ladderRight = Math.floor((player.x + player.width - 1) / TILE_SIZE);
  const ladderTop = Math.floor(player.y / TILE_SIZE);
  const ladderBottom = Math.floor((player.y + player.height - 1) / TILE_SIZE);
  let onClimbable = false;
  for (let ty = ladderTop; ty <= ladderBottom && !onClimbable; ty++) for (let tx = ladderLeft; tx <= ladderRight; tx++) {
    const tile = chunkManager.getTile(tx, ty);
    if (tile === TileType.LADDER || tile === TileType.ROPE || tile === TileType.SKY_VINE || tile === TileType.VINE) { onClimbable = true; break; }
  }

  if (player.isInWater && !player.isFlying) {
    // Buoyancy cancels most gravity while damping vertical momentum. Keyboard
    // and touch analog controls share this path.
    const swimY = input.analogY !== undefined && Math.abs(input.analogY) > 0.2
      ? input.analogY : (input.up || input.jump ? -1 : input.down ? 1 : 0);
    const targetVy = swimY * 150;
    player.vy += (targetVy - player.vy) * Math.min(1, 5 * dt);
    if (swimY === 0) player.vy += (180 - player.vy) * Math.min(1, 1.8 * dt);
    player.vy = Math.max(-190, Math.min(190, player.vy));
    player.isGrounded = false;
    player.coyoteTimer = 0;
    if (input.jumpJustPressed || input.up) events.justJumped = true;
  } else if (onClimbable && (input.analogY !== undefined && Math.abs(input.analogY) > 0.2)) {
    player.vy = input.analogY * MOVE_SPEED * 0.72;
    player.isGrounded = false;
    player.coyoteTimer = 0;
  } else if (onClimbable && (input.up || input.down)) {
    player.vy = (input.down ? 1 : -1) * MOVE_SPEED * 0.72;
    player.isGrounded = false;
    player.coyoteTimer = 0;
  } else if (onClimbable) {
    player.vy = 0;
    player.isGrounded = false;
  } else if (player.isFlying) {
    // Creative Flight mode: Omnidirectional floating without gravity
    const FLY_V_SPEED = 320;
    if (input.jump || input.up) {
      player.vy = -FLY_V_SPEED;
    } else if (input.down) {
      player.vy = FLY_V_SPEED;
    } else {
      player.vy *= Math.max(0, 1 - 12 * dt);
      if (Math.abs(player.vy) < 8) player.vy = 0;
    }
  } else {
    // Normal ground / air jump & gravity
    const canJump = player.coyoteTimer > 0;
    const wantsToJump = player.jumpBufferTimer > 0;

    if (canJump && wantsToJump) {
      player.vy = hasSpeedBuff ? JUMP_VELOCITY * 1.18 : JUMP_VELOCITY;
      player.isGrounded = false;
      player.coyoteTimer = 0;
      player.jumpBufferTimer = 0;
      events.justJumped = true;
    }

    // Variable Jump Height (cutting jump short if Space released while rising)
    if (!input.jump && player.vy < -100) {
      player.vy *= JUMP_RELEASE_DAMPING;
    }

    player.vy = Math.min(TERMINAL_VELOCITY, player.vy + GRAVITY * dt);
  }

  // 4. Horizontal Movement & Collision Resolution (Infinite X)
  player.x += player.vx * dt;

  // Check horizontal collision with solid tiles
  const leftTile = Math.floor(player.x / TILE_SIZE);
  const rightTile = Math.floor((player.x + player.width - 0.01) / TILE_SIZE);
  const topTile = Math.floor(player.y / TILE_SIZE);
  const bottomTile = Math.floor((player.y + player.height - 0.01) / TILE_SIZE);

  const isHorizontalSolid = (tx: number, ty: number): boolean => {
    const tile = chunkManager.getTile(tx, ty);
    const belowTile = chunkManager.getTile(tx, ty + 1);
    if (belowTile === TileType.DOOR_OPEN || belowTile === TileType.GATE_OPEN) {
      return false;
    }
    if (tile === TileType.AIR && (belowTile === TileType.DOOR || belowTile === TileType.GATE)) {
      return true;
    }
    return Boolean(TILE_DEFS[tile]?.isSolid);
  };

  if (player.vx > 0) {
    // Moving right: test right edge
    for (let ty = topTile; ty <= bottomTile; ty++) {
      if (isHorizontalSolid(rightTile, ty)) {
        player.x = rightTile * TILE_SIZE - player.width;
        player.vx = 0;
        break;
      }
    }
  } else if (player.vx < 0) {
    // Moving left: test left edge
    for (let ty = topTile; ty <= bottomTile; ty++) {
      if (isHorizontalSolid(leftTile, ty)) {
        player.x = (leftTile + 1) * TILE_SIZE;
        player.vx = 0;
        break;
      }
    }
  }

  // Account for horizontal crossings before selecting vertical movement mode.
  player.isInWater = overlapsWater();
  player.isSwimming = player.isInWater;

  // 5. Vertical Movement & Collision Resolution
  const previousBottom = player.y + player.height;
  player.y += player.vy * dt;
  // Refresh after movement, so exiting water restores ordinary gravity on this frame.
  player.isInWater = overlapsWater();
  player.isSwimming = player.isInWater;

  // Recalculate tile bounds after vertical movement
  const vLeftTile = Math.floor(player.x / TILE_SIZE);
  const vRightTile = Math.floor((player.x + player.width - 0.01) / TILE_SIZE);
  const vTopTile = Math.floor(player.y / TILE_SIZE);
  const vBottomTile = Math.floor((player.y + player.height - 0.01) / TILE_SIZE);

  player.wasGrounded = player.isGrounded;
  player.isGrounded = false;

  if (player.vy >= 0) {
    // Moving down (falling or on ground)
    for (let tx = vLeftTile; tx <= vRightTile; tx++) {
      const tile = chunkManager.getTile(tx, vBottomTile);
      const platformLanding = tile === TileType.PLATFORM && previousBottom <= vBottomTile * TILE_SIZE && player.y + player.height >= vBottomTile * TILE_SIZE;
      const pressurePlateLanding = (tile === TileType.PRESSURE_PLATE || tile === TileType.PRESSURE_PLATE_PRESSED) &&
        previousBottom <= vBottomTile * TILE_SIZE && player.y + player.height >= vBottomTile * TILE_SIZE;
      if (TILE_DEFS[tile]?.isSolid || platformLanding || pressurePlateLanding) {
        player.y = vBottomTile * TILE_SIZE - player.height;
        if (!player.wasGrounded && player.vy > 100) {
          events.justLanded = true;
        }
        player.vy = 0;
        player.isGrounded = true;
        break;
      }
    }
  } else if (player.vy < 0) {
    // Moving up (jumping)
    for (let tx = vLeftTile; tx <= vRightTile; tx++) {
      const tile = chunkManager.getTile(tx, vTopTile);
      if (tile !== TileType.PLATFORM && TILE_DEFS[tile]?.isSolid) {
        player.y = (vTopTile + 1) * TILE_SIZE;
        player.vy = 0;
        break;
      }
    }
  }

  // Bedrock floor safeguard
  const bedrockPixelY = BEDROCK_Y * TILE_SIZE;
  if (player.y > bedrockPixelY) {
    const pBlockX = Math.floor(player.x / TILE_SIZE);
    const surfaceY = chunkManager.terrainGen.getSurfaceHeight(pBlockX);
    player.y = (surfaceY - 2) * TILE_SIZE;
    player.vy = 0;
    player.isGrounded = true;
  }

  // 6. Animation State & Footsteps
  if (player.isFlying) {
    player.state = Math.abs(player.vx) > 10 || Math.abs(player.vy) > 10 ? 'walk' : 'idle';
    player.animTimer += dt * 4;
    player.animFrame = Math.floor(player.animTimer) % 4;
  } else if (!player.isGrounded) {
    player.state = player.vy < 0 ? 'jump' : 'fall';
  } else if (Math.abs(player.vx) > 10) {
    player.state = 'walk';
    player.animTimer += dt * (Math.abs(player.vx) / 30);
    const prevFrame = player.animFrame;
    player.animFrame = Math.floor(player.animTimer) % 4;
    // Trigger footstep on specific frame transitions
    if (prevFrame !== player.animFrame && (player.animFrame === 1 || player.animFrame === 3)) {
      events.footstep = true;
    }
  } else {
    player.state = 'idle';
    player.animTimer += dt * 3;
    player.animFrame = Math.floor(player.animTimer) % 2;
  }

  return events;
}
