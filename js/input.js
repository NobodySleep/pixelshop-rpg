// ===== INPUT HANDLER =====

const keys = new Set();
const justPressed = new Set();
const justReleased = new Set();
export const mouse = { x: 0, y: 0, clicked: false, held: false };

window.addEventListener('keydown', e => {
  const k = e.code;
  if (!keys.has(k)) justPressed.add(k);
  keys.add(k);
  // prevent arrow key page scroll
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(k)) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', e => {
  const k = e.code;
  keys.delete(k);
  justReleased.add(k);
});

window.addEventListener('mousemove', e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

window.addEventListener('mousedown', e => {
  mouse.held = true;
  mouse.clicked = true;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

window.addEventListener('mouseup', () => {
  mouse.held = false;
});

export function isDown(code) { return keys.has(code); }
export function wasPressed(code) { return justPressed.has(code); }
export function wasReleased(code) { return justReleased.has(code); }

export function clearFrame() {
  justPressed.clear();
  justReleased.clear();
  mouse.clicked = false;
}

export function isMovingLeft()  { return isDown('KeyA') || isDown('ArrowLeft'); }
export function isMovingRight() { return isDown('KeyD') || isDown('ArrowRight'); }
export function isJumping()     { return wasPressed('Space'); }
export function isInteract()    { return wasPressed('KeyF'); }
export function isUltimate()    { return wasPressed('KeyE'); }
export function isAttacking()   { return mouse.clicked || mouse.held; }
