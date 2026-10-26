const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// High-DPI & Resize handling
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Constants & Settings
const GROUND_HEIGHT = 120;       // Height of the white ground from bottom
const PLAYER_SIZE = 48;          // Size of the square
const PLAYER_COLOR = '#ff4757';   // Neon coral color
const PLAYER_BORDER = 5;         // Border thickness in pixels for outer hollow square
const INNER_SQUARE_SIZE = 16;    // ~1/3 size of outer square
const INNER_BORDER = 3.5;        // Border thickness for inner hollow square

// Speed & Progression Settings
const BASE_SPEED = 550;          // Starting horizontal speed (pixels per second)
let currentSpeed = BASE_SPEED;
const SPEED_INCREMENT = 25;      // Speed increase every 15s
const ACCEL_INTERVAL = 15.0;     // Increment interval in seconds
const MAX_ACCEL_TIME = 180.0;    // 3 minutes speed cap: 12 bumps at 15 -> max speed 850
let survivalTime = 0;            // Running survival timer
let speedTier = 0;               // Number of speed steps triggered

// Background Color Palette (14 vibrant Geometry Dash aesthetic colors)
const BG_PALETTE = [
  '#4a69bd', // Classic Electric Blue
  '#6c5ce7', // Neon Purple
  '#00b894', // Emerald Mint
  '#e17055', // Terracotta Orange
  '#fdcb6e', // Amber Gold
  '#0984e3', // Deep Azure
  '#d63031', // Crimson Red
  '#1e3799', // Midnight Indigo
  '#e84393', // Hot Magenta
  '#00cec9', // Bright Cyan Teal
  '#8e44ad', // Deep Violet
  '#27ae60', // Lush Green
  '#f39c12', // Tangerine
  '#2c3e50'  // Dark Slate
];

// Color History Queue ensuring colors cannot repeat within 10 shifts
let currentBgColor = BG_PALETTE[0];
const recentColorHistory = [currentBgColor];

function pickNextBgColor() {
  // Filter out the last 10 colors used
  const availableColors = BG_PALETTE.filter(c => !recentColorHistory.includes(c));
  // Fallback in case pool is fully in history
  const candidatePool = availableColors.length > 0 ? availableColors : BG_PALETTE.filter(c => c !== currentBgColor);
  const nextColor = candidatePool[Math.floor(Math.random() * candidatePool.length)];

  recentColorHistory.push(nextColor);
  // Keep history strictly at last 10
  if (recentColorHistory.length > 10) {
    recentColorHistory.shift();
  }
  return nextColor;
}

const GRAVITY = 2500;            // Punchy Geometry Dash arcade gravity (pixels per second^2)
const JUMP_FORCE = -735;         // Jump impulse (yields ~108px / 2.25 block peak clearance)
const JUMP_AIR_TIME = (2 * Math.abs(JUMP_FORCE)) / GRAVITY;
const ROTATION_SPEED = Math.PI / JUMP_AIR_TIME; // Exactly 180° per jump

// Spike Constants
const SPIKE_WIDTH = 48;          // Geometry dash standard 1-block width
const SPIKE_HEIGHT = 48;         // Geometry dash standard 1-block height
const SPIKE_BORDER = 2;          // Thin black outline
const INITIAL_SAFE_DISTANCE = 950; // Safe runway before first obstacle

// Platform Constants
const BLOCK_SIZE = 48;           // 1 unit = 48px height and width

// Hanging Spike Cluster Settings
const HANG_CLUSTER_MIN = 1;      // Cluster size range (in spikes)
const HANG_CLUSTER_MAX = 10;
const HANG_GAP_OVER_SPIKES = 3;  // Tip 2 units above the player's head (player is 1 unit tall) when spikes are below
const HANG_GAP_FLAT = 1;         // Tip 1 unit above a clean surface: player fits underneath, no room to jump
const LOW_HANG_RUNWAY = 600;     // Flat spike-free px before/after 1-unit-gap clusters (max jump reach ~341px)

// Step-Up & Stair Settings
const STEP_UP_LEAD_BLOCKS = 4;   // Clear units on a platform before the first spike
const STAIR_STEP_BLOCKS = 5;     // Width of each descending stair step (absorbs max-speed fall drift)

// World Obstacles State
const spikes = [];
const platforms = [];
let nextGenerationX = INITIAL_SAFE_DISTANCE;
let currentTier = 0; // Current platform tier (0 = main ground)

