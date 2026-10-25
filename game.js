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
const SPEED = 400;               // Horizontal speed (pixels per second)
const GRAVITY = 2500;            // Punchy Geometry Dash arcade gravity (pixels per second^2)
const JUMP_FORCE = -735;         // Jump impulse (yields ~108px / 2.25 block peak clearance)
// Air-time = 2 * (735 / 2500) ≈ 0.588s. 
// For exact Geometry Dash 180 deg (Math.PI radians) half-flip per jump:
const JUMP_AIR_TIME = (2 * Math.abs(JUMP_FORCE)) / GRAVITY;
const ROTATION_SPEED = Math.PI / JUMP_AIR_TIME; // Exactly 180° per jump

// Spike Constants
const SPIKE_WIDTH = 48;          // Geometry dash standard 1-block width
const SPIKE_HEIGHT = 48;         // Geometry dash standard 1-block height
const SPIKE_BORDER = 2;          // Thin black outline
const INITIAL_SAFE_DISTANCE = 700; // Safe runway before first spike

// Spikes State
const spikes = [];
let nextSpikeX = INITIAL_SAFE_DISTANCE;

// Spawns spike clusters ahead of the viewport
function updateSpikeGeneration(cameraRightEdge) {
  while (nextSpikeX < cameraRightEdge + 600) {
    // Cluster size: 1, 2, or 3 adjacent touching spikes
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      spikes.push({
        x: nextSpikeX + i * SPIKE_WIDTH,
        width: SPIKE_WIDTH,
        height: SPIKE_HEIGHT
      });
    }
    // Jump total travel is ~235px. For 3 spikes (144px), jump spans from ~-45px to +189px.
    // Safe landing gap: at least 320px to 540px so the player can land, stabilize, and time the next jump.
    const clusterTotalWidth = count * SPIKE_WIDTH;
    const landingGap = 340 + Math.random() * 260;
    nextSpikeX += clusterTotalWidth + landingGap;
  }

  // Despawn spikes that scrolled far behind player (more than 400px offscreen left)
  while (spikes.length > 0 && spikes[0].x < nextSpikeX - 4000 && spikes[0].x < player.x - 500) {
    spikes.shift();
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

// Death & Restart State
let isDead = false;
let deathTimer = 0;
const DEATH_DURATION = 1.0; // 1 second total animation and auto-restart

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
  const PARTICLE_COUNT = 90;
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
      burstX: originX + Math.cos(angle) * speed * 0.32,
      burstY: originY + Math.sin(angle) * speed * 0.32,
      textTarget: textTargets[i],
      squareTarget: squareTargets[i],
      size: 4 + Math.random() * 3,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 12
    });
  }
}

function resetGame() {
  player.x = 100;
  player.y = canvas.height - GROUND_HEIGHT - player.size;
  player.vy = 0;
  player.rotation = 0;
  player.isGrounded = true;

  spikes.length = 0;
  nextSpikeX = INITIAL_SAFE_DISTANCE;

  isDead = false;
  deathTimer = 0;
  isJumpHeld = false;
  deathParticles.length = 0;
}

// Clouds setup
const CLOUD_COUNT = 8;
const clouds = [];

function initClouds() {
  clouds.length = 0;
  for (let i = 0; i < CLOUD_COUNT; i++) {
    clouds.push({
      x: Math.random() * canvas.width * 2,
      y: 40 + Math.random() * (canvas.height * 0.45),
      scale: 0.6 + Math.random() * 0.8,
      speedFactor: 0.2 + Math.random() * 0.15 // Parallax depth factor
    });
  }
}
initClouds();

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

// Helper: Draw a stylized fluffy cloud
function drawCloud(x, y, scale) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  
  // Base cluster circles
  ctx.arc(x, y, 25 * scale, 0, Math.PI * 2);
  ctx.arc(x + 20 * scale, y - 10 * scale, 30 * scale, 0, Math.PI * 2);
  ctx.arc(x + 45 * scale, y - 12 * scale, 35 * scale, 0, Math.PI * 2);
  ctx.arc(x + 75 * scale, y - 5 * scale, 28 * scale, 0, Math.PI * 2);
  ctx.arc(x + 95 * scale, y, 22 * scale, 0, Math.PI * 2);

  // Flat base
  ctx.rect(x - 10 * scale, y - 2 * scale, 110 * scale, 25 * scale);
  
  ctx.fill();
  ctx.restore();
}

