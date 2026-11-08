import * as THREE from 'three';
import crittersData from '../data/critters.json';
import { WorldGrid } from '../engine/WorldGrid';
import { RollingWorldShader } from '../engine/RollingWorldShader';
import type { WeatherType } from '../engine/RealTimeClock';

export interface CritterDef {
  id: string;
  name: string;
  category: 'fish' | 'bug';
  habitat: 'sea' | 'river' | 'flying' | 'flower' | 'tree';
  shadowSize: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'Finned';
  bellValue: number;
  activeHours: [number, number];
  weather: 'any' | 'rain' | 'clear';
  rarity: number;
  catchPun: string;
  primaryColor: string;
  secondaryColor: string;
  icon: string;
}

export interface ActiveCritter {
  uid: string;
  def: CritterDef;
  position: THREE.Vector3;
  origin: THREE.Vector3;
  heading: number;
  phase: number;
  mesh: THREE.Group;
  wingLeft?: THREE.Object3D;
  wingRight?: THREE.Object3D;
  state: 'roam' | 'approaching_bobber' | 'nibbling' | 'biting' | 'fleeing';
  nibblesRemaining: number;
  nibbleTimer: number;
}

export interface FishingState {
  active: boolean;
  bobberPos: THREE.Vector3;
  bobberMesh: THREE.Mesh;
  lineMesh: THREE.Line;
  targetFish: ActiveCritter | null;
  biteWindowRemaining: number;
}

/**
 * Reverse-Engineered Animal Crossing Ephemeral Critter Ecology & Fishing Bobber State Machine.
 */
export class CritterSpawner {
  public readonly registry: CritterDef[] = crittersData as CritterDef[];
  public readonly activeCritters: Map<string, ActiveCritter> = new Map();
  public readonly caughtCounts: Record<string, number> = {};
  public fishing: FishingState;

  private readonly world: WorldGrid;
  private readonly group = new THREE.Group();
  private spawnTimer = 0;