// Spawns a contiguous cluster of hanging spikes whose downward tips sit
// `gapUnits` blocks above the given surface (chains drawn from the screen top).
function spawnHangingCluster(xStart, surfaceY, gapUnits, count) {
  const topEdgeY = surfaceY - (gapUnits + 1) * BLOCK_SIZE; // Flat top edge 1 block above the tip
  for (let i = 0; i < count; i++) {
    spikes.push({
      x: xStart + i * SPIKE_WIDTH,
      baseY: topEdgeY,
      width: SPIKE_WIDTH,
      height: SPIKE_HEIGHT,
      hanging: true,
      chainStartY: 0
    });
  }
}

// Builds spike-free descending stairs from `fromTier` down to tier 1, one tier at a
// time, so the player never falls more than 1 unit. Returns the stairs' right edge.
function buildDescentStairs(startX, fromTier, groundY) {
  let stairX = startX;
  for (let t = fromTier - 1; t >= 1; t--) {
    platforms.push({
      x: stairX,
      y: groundY - t * BLOCK_SIZE,
      width: STAIR_STEP_BLOCKS * BLOCK_SIZE,
      height: t * BLOCK_SIZE,
      tier: t
    });
    stairX += STAIR_STEP_BLOCKS * BLOCK_SIZE;
  }
  return stairX;
}

