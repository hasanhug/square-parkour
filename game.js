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
const GROUND_HEIGHT = 120; // Height of the white ground from bottom
const PLAYER_SIZE = 48;    // Size of the square
const SPEED = 360;         // Horizontal speed (pixels per second)
const GRAVITY = 1800;      // Gravity acceleration (pixels per second^2)
const JUMP_FORCE = -720;   // Upward jump impulse

// Game State
const player = {
  x: 100,
  y: 0,
  size: PLAYER_SIZE,
  vy: 0,
  isGrounded: false
};

// Set initial player vertical position on ground
player.y = canvas.height - GROUND_HEIGHT - player.size;

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

// Jump Trigger
function tryJump() {
  if (player.isGrounded) {
    player.vy = JUMP_FORCE;
    player.isGrounded = false;
  }
}

// Input Handlers
window.addEventListener('pointerdown', (e) => {
  // Left-click (button === 0) or touch/pen
  if (e.button === 0) {
    tryJump();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    tryJump();
  }
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

// Main Game Loop with Delta Time
let lastTime = performance.now();

function gameLoop(currentTime) {
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1); // clamp to prevent large jumps
  lastTime = currentTime;

  // Ground Y coordinate relative to current canvas height
  const groundY = canvas.height - GROUND_HEIGHT;

  // 1. Update Player
  // Constant horizontal progress
  player.x += SPEED * dt;

  // Gravity & vertical movement
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;

  // Ground collision check
  if (player.y >= groundY - player.size) { 
    player.y = groundY - player.size;
    player.vy = 0;
    player.isGrounded = true;
  } else {
    player.isGrounded = false;
  }

  // Camera tracking (player stays at a fixed screen horizontal position)
  const cameraOffsetX = player.x - canvas.width * 0.22;

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

  // Render Black Square Player
  const playerScreenX = player.x - cameraOffsetX;
  ctx.fillStyle = '#000000';
  ctx.fillRect(playerScreenX, player.y, player.size, player.size);

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