  constructor(world: WorldGrid) {
    this.world = world;
    this.world.rootGroup.add(this.group);

    // Fishing bobber & line setup
    const bobberMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#dc2626', emissiveIntensity: 0.35 })
    );
    const bobberMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), bobberMat);
    bobberMesh.visible = false;
    this.group.add(bobberMesh);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const lineMat = new THREE.LineBasicMaterial({ color: '#f8fafc' });
    const lineMesh = new THREE.Line(lineGeo, lineMat);
    lineMesh.visible = false;
    this.group.add(lineMesh);

    this.fishing = {
      active: false,
      bobberPos: new THREE.Vector3(),
      bobberMesh,
      lineMesh,
      targetFish: null,
      biteWindowRemaining: 0,
    };

    // Initial ecology population
    for (let i = 0; i < 8; i++) {
      this.trySpawnOne(12, 'clear');
    }
  }

  public isCritterActiveAt(def: CritterDef, hour: number, weather: WeatherType): boolean {
    if (def.weather === 'rain' && weather !== 'rain') return false;
    if (def.weather === 'clear' && weather === 'rain') return false;

    const [start, end] = def.activeHours;
    if (start === 0 && end === 24) return true;
    if (start < end) {
      return hour >= start && hour < end;
    }
    return hour >= start || hour < end;
  }

  private pickWeightedCritter(category: 'fish' | 'bug', habitat: CritterDef['habitat'], hour: number, weather: WeatherType): CritterDef | null {
    const candidates = this.registry.filter(
      (c) => c.category === category && c.habitat === habitat && this.isCritterActiveAt(c, hour, weather)
    );
    if (candidates.length === 0) {
      // Fallback to any matching habitat
      const fallback = this.registry.filter((c) => c.category === category && c.habitat === habitat);
      return fallback[Math.floor(Math.random() * fallback.length)] || null;
    }

    const totalWeight = candidates.reduce((acc, c) => acc + c.rarity, 0);
    let roll = Math.random() * totalWeight;
    for (const c of candidates) {
      roll -= c.rarity;
      if (roll <= 0) return c;
    }
    return candidates[0];
  }

  public trySpawnOne(hour: number, weather: WeatherType): void {
    const activeFish = Array.from(this.activeCritters.values()).filter((c) => c.def.category === 'fish').length;
    const activeBugs = Array.from(this.activeCritters.values()).filter((c) => c.def.category === 'bug').length;

    if (activeFish < 6) {
      // Spawn a fish in river or ocean
      const isSea = Math.random() < 0.5;
      for (let attempt = 0; attempt < 20; attempt++) {
        const tx = Math.floor(4 + Math.random() * 40);
        const tz = Math.floor(8 + Math.random() * 36);
        const tile = this.world.getTile(tx, tz);
        if (!tile) continue;

        if ((isSea && tile.terrain === 'ocean' && tz >= 38) || (!isSea && tile.terrain === 'river')) {
          const def = this.pickWeightedCritter('fish', isSea ? 'sea' : 'river', hour, weather);
          if (def) {
            this.spawnCritterInstance(def, tx + 0.5, tz + 0.5);
            break;
          }
        }
      }
    }

    if (activeBugs < 6 && weather !== 'rain') {
      for (let attempt = 0; attempt < 20; attempt++) {
        const tx = Math.floor(8 + Math.random() * 32);
        const tz = Math.floor(8 + Math.random() * 30);
        const tile = this.world.getTile(tx, tz);
        if (!tile || !tile.walkable) continue;

        const habitat: CritterDef['habitat'] = tile.object?.type === 'flower' ? 'flower' : 'flying';
        const def = this.pickWeightedCritter('bug', habitat, hour, weather);
        if (def) {
          this.spawnCritterInstance(def, tx + 0.5, tz + 0.5);
          break;
        }
      }
    }
  }

  private spawnCritterInstance(def: CritterDef, x: number, z: number): ActiveCritter {
    const uid = `critter_${def.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const group = new THREE.Group();
    let wingLeft: THREE.Object3D | undefined;
    let wingRight: THREE.Object3D | undefined;

    const baseY =
      def.category === 'fish'
        ? this.world.getTile(x, z)?.terrain === 'ocean'
          ? 0.08
          : this.world.getSurfaceHeight(x, z) - 0.14
        : this.world.getSurfaceHeight(x, z) + 0.55;

    if (def.category === 'fish') {
      // Authentic Animal Crossing dark underwater fish shadow scaled by ShadowSize
      const scaleMap: Record<CritterDef['shadowSize'], number> = {
        XS: 0.45,
        S: 0.62,
        M: 0.82,
        L: 1.05,
        XL: 1.32,
        Finned: 1.35,
      };
      const s = scaleMap[def.shadowSize] || 0.8;
      const shadowMat = RollingWorldShader.applyToMaterial(
        new THREE.MeshStandardMaterial({
          color: '#112233',
          roughness: 0.9,
          transparent: true,
          opacity: 0.72,
        })
      );

      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 8, 8), shadowMat);
      body.scale.set(0.68, 0.25, 1.65);
      group.add(body);

      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14 * s, 0.24 * s, 4), shadowMat);
      tail.rotation.x = Math.PI / 2;
      tail.position.z = -0.32 * s;
      group.add(tail);

      if (def.shadowSize === 'Finned') {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.26 * s, 4), shadowMat);
        fin.position.y = 0.14 * s;
        group.add(fin);
      }
    } else {
      // Butterfly / Firefly / Mantis 3D mesh
      const isFirefly = def.id === 'firefly';
      const primaryMat = RollingWorldShader.applyToMaterial(
        new THREE.MeshStandardMaterial({
          color: def.primaryColor,
          emissive: isFirefly ? '#c6ff4a' : '#000000',
          emissiveIntensity: isFirefly ? 0.95 : 0.0,
          side: THREE.DoubleSide,
        })
      );
      const bodyMat = RollingWorldShader.applyToMaterial(
        new THREE.MeshStandardMaterial({ color: def.secondaryColor })
      );

      const thorax = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.14, 4, 6), bodyMat);
      thorax.rotation.x = Math.PI / 2;
      group.add(thorax);

      const wLeft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.26), primaryMat);
      wLeft.position.x = -0.11;
      group.add(wLeft);
      wingLeft = wLeft;

      const wRight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.26), primaryMat);
      wRight.position.x = 0.11;
      group.add(wRight);
      wingRight = wRight;
    }

    const pos = new THREE.Vector3(x, baseY, z);
    group.position.copy(pos);
    this.group.add(group);

    const critter: ActiveCritter = {
      uid,
      def,
      position: pos,
      origin: pos.clone(),
      heading: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      mesh: group,
      wingLeft,
      wingRight,
      state: 'roam',
      nibblesRemaining: 1 + Math.floor(Math.random() * 3),
      nibbleTimer: 1.2,
    };

    this.activeCritters.set(uid, critter);
    return critter;
  }

  public castBobber(
    playerPos: THREE.Vector3,
    playerHeading: number,
    onNibble: () => void,
    onBite: (fish: ActiveCritter) => void
  ): boolean {
    if (this.fishing.active) {
      this.cancelFishing();
      return false;
    }

    const castDist = 2.2;
    const targetX = playerPos.x + Math.sin(playerHeading) * castDist;
    const targetZ = playerPos.z + Math.cos(playerHeading) * castDist;
    const tile = this.world.getTile(targetX, targetZ);

    if (!tile || (tile.terrain !== 'ocean' && tile.terrain !== 'river')) {
      return false;
    }

    const waterY = tile.terrain === 'ocean' ? 0.12 : this.world.getSurfaceHeight(targetX, targetZ) - 0.1;
    this.fishing.active = true;
    this.fishing.bobberPos.set(targetX, waterY, targetZ);
    this.fishing.bobberMesh.position.copy(this.fishing.bobberPos);
    this.fishing.bobberMesh.visible = true;
    this.fishing.lineMesh.visible = true;
    this.fishing.biteWindowRemaining = 0;

    // Find nearest fish within 6.5m in the water, or spawn an eager fish nearby!
    let closestFish: ActiveCritter | null = null;
    let closestDist = 6.8;

    this.activeCritters.forEach((c) => {
      if (c.def.category === 'fish') {
        const d = Math.hypot(c.position.x - targetX, c.position.z - targetZ);
        if (d < closestDist) {
          closestDist = d;
          closestFish = c;
        }
      }
    });

    if (!closestFish) {
      const isSea = tile.terrain === 'ocean';
      const def =
        this.pickWeightedCritter('fish', isSea ? 'sea' : 'river', 12, 'clear') || this.registry[0];
      closestFish = this.spawnCritterInstance(
        def,
        targetX + (Math.random() - 0.5) * 2.2,
        targetZ + (Math.random() - 0.5) * 2.2
      );
    }

    closestFish.state = 'approaching_bobber';
    closestFish.nibblesRemaining = 1 + Math.floor(Math.random() * 3);
    closestFish.nibbleTimer = 1.1;
    this.fishing.targetFish = closestFish;

    // Store callbacks on the instance
    this.onNibbleCb = onNibble;
    this.onBiteCb = onBite;
    return true;
  }

  private onNibbleCb: (() => void) | null = null;
  private onBiteCb: ((fish: ActiveCritter) => void) | null = null;

  public tryReelIn(): CritterDef | null {
    if (!this.fishing.active) return null;
    const fish = this.fishing.targetFish;

    if (fish && fish.state === 'biting' && this.fishing.biteWindowRemaining > 0) {
      const caughtDef = fish.def;
      this.caughtCounts[caughtDef.id] = (this.caughtCounts[caughtDef.id] || 0) + 1;
      this.removeCritter(fish.uid);
      this.cancelFishing();
      return caughtDef;
    }

    // Reeled in too early — fish flees!
    if (fish) {
      this.removeCritter(fish.uid);
    }
    this.cancelFishing();
    return null;
  }

  public cancelFishing(): void {
    this.fishing.active = false;
    this.fishing.bobberMesh.visible = false;
    this.fishing.lineMesh.visible = false;
    if (this.fishing.targetFish && this.fishing.targetFish.state !== 'roam') {
      this.fishing.targetFish.state = 'roam';
    }
    this.fishing.targetFish = null;
    this.fishing.biteWindowRemaining = 0;
  }

  public tryCatchBugNear(pos: THREE.Vector3, heading: number): CritterDef | null {
    const netX = pos.x + Math.sin(heading) * 1.15;
    const netZ = pos.z + Math.cos(heading) * 1.15;

    for (const [uid, critter] of this.activeCritters.entries()) {
      if (critter.def.category === 'bug') {
        const dist = Math.hypot(critter.position.x - netX, critter.position.z - netZ);
        if (dist < 1.45) {
          const def = critter.def;
          this.caughtCounts[def.id] = (this.caughtCounts[def.id] || 0) + 1;
          this.removeCritter(uid);
          return def;
        }
      }
    }
    return null;
  }

  public removeCritter(uid: string): void {
    const c = this.activeCritters.get(uid);
    if (!c) return;
    this.group.remove(c.mesh);
    this.activeCritters.delete(uid);
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    hour: number,
    weather: WeatherType
  ): void {
    this.spawnTimer += dt;
    if (this.spawnTimer > 5.0) {
      this.spawnTimer = 0;
      this.trySpawnOne(hour, weather);
    }

    // Update fishing line from player hand to bobber
    if (this.fishing.active) {
      const rodTip = RollingWorldShader.evaluateCurvedPoint(
        new THREE.Vector3(playerPos.x, playerPos.y + 1.1, playerPos.z)
      );
      const bobberCurved = RollingWorldShader.evaluateCurvedPoint(this.fishing.bobberPos);
      const positions = this.fishing.lineMesh.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, rodTip.x, rodTip.y, rodTip.z);
      positions.setXYZ(1, bobberCurved.x, bobberCurved.y, bobberCurved.z);
      positions.needsUpdate = true;
    }

    for (const [uid, c] of this.activeCritters.entries()) {
      if (c.def.category === 'bug') {
        // Wing flapping animation
        const flap = Math.sin(elapsed * 26 + c.phase) * 0.65;
        if (c.wingLeft) c.wingLeft.rotation.z = flap;
        if (c.wingRight) c.wingRight.rotation.z = -flap;

        // Gentle figure-8 hover around origin
        c.heading += (Math.random() - 0.5) * dt * 1.5;
        c.position.x = c.origin.x + Math.sin(elapsed * 0.9 + c.phase) * 1.4;
        c.position.z = c.origin.z + Math.cos(elapsed * 0.7 + c.phase) * 1.4;
        const groundY = this.world.getSurfaceHeight(c.position.x, c.position.z);
        c.position.y = groundY + 0.55 + Math.sin(elapsed * 3.5 + c.phase) * 0.14;
        c.mesh.position.copy(c.position);
        c.mesh.rotation.y = Math.atan2(
          Math.cos(elapsed * 0.9 + c.phase),
          -Math.sin(elapsed * 0.7 + c.phase)
        );
      } else {
        // Fish behavior state machine
        if (c.state === 'roam') {
          c.position.x = c.origin.x + Math.sin(elapsed * 0.55 + c.phase) * 0.85;
          c.position.z = c.origin.z + Math.cos(elapsed * 0.45 + c.phase) * 0.85;
          c.mesh.position.copy(c.position);
          c.mesh.rotation.y = elapsed * 0.45 + c.phase;
        } else if (c.state === 'approaching_bobber' && this.fishing.active) {
          const dx = this.fishing.bobberPos.x - c.position.x;
          const dz = this.fishing.bobberPos.z - c.position.z;
          const dist = Math.hypot(dx, dz);
          c.mesh.rotation.y = Math.atan2(dx, dz);

          if (dist > 0.36) {
            c.position.x += (dx / dist) * dt * 1.25;
            c.position.z += (dz / dist) * dt * 1.25;
            c.mesh.position.copy(c.position);
          } else {
            c.state = 'nibbling';
            c.nibbleTimer = 0.9 + Math.random() * 0.7;
          }
        } else if (c.state === 'nibbling' && this.fishing.active) {
          c.nibbleTimer -= dt;
          if (c.nibbleTimer <= 0) {
            if (c.nibblesRemaining > 0) {
              c.nibblesRemaining--;
              c.nibbleTimer = 0.95 + Math.random() * 0.85;
              // Bobber dip animation
              this.fishing.bobberMesh.position.y = this.fishing.bobberPos.y - 0.12;
              setTimeout(() => {
                if (this.fishing.active) {
                  this.fishing.bobberMesh.position.y = this.fishing.bobberPos.y;
                }
              }, 160);
              this.onNibbleCb?.();
            } else {
              // Full bite!
              c.state = 'biting';
              this.fishing.biteWindowRemaining = 1.65;
              this.fishing.bobberMesh.position.y = this.fishing.bobberPos.y - 0.28;
              this.onBiteCb?.(c);
            }
          }
        } else if (c.state === 'biting') {
          this.fishing.biteWindowRemaining -= dt;
          if (this.fishing.biteWindowRemaining <= 0) {
            // Missed the bite window
            this.removeCritter(uid);
            this.cancelFishing();
          }
        }
      }
    }
  }
}