// Spawns ground spikes, tiered platforms, and platform spikes ahead of viewport
function updateWorldGeneration(cameraRightEdge) {
  const groundY = canvas.height - GROUND_HEIGHT;

  while (nextGenerationX < cameraRightEdge + 900) {
    const isPlatformEncounter = Math.random() < 0.70;

    if (!isPlatformEncounter && currentTier === 0) {
      const groundRoll = Math.random();
      if (groundRoll < 0.60) {
        // Standard Ground Spike Cluster (1-3 spikes; 4+ is un-jumpable)
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          spikes.push({
            x: nextGenerationX + i * SPIKE_WIDTH,
            baseY: groundY,
            width: SPIKE_WIDTH,
            height: SPIKE_HEIGHT
          });
        }
        let segmentWidth = count * SPIKE_WIDTH;

        // Optional hanging cluster above the spikes (tips 2 units above the player's head)
        if (Math.random() < 0.35) {
          const hangCount = HANG_CLUSTER_MIN + Math.floor(Math.random() * HANG_CLUSTER_MAX);
          spawnHangingCluster(nextGenerationX, groundY, HANG_GAP_OVER_SPIKES, hangCount);
          segmentWidth = Math.max(segmentWidth, hangCount * SPIKE_WIDTH);
        }

        // Gap must exceed the max jump reach (~500px) so landings never overshoot into the next segment
        const landingGap = 520 + Math.random() * 240;
        nextGenerationX += segmentWidth + landingGap;
      } else if (groundRoll < 0.80) {
        // Low hanging cluster over flat ground: tip 1 unit above ground, so the
        // player fits underneath but there is no space to jump. Flat, spike-free
        // runways on both sides guarantee a safe run-under approach.
        const hangCount = HANG_CLUSTER_MIN + Math.floor(Math.random() * HANG_CLUSTER_MAX);
        spawnHangingCluster(nextGenerationX + LOW_HANG_RUNWAY, groundY, HANG_GAP_FLAT, hangCount);
        nextGenerationX += LOW_HANG_RUNWAY + hangCount * SPIKE_WIDTH + LOW_HANG_RUNWAY;
      } else {
        // Flat breather segment
        nextGenerationX += 320 + Math.random() * 280;
      }
    } else {
      // Determine target tier (can go up by 1, stay same, or step down to 0)
      let targetTier = currentTier;
      if (currentTier === 0) {
        targetTier = 1;
      } else {
        const roll = Math.random();
        if (roll < 0.45) {
          targetTier = currentTier + 1; // Step up by 1 tier
        } else if (roll < 0.75) {
          targetTier = currentTier; // Continue at same tier
        } else {
          targetTier = 0; // Return to main ground
        }
      }

      if (targetTier > currentTier) {
        // Stepping UP (e.g. 0 -> 1 or 1 -> 2)
        // Optionally spawn 1-2 front spikes touching the front wall of the new platform
        const hasFrontSpikes = Math.random() < 0.50;
        let frontSpikeCount = 0;
        const currentBaseY = groundY - currentTier * BLOCK_SIZE;

        if (hasFrontSpikes) {
          frontSpikeCount = 1 + Math.floor(Math.random() * 2);
          
          // CRITICAL: If we are already on an elevated platform (currentTier > 0),
          // DO NOT leave the space under the spikes empty!
          // We create a solid platform extension directly beneath these spikes!
          if (currentTier > 0) {
            platforms.push({
              x: nextGenerationX,
              y: currentBaseY,
              width: frontSpikeCount * BLOCK_SIZE,
              height: currentTier * BLOCK_SIZE,
              tier: currentTier
            });
          }

          for (let i = 0; i < frontSpikeCount; i++) {
            spikes.push({
              x: nextGenerationX + i * SPIKE_WIDTH,
              baseY: currentBaseY,
              width: SPIKE_WIDTH,
              height: SPIKE_HEIGHT
            });
          }
        }

        const frontOffset = frontSpikeCount * SPIKE_WIDTH;
        const platformStartX = nextGenerationX + frontOffset;

        // Platform block length: minimum 5 blocks, up to 14 blocks
        const blockLength = 5 + Math.floor(Math.random() * 10);
        const platformWidth = blockLength * BLOCK_SIZE;
        const platformY = groundY - targetTier * BLOCK_SIZE;

        platforms.push({
          x: platformStartX,
          y: platformY,
          width: platformWidth,
          height: targetTier * BLOCK_SIZE, // Solid pillar to ground
          tier: targetTier
        });

        // Optionally add spikes ON TOP of the platform:
        // RULE: Always at least 4 units of clear space before the first spike!
        let spikeStartBlock = -1;
        let spikeCount = 0;
        if (blockLength >= 7 && Math.random() < 0.65) {
          const minLeadBlocks = STEP_UP_LEAD_BLOCKS; // Clear landing space after stepping up
          const availableBlocks = blockLength - minLeadBlocks - 2; // Leave at least 2 exit landing blocks
          if (availableBlocks >= 1) {
            spikeCount = 1 + Math.floor(Math.random() * Math.min(2, availableBlocks));
            spikeStartBlock = minLeadBlocks + Math.floor(Math.random() * (availableBlocks - spikeCount + 1));
            for (let s = 0; s < spikeCount; s++) {
              spikes.push({
                x: platformStartX + (spikeStartBlock + s) * BLOCK_SIZE,
                baseY: platformY,
                width: SPIKE_WIDTH,
                height: SPIKE_HEIGHT,
                hanging: false
              });
            }
          }
        }

        // Optional hanging cluster above the on-platform spikes (tips 2 units above
        // the player's head). Never placed LOW on a step-up: the landing jump from
        // below passes through the low band, so low hangers only appear where the
        // player arrives running (flat ground / continuation platforms).
        if (spikeCount > 0 && Math.random() < 0.40) {
          const overhang = Math.floor(Math.random() * 2); // May start slightly left of the spikes
          const startBlock = Math.max(STEP_UP_LEAD_BLOCKS, spikeStartBlock - overhang);
          const maxBlocks = blockLength - 2 - startBlock; // Respect the 2 exit blocks
          if (maxBlocks >= 1) {
            const hangCount = Math.max(1, Math.min(HANG_CLUSTER_MAX, spikeCount + Math.floor(Math.random() * 3), maxBlocks));
            spawnHangingCluster(platformStartX + startBlock * BLOCK_SIZE, platformY, HANG_GAP_OVER_SPIKES, hangCount);
          }
        }

        currentTier = targetTier;
        nextGenerationX = platformStartX + platformWidth;
      } else if (targetTier < currentTier) {
        // Stepping DOWN: descend stair-by-stair to tier 1 (no direct falls from 2+ height)
        const stairEndX = buildDescentStairs(nextGenerationX, currentTier, groundY);
        currentTier = 0;
        // Safe clear ground landing after jumping off the final tier-1 stair (covers a full max-speed jump)
        nextGenerationX = stairEndX + (520  + Math.random() * 200);
      } else {
        // Continuation on current tier (minimum 5 blocks)
        const blockLength = 5 + Math.floor(Math.random() * 6);
        const platformStartX = nextGenerationX;
        const platformWidth = blockLength * BLOCK_SIZE;
        const platformY = groundY - currentTier * BLOCK_SIZE;

        platforms.push({
          x: platformStartX,
          y: platformY,
          width: platformWidth,
          height: currentTier * BLOCK_SIZE,
          tier: currentTier
        });

        // Optional LOW hanging cluster over the platform runway: tip 1 unit above the
        // surface. The player arrives here running (no forced jump), making this a
        // pure "don't jump" zone. 4 clear lead-in units and 2 exit units are reserved.
        if (blockLength >= 7 && Math.random() < 0.35) {
          const maxBlocks = blockLength - STEP_UP_LEAD_BLOCKS - 2;
          if (maxBlocks >= 1) {
            const hangCount = Math.min(HANG_CLUSTER_MAX, 1 + Math.floor(Math.random() * HANG_CLUSTER_MAX), maxBlocks);
            spawnHangingCluster(platformStartX + STEP_UP_LEAD_BLOCKS * BLOCK_SIZE, platformY, HANG_GAP_FLAT, hangCount);
          }
        }

        if (currentTier >= 2) {
          // No direct falls: descend stair-by-stair to tier 1, then jump off to ground
          const stairEndX = buildDescentStairs(platformStartX + platformWidth, currentTier, groundY);
          nextGenerationX = stairEndX + (380 + Math.random() * 200);
        } else {
          nextGenerationX = platformStartX + platformWidth + (320 + Math.random() * 200);
        }
        currentTier = 0; // Return down after continuation
      }
    }
  }

  // Despawn old spikes and platforms offscreen left
  while (spikes.length > 0 && spikes[0].x < player.x - 700) {
    spikes.shift();
  }
  while (platforms.length > 0 && platforms[0].x + platforms[0].width < player.x - 700) {
    platforms.shift();
  }
}

// Game State
const player = {
  x: 100,
  y: 0,
  size: PLAYER_SIZE,
  vy: 0,
  rotation: 0,
  isGrounded: false
};

// Set initial player vertical position on ground
player.y = canvas.height - GROUND_HEIGHT - player.size;

// Landing rotation alignment: eased to the nearest 90 degrees so the snap is invisible
let rotationAlignTarget = null;

// Death & Restart State
let isDead = false;
let deathTimer = 0;
const DEATH_DURATION = 2.0; // 2 seconds total animation and auto-restart

// Particle System for Explosion -> YOU DIED -> Reassemble
const deathParticles = [];

// Sample points forming the letters "YOU DIED" in the center of the screen
function getYouDiedTargetPoints(count) {
  const offscreen = document.createElement('canvas');
  offscreen.width = 600;
  offscreen.height = 160;
  const octx = offscreen.getContext('2d');
  
  octx.font = '900 64px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  octx.fillStyle = '#ffffff';
  octx.fillText('YOU DIED', offscreen.width / 2, offscreen.height / 2);

  const imgData = octx.getImageData(0, 0, offscreen.width, offscreen.height).data;
  const points = [];
  const step = 4;
  for (let y = 0; y < offscreen.height; y += step) {
    for (let x = 0; x < offscreen.width; x += step) {
      const idx = (y * offscreen.width + x) * 4 + 3; // Alpha channel
      if (imgData[idx] > 128) {
        // Center offset relative to canvas
        points.push({
          x: canvas.width / 2 + (x - offscreen.width / 2),
          y: canvas.height / 2 + (y - offscreen.height / 2)
        });
      }
    }
  }

  // Shuffle points
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]];
  }

  // Return requested count (or loop points if count exceeds)
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(points[i % points.length]);
  }
  return result;
}

// Target points on the perimeter of the player square at the respawn point (x: 100)
function getSquareTargetPoints(count) {
  const respawnScreenX = canvas.width * 0.22; // Player's screen X position
  const groundY = canvas.height - GROUND_HEIGHT;
  const respawnScreenY = groundY - PLAYER_SIZE;

  const points = [];
  for (let i = 0; i < count; i++) {
    const side = Math.floor(Math.random() * 4);
    const pos = Math.random() * PLAYER_SIZE;
    let px = 0, py = 0;
    if (side === 0) { px = pos; py = 0; }
    else if (side === 1) { px = PLAYER_SIZE; py = pos; }
    else if (side === 2) { px = pos; py = PLAYER_SIZE; }
    else { px = 0; py = pos; }

    points.push({
      x: respawnScreenX + px,
      y: respawnScreenY + py
    });
  }
  return points;
}