// Helper: Draw an upright white spike with a thin black border
function drawSpike(x, groundY, width, height) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x + width / 2, groundY - height);
  ctx.lineTo(x + width, groundY);
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

// Geometry Dash style forgiving spike hitbox check (Option A)
function checkSpikeCollision(playerBox, spike) {
  // Player hitbox inset (4px padding inward from the visual border)
  const playerPadding = 4;
  const pLeft = playerBox.x + playerPadding;
  const pRight = playerBox.x + playerBox.size - playerPadding;
  const pTop = playerBox.y + playerPadding;
  const pBottom = playerBox.y + playerBox.size - playerPadding;

  // Spike hitbox inset (~25% shaved off sides, top apex lowered by ~25%)
  const marginX = spike.width * 0.25;
  const spikeLeft = spike.x + marginX;
  const spikeRight = spike.x + spike.width - marginX;
  const groundY = canvas.height - GROUND_HEIGHT;
  const spikeTop = groundY - spike.height * 0.75;
  const spikeBottom = groundY;

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

  // 1. Update Player & World
  if (!isDead) {
    // Constant horizontal progress
    player.x += SPEED * dt;

    // Gravity & vertical movement
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;

    // Ground collision check & Rotation
    if (player.y >= groundY - player.size) { 
      player.y = groundY - player.size;
      
      // Snap to nearest 90 degrees (Math.PI / 2) upon landing
      const rightAngle = Math.PI / 2;
      player.rotation = Math.round(player.rotation / rightAngle) * rightAngle;

      if (isJumpHeld) {
        // Immediate continuous jump (Geometry Dash buffer mechanic)
        player.vy = JUMP_FORCE;
        player.isGrounded = false;
      } else {
        player.vy = 0;
        player.isGrounded = true;
      }
    } else {
      player.isGrounded = false;
      // Rotate clockwise while in air (Geometry Dash style)
      player.rotation += ROTATION_SPEED * dt;
    }
  } else {
    // Handle death freeze and auto-restart countdown
    deathTimer += dt;
    if (deathTimer >= DEATH_DURATION) {
      resetGame();
    }
  }

  // Camera tracking (player stays at a fixed screen horizontal position)
  const cameraOffsetX = player.x - canvas.width * 0.22;
  const cameraRightEdge = cameraOffsetX + canvas.width;

  // Procedural Spike Generation
  if (!isDead) {
    updateSpikeGeneration(cameraRightEdge);
  }

  // Collision Detection with Spikes (Kill Blocks)
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
  // Sky Background
  ctx.fillStyle = '#6ec1e4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render Parallax Clouds
  for (const cloud of clouds) {
    // Parallax screen position
    const screenX = ((cloud.x - cameraOffsetX * cloud.speedFactor) % (canvas.width + 300) + (canvas.width + 300)) % (canvas.width + 300) - 150;
    drawCloud(screenX, cloud.y, cloud.scale);
  }

  // Render Endless White Ground
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, groundY, canvas.width, GROUND_HEIGHT);

  // Thin Black Border on top of terrain
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(canvas.width, groundY);
  ctx.stroke();

  // Render Spikes
  for (const spike of spikes) {
    const spikeScreenX = spike.x - cameraOffsetX;
    // Only render if visible on screen
    if (spikeScreenX + spike.width > -50 && spikeScreenX < canvas.width + 50) {
      drawSpike(spikeScreenX, groundY, spike.width, spike.height);
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

      if (progress < 0.3) {
        // Phase 1: Burst outward from player
        const t = progress / 0.3;
        curX = p.x + (p.burstX - p.x) * t;
        curY = p.y + (p.burstY - p.y) * t;
      } else if (progress < 0.65) {
        // Phase 2: Converge into "YOU DIED" letters
        const t = easeInOutCubic((progress - 0.3) / 0.35);
        curX = p.burstX + (p.textTarget.x - p.burstX) * t;
        curY = p.burstY + (p.textTarget.y - p.burstY) * t;
      } else {
        // Phase 3: Fly from "YOU DIED" to respawn starting square
        const t = easeInOutCubic((progress - 0.65) / 0.35);
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

    // Glow highlight for YOU DIED while particles are holding formation
    if (progress >= 0.55 && progress <= 0.72) {
      const textAlpha = Math.sin(((progress - 0.55) / 0.17) * Math.PI) * 0.85;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 64px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = `rgba(255, 71, 87, ${textAlpha})`;
      ctx.shadowColor = 'rgba(255, 71, 87, 1)';
      ctx.shadowBlur = 24;
      ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2);
      ctx.restore();
    }
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);