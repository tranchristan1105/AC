import * as THREE from 'three';

export type ToolType = 'hand' | 'axe' | 'shovel' | 'rod' | 'net' | 'watering_can' | 'brush';

/**
 * Mobile-First Hybrid Input Controller:
 * - Dynamic Virtual Thumbstick (touch & mouse drag)
 * - Tap-to-Walk target destination on the island grid
 * - Keyboard WASD / Arrow support for desktop previewing
 */
export class InputController {
  public moveVector = new THREE.Vector2(0, 0);
  public activeTool: ToolType = 'hand';
  public tapTargetWorld: THREE.Vector3 | null = null;

  private keysPressed: Set<string> = new Set();
  private joystickActive = false;
  private joystickOrigin = new THREE.Vector2();
  private joystickCurrent = new THREE.Vector2();
  private readonly maxRadius = 46;

  private joystickStickEl: HTMLElement | null = null;
  private onActionCallback: (() => void) | null = null;
  private onToolChangeCallback: ((tool: ToolType) => void) | null = null;

  constructor() {
    this.bindKeyboard();
  }

  public bindUIElements(
    joystickZone: HTMLElement,
    joystickStick: HTMLElement,
    actionBtn: HTMLElement,
    onAction: () => void,
    onToolChange: (tool: ToolType) => void
  ): void {
    this.joystickStickEl = joystickStick;
    this.onActionCallback = onAction;
    this.onToolChangeCallback = onToolChange;

    const startDrag = (clientX: number, clientY: number) => {
      const rect = joystickZone.getBoundingClientRect();
      this.joystickActive = true;
      this.joystickOrigin.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
      this.tapTargetWorld = null;
      updateDrag(clientX, clientY);
    };

    const updateDrag = (clientX: number, clientY: number) => {
      if (!this.joystickActive) return;
      this.joystickCurrent.set(clientX, clientY);
      const delta = this.joystickCurrent.clone().sub(this.joystickOrigin);
      const dist = Math.min(delta.length(), this.maxRadius);
      if (delta.length() > 0.001) {
        delta.normalize();
      }
      this.moveVector.set(delta.x * (dist / this.maxRadius), delta.y * (dist / this.maxRadius));

      if (this.joystickStickEl) {
        const offsetX = delta.x * dist;
        const offsetY = delta.y * dist;
        this.joystickStickEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      }
    };

    const endDrag = () => {
      this.joystickActive = false;
      this.moveVector.set(0, 0);
      if (this.joystickStickEl) {
        this.joystickStickEl.style.transform = 'translate(0px, 0px)';
      }
    };

    joystickZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        startDrag(t.clientX, t.clientY);
      },
      { passive: false }
    );

    window.addEventListener(
      'touchmove',
      (e) => {
        if (!this.joystickActive) return;
        const t = e.changedTouches[0];
        updateDrag(t.clientX, t.clientY);
      },
      { passive: false }
    );

    window.addEventListener('touchend', () => endDrag());

    joystickZone.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.joystickActive) return;
      updateDrag(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (this.joystickActive) endDrag();
    });

    actionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.onActionCallback?.();
    });
  }

  public setTool(tool: ToolType): void {
    this.activeTool = tool;
    this.onToolChangeCallback?.(tool);
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      const key = e.key.toLowerCase();
      this.keysPressed.add(key);

      if (key === ' ' || key === 'e' || key === 'enter') {
        e.preventDefault();
        this.onActionCallback?.();
      } else if (key === '1') this.setTool('hand');
      else if (key === '2') this.setTool('axe');
      else if (key === '3') this.setTool('shovel');
      else if (key === '4') this.setTool('rod');
      else if (key === '5') this.setTool('net');
      else if (key === '6') this.setTool('watering_can');
      else if (key === '7') this.setTool('brush');
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.key.toLowerCase());
    });
  }

  public getEffectiveMovement(playerPosition: THREE.Vector3): THREE.Vector2 {
    // 1. Check keyboard input
    let kx = 0;
    let ky = 0;
    if (this.keysPressed.has('w') || this.keysPressed.has('arrowup')) ky -= 1;
    if (this.keysPressed.has('s') || this.keysPressed.has('arrowdown')) ky += 1;
    if (this.keysPressed.has('a') || this.keysPressed.has('arrowleft')) kx -= 1;
    if (this.keysPressed.has('d') || this.keysPressed.has('arrowright')) kx += 1;

    if (kx !== 0 || ky !== 0) {
      this.tapTargetWorld = null;
      const v = new THREE.Vector2(kx, ky);
      if (v.length() > 1) v.normalize();
      return v;
    }

    // 2. Check virtual thumbstick
    if (this.joystickActive && this.moveVector.lengthSq() > 0.01) {
      return this.moveVector.clone();
    }

    // 3. Check tap-to-walk target
    if (this.tapTargetWorld) {
      const dx = this.tapTargetWorld.x - playerPosition.x;
      const dz = this.tapTargetWorld.z - playerPosition.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.32) {
        this.tapTargetWorld = null;
        return new THREE.Vector2(0, 0);
      }
      return new THREE.Vector2(dx / dist, dz / dist);
    }

    return new THREE.Vector2(0, 0);
  }
}