function triggerDeathExplosion(playerScreenX, playerScreenY) {
  deathParticles.length = 0;
  const PARTICLE_COUNT = 135;
  const textTargets = getYouDiedTargetPoints(PARTICLE_COUNT);
  const squareTargets = getSquareTargetPoints(PARTICLE_COUNT);

  const originX = playerScreenX + PLAYER_SIZE / 2;
  const originY = playerScreenY + PLAYER_SIZE / 2;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 260;
    deathParticles.push({
      x: originX,
      y: originY,
      burstX: originX + Math.cos(angle) * speed * 0.4,
      burstY: originY + Math.sin(angle) * speed * 0.4,
      textTarget: textTargets[i],
      squareTarget: squareTargets[i],
      size: 3.5 + Math.random() * 2.5,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 10
    });
  }
}

function resetGame() {
  player.x = 100;
  player.y = canvas.height - GROUND_HEIGHT - player.size;
  player.vy = 0;
  player.rotation = 0;
  player.isGrounded = true;
  rotationAlignTarget = null;

  spikes.length = 0;
  platforms.length = 0;
  nextGenerationX = INITIAL_SAFE_DISTANCE;
  currentTier = 0;

  // Reset Progression & Colors
  survivalTime = 0;
  speedTier = 0;
  currentSpeed = BASE_SPEED;
  currentBgColor = BG_PALETTE[0];
  recentColorHistory.length = 0;
  recentColorHistory.push(currentBgColor);

  isDead = false;
  deathTimer = 0;
  isJumpHeld = false;
  deathParticles.length = 0;
}

// Input State (Hold-to-jump buffering)
let isJumpHeld = false;

// Jump Trigger
function tryJump() {
  if (isDead) return;
  if (player.isGrounded) {
    player.vy = JUMP_FORCE;
    player.isGrounded = false;
  }
}

// Input Handlers
window.addEventListener('pointerdown', (e) => {
  if (e.button === 0) {
    isJumpHeld = true;
    tryJump();
  }
});

window.addEventListener('pointerup', () => {
  isJumpHeld = false;
});

window.addEventListener('pointercancel', () => {
  isJumpHeld = false;
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) {
      isJumpHeld = true;
      tryJump();
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    isJumpHeld = false;
  }
});

window.addEventListener('blur', () => {
  isJumpHeld = false;
});

// Helper: Draw classic Geometry Dash brick-pattern parallax background
function drawBackgroundBricks(cameraOffsetX, bgColor) {
  ctx.save();
  // Solid background color
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Parallax scrolling brick pattern (slower scroll factor = 0.25)
  const bgBrickW = 96;
  const bgBrickH = 48;
  const parallaxX = -(cameraOffsetX * 0.25) % bgBrickW;

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1.5;

  let row = 0;
  for (let y = 0; y < canvas.height; y += bgBrickH) {
    const rowOffset = (row % 2 === 0) ? 0 : bgBrickW / 2;
    for (let x = parallaxX + rowOffset - bgBrickW; x < canvas.width + bgBrickW; x += bgBrickW) {
      ctx.strokeRect(x, y, bgBrickW, bgBrickH);
    }
    row++;
  }

  ctx.restore();
}

// Helper: Draw an inverted hanging spike with translucent hanging chain
function drawHangingSpike(x, topY, width, height, chainStartY = 0) {
  ctx.save();

  // 1. Translucent hanging chain from ceiling/sky down to spike base
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 4]); // Dotted/dashed link chain effect
  ctx.beginPath();
  const centerX = x + width / 2;
  ctx.moveTo(centerX, chainStartY);
  ctx.lineTo(centerX, topY);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash

  // 2. Inverted white spike with thin black border pointing downwards
  ctx.beginPath();
  ctx.moveTo(x, topY); // Top-left
  ctx.lineTo(x + width, topY); // Top-right
  ctx.lineTo(x + width / 2, topY + height); // Bottom apex pointing down
  ctx.closePath();

  // White interior
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Thin black border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = SPIKE_BORDER;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.restore();
}

// Helper: Draw an upright white spike with a thin black border
function drawSpike(x, baseY, width, height) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x + width / 2, baseY - height);
  ctx.lineTo(x + width, baseY);
  ctx.closePath();

  // White interior
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Thin black border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = SPIKE_BORDER;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

// Helper: Draw a platform with thin black border and translucent gray crisscross (+)
function drawPlatform(x, y, width, height) {
  ctx.save();
  // Solid white fill
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, width, height);

  // Translucent gray straight grid crisscross (+) inside each 48px unit block
  ctx.strokeStyle = 'rgba(120, 120, 120, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();

  const numBlocksX = Math.round(width / BLOCK_SIZE);
  const numBlocksY = Math.round(height / BLOCK_SIZE);

  for (let bx = 0; bx < numBlocksX; bx++) {
    for (let by = 0; by < numBlocksY; by++) {
      const bX = x + bx * BLOCK_SIZE;
      const bY = y + by * BLOCK_SIZE;
      const midX = bX + BLOCK_SIZE / 2;
      const midY = bY + BLOCK_SIZE / 2;

      // Vertical line through block center
      ctx.moveTo(midX, bY);
      ctx.lineTo(midX, bY + BLOCK_SIZE);

      // Horizontal line through block center
      ctx.moveTo(bX, midY);
      ctx.lineTo(bX + BLOCK_SIZE, midY);
    }
  }
  ctx.stroke();

  // Thin black outer border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  ctx.restore();
}

// Geometry Dash style forgiving spike hitbox check (Option A)
function checkSpikeCollision(playerBox, spike) {
  // Player hitbox inset (4px padding inward from the visual border)
  const playerPadding = 4;
  const pLeft = playerBox.x + playerPadding;
  const pRight = playerBox.x + playerBox.size - playerPadding;
  const pTop = playerBox.y + playerPadding;
  const pBottom = playerBox.y + playerBox.size - playerPadding;

  // Spike hitbox inset (~25% shaved off sides, top/bottom apex lowered by ~25%)
  const marginX = spike.width * 0.25;
  const spikeLeft = spike.x + marginX;
  const spikeRight = spike.x + spike.width - marginX;

  let spikeTop, spikeBottom;
  if (spike.hanging) {
    // Inverted spike hanging from baseY downwards
    spikeTop = spike.baseY;
    spikeBottom = spike.baseY + spike.height * 0.75; // Apex pointing down
  } else {
    // Upright spike
    spikeTop = spike.baseY - spike.height * 0.75;
    spikeBottom = spike.baseY;
  }

  // Axis-Aligned Bounding Box (AABB) intersection check
  const overlapsX = pRight > spikeLeft && pLeft < spikeRight;
  const overlapsY = pBottom > spikeTop && pTop < spikeBottom;

  return overlapsX && overlapsY;
}

// Main Game Loop with Delta Time
let lastTime = performance.now();

function gameLoop(currentTime) {
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1); // clamp to prevent large jumps
  lastTime = currentTime;

  // Ground Y coordinate relative to current canvas height
  const groundY = canvas.height - GROUND_HEIGHT;

  // Compute camera tracking offset upfront so it is always available
  const cameraOffsetX = player.x - canvas.width * 0.22;
  const cameraRightEdge = cameraOffsetX + canvas.width;

  // 1. Update Player & World
  if (!isDead) {
    const prevY = player.y;

    // Survival timer & 15s difficulty progression (capped at 3 minutes / 180s)
    survivalTime += dt;
    const currentExpectedTier = Math.min(Math.floor(survivalTime / ACCEL_INTERVAL), Math.floor(MAX_ACCEL_TIME / ACCEL_INTERVAL));
    if (currentExpectedTier > speedTier) {
      speedTier = currentExpectedTier;
      currentSpeed = BASE_SPEED + speedTier * SPEED_INCREMENT;
      // Instant switch to next non-repeating background color (respecting 10-color history)
      currentBgColor = pickNextBgColor();
    }

    // Constant horizontal progress with dynamic speed
    player.x += currentSpeed * dt;

    // Gravity & vertical movement
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;

    // Determine highest standing surface directly beneath player
    let supportSurfaceY = groundY;
    let hitWall = false;

    for (const plat of platforms) {
      // Check horizontal overlap with platform
      const playerRight = player.x + player.size - 4; // slight inset
      const playerLeft = player.x + 4;
      const platRight = plat.x + plat.width;
      const platLeft = plat.x;

      if (playerRight > platLeft && playerLeft < platRight) {
        // Player is horizontally within this platform's span
        // Did player land on top, or run into the side wall?
        const platTop = plat.y;
        
        // If player was previously above or at the platform top level, they can land on it
        if (prevY + player.size <= platTop + 14 && player.vy >= 0) {
          if (platTop < supportSurfaceY) {
            supportSurfaceY = platTop;
          }
        } else if (player.y + player.size > platTop + 6) {
          // Player's feet are lower than platform top -> collided with front/side wall!
          // Instant Death (Crash into wall)
          hitWall = true;
          break;
        }
      }
    }

    if (hitWall) {
      isDead = true;
      deathTimer = 0;
      const playerScreenX = player.x - cameraOffsetX;
      triggerDeathExplosion(playerScreenX, player.y);
    } else {
      // Surface landing check (Ground or Platform Top)
      if (player.y >= supportSurfaceY - player.size) {
        player.y = supportSurfaceY - player.size;

        // Ease to the nearest 90 degrees over ~0.1s instead of a visible hard snap
        if (rotationAlignTarget === null) {
          const rightAngle = Math.PI / 2;
          rotationAlignTarget = Math.round(player.rotation / rightAngle) * rightAngle;
        }
        const rotDiff = rotationAlignTarget - player.rotation;
        if (Math.abs(rotDiff) < 0.005) {
          player.rotation = rotationAlignTarget;
        } else {
          player.rotation += rotDiff * Math.min(1, dt * 35);
        }

        if (isJumpHeld) {
          // Immediate continuous jump
          player.vy = JUMP_FORCE;
          player.isGrounded = false;
        } else {
          player.vy = 0;
          player.isGrounded = true;
        }
      } else {
        player.isGrounded = false;
        rotationAlignTarget = null; // Fresh target computed on the next landing
        // Rotate clockwise while in air (Geometry Dash style)
        player.rotation += ROTATION_SPEED * dt;
      }
    }
  } else {
    // Handle death freeze and auto-restart countdown
    deathTimer += dt;
    if (deathTimer >= DEATH_DURATION) {
      resetGame();
    }
  }

  // Procedural World Generation (Platforms & Spikes)
  if (!isDead) {
    updateWorldGeneration(cameraRightEdge);
  }

  // Collision Detection with Spikes (Kill Blocks & Hanging Spikes)
  if (!isDead) {
    for (const spike of spikes) {
      if (checkSpikeCollision(player, spike)) {
        isDead = true;
        deathTimer = 0;
        const playerScreenX = player.x - cameraOffsetX;
        triggerDeathExplosion(playerScreenX, player.y);
        break;
      }
    }
  }

  // 2. Render Scene
  // Render Parallax Brick Wallpaper Background with dynamic color
  drawBackgroundBricks(cameraOffsetX, currentBgColor);

  // Render Main Terrain Ground with 3x Geometry Dash Style Gray Bricks (144px)
  // Base floor fill
  ctx.fillStyle = '#dcdde1';
  ctx.fillRect(0, groundY, canvas.width, GROUND_HEIGHT);

  // Render GD large block-like bricks grid pattern (3x = 144px)
  ctx.save();
  ctx.strokeStyle = '#b2bec3';
  ctx.lineWidth = 2.0;
  const brickSize = BLOCK_SIZE * 3; // 144px wide/high bricks
  const startGridX = -(cameraOffsetX % brickSize);

  ctx.beginPath();
  // Vertical brick lines
  for (let x = startGridX; x <= canvas.width + brickSize; x += brickSize) {
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, canvas.height);
  }
  // Horizontal brick lines
  for (let y = groundY; y <= canvas.height; y += brickSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
  }
  ctx.stroke();

  // Subtle interior square detail for each large brick (classic GD block texture)
  ctx.strokeStyle = '#ced6e0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = startGridX; x <= canvas.width + brickSize; x += brickSize) {
    for (let y = groundY; y <= canvas.height; y += brickSize) {
      ctx.strokeRect(x + 12, y + 12, brickSize - 24, brickSize - 24);
    }
  }
  ctx.restore();

  // Thin Black Border on top of main terrain
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(canvas.width, groundY);
  ctx.stroke();

  // Render Elevated Platforms
  for (const plat of platforms) {
    const platScreenX = plat.x - cameraOffsetX;
    if (platScreenX + plat.width > -50 && platScreenX < canvas.width + 50) {
      drawPlatform(platScreenX, plat.y, plat.width, plat.height);
    }
  }

  // Render Spikes (both ground/platform upright spikes and hanging spikes with chains)
  for (const spike of spikes) {
    const spikeScreenX = spike.x - cameraOffsetX;
    if (spikeScreenX + spike.width > -50 && spikeScreenX < canvas.width + 50) {
      if (spike.hanging) {
        drawHangingSpike(spikeScreenX, spike.baseY, spike.width, spike.height, spike.chainStartY || 0);
      } else {
        drawSpike(spikeScreenX, spike.baseY, spike.width, spike.height);
      }
    }
  }

  // Render Player (only when alive)
  if (!isDead) {
    const playerCenterX = (player.x - cameraOffsetX) + player.size / 2;
    const playerCenterY = player.y + player.size / 2;

    ctx.save();
    ctx.translate(playerCenterX, playerCenterY);
    ctx.rotate(player.rotation);

    ctx.strokeStyle = PLAYER_COLOR;

    // 1. Outer Hollow Square
    ctx.lineWidth = PLAYER_BORDER;
    const outerOffset = player.size / 2 - PLAYER_BORDER / 2;
    const outerDrawSize = player.size - PLAYER_BORDER;
    ctx.strokeRect(-outerOffset, -outerOffset, outerDrawSize, outerDrawSize);

    // 2. Inner Hollow Square (~1/3 size)
    ctx.lineWidth = INNER_BORDER;
    const innerOffset = INNER_SQUARE_SIZE / 2;
    ctx.strokeRect(-innerOffset, -innerOffset, INNER_SQUARE_SIZE, INNER_SQUARE_SIZE);

    ctx.restore();
  }

  // Render Death Sequence: Particle Explosion -> Morph into "YOU DIED" -> Reassemble into Start Square
  if (isDead) {
    // Semi-transparent dark overlay (fades in smoothly)
    const overlayAlpha = Math.min(deathTimer / 0.25, 1) * 0.7;
    ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Progress 0.0 to 1.0
    const progress = Math.min(deathTimer / DEATH_DURATION, 1.0);

    // Easing helper
    const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    for (const p of deathParticles) {
      let curX, curY;

      // Timeline across 2.0 seconds:
      // 0.0s - 0.45s: Phase 1 (Burst outward)
      // 0.45s - 0.95s: Phase 2 (Morph into "YOU DIED" letters)
      // 0.95s - 1.30s: Phase 3 (Hold steady in letters with intense glow)
      // 1.30s - 2.00s: Phase 4 (Stream down to starting runway and reassemble)

      if (deathTimer < 0.45) {
        // Phase 1: Burst outward from player
        const t = easeInOutCubic(deathTimer / 0.45);
        curX = p.x + (p.burstX - p.x) * t;
        curY = p.y + (p.burstY - p.y) * t;
      } else if (deathTimer < 0.95) {
        // Phase 2: Converge into "YOU DIED" letters
        const t = easeInOutCubic((deathTimer - 0.45) / 0.50);
        curX = p.burstX + (p.textTarget.x - p.burstX) * t;
        curY = p.burstY + (p.textTarget.y - p.burstY) * t;
      } else if (deathTimer < 1.30) {
        // Phase 3: Hold steady in "YOU DIED" letters with slight subtle vibration
        const subtleWobble = Math.sin(deathTimer * 14 + p.x) * 1.2;
        curX = p.textTarget.x;
        curY = p.textTarget.y + subtleWobble;
      } else {
        // Phase 4: Fly from "YOU DIED" to respawn starting square
        const t = easeInOutCubic((deathTimer - 1.30) / 0.70);
        curX = p.textTarget.x + (p.squareTarget.x - p.textTarget.x) * t;
        curY = p.textTarget.y + (p.squareTarget.y - p.textTarget.y) * t;
      }

      ctx.save();
      ctx.translate(curX, curY);
      ctx.rotate(p.rotation + p.rotSpeed * deathTimer);

      ctx.fillStyle = PLAYER_COLOR;
      ctx.shadowColor = 'rgba(255, 71, 87, 0.9)';
      ctx.shadowBlur = 8;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    // Glow highlight for YOU DIED during convergence and hold (0.80s - 1.35s)
    if (deathTimer >= 0.80 && deathTimer <= 1.35) {
      // Smooth fade-in and fade-out of the text glow
      let textAlpha = 1.0;
      if (deathTimer < 0.95) {
        textAlpha = (deathTimer - 0.80) / 0.15;
      } else if (deathTimer > 1.25) {
        textAlpha = (1.35 - deathTimer) / 0.10;
      }
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 64px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = `rgba(255, 71, 87, ${textAlpha * 0.9})`;
      ctx.shadowColor = 'rgba(255, 71, 87, 1)';
      ctx.shadowBlur = 28;
      ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2);
      ctx.restore();
    }
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);