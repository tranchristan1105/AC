import * as THREE from 'three';
import villagersData from '../data/villagers.json';
import { WorldGrid } from '../engine/WorldGrid';
import { RollingWorldShader } from '../engine/RollingWorldShader';

export interface VillagerDef {
  id: string;
  name: string;
  species: string;
  personality: string;
  catchphrase: string;
  basePitch: number;
  hobby: string;
  favoriteGift: string;
  houseTile: [number, number];
  bodyColor: string;
  earColor: string;
  shirtColor: string;
  badgeBg: string;
  badgeText: string;
  greetings: {
    morning: string;
    afternoon: string;
    evening: string;
  };
  chatter: string[];
  questPrompt: string;
}

export interface ActiveVillager {
  def: VillagerDef;
  position: THREE.Vector3;
  targetPos: THREE.Vector3;
  heading: number;
  state: 'idle' | 'wander' | 'wave' | 'talking';
  stateTimer: number;
  friendship: number;
  hasQuest: boolean;
  talkIndex: number;
  mesh: THREE.Group;
  rightArm: THREE.Object3D;
  leftArm: THREE.Object3D;
}

/**
 * Reverse-Engineered Animal Crossing Villager Utility AI & Friendship System.
 */
export class VillagerAI {
  public readonly villagers: Map<string, ActiveVillager> = new Map();
  private readonly world: WorldGrid;
  private readonly group = new THREE.Group();

  constructor(world: WorldGrid) {
    this.world = world;
    this.world.rootGroup.add(this.group);

    (villagersData as VillagerDef[]).forEach((def, idx) => {
      this.spawnVillager(def, idx === 0);
    });
  }

  private spawnVillager(def: VillagerDef, startWithQuest: boolean): void {
    const startX = def.houseTile[0] + 0.5;
    const startZ = def.houseTile[1] + 2.4;
    const startY = this.world.getSurfaceHeight(startX, startZ);

    const { mesh, rightArm, leftArm } = this.buildVillagerMesh(def);
    const pos = new THREE.Vector3(startX, startY, startZ);
    mesh.position.copy(pos);
    this.group.add(mesh);

    this.villagers.set(def.id, {
      def,
      position: pos,
      targetPos: pos.clone(),
      heading: 0,
      state: 'idle',
      stateTimer: 2 + Math.random() * 3,
      friendship: 35,
      hasQuest: startWithQuest,
      talkIndex: 0,
      mesh,
      rightArm,
      leftArm,
    });
  }

  private buildVillagerMesh(def: VillagerDef): {
    mesh: THREE.Group;
    rightArm: THREE.Object3D;
    leftArm: THREE.Object3D;
  } {
    const group = new THREE.Group();

    const bodyMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: def.bodyColor, roughness: 0.75 })
    );
    const earMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: def.earColor, roughness: 0.75 })
    );
    const shirtMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: def.shirtColor, roughness: 0.8 })
    );
    const eyeMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#1e293b' })
    );

    // Torso / Shirt
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.48, 10), shirtMat);
    torso.position.y = 0.36;
    torso.castShadow = true;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), bodyMat);
    head.position.y = 0.78;
    head.castShadow = true;
    group.add(head);

    // Eyes
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), eyeMat);
    leftEye.position.set(-0.1, 0.8, 0.27);
    group.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.x = 0.1;
    group.add(rightEye);

    // Species-specific ears / tail / beak
    if (def.species === 'Cub' || def.species === 'Squirrel') {
      const earLeft = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), earMat);
      earLeft.position.set(-0.22, 1.03, 0);
      group.add(earLeft);

      const earRight = earLeft.clone();
      earRight.position.x = 0.22;
      group.add(earRight);

      if (def.species === 'Squirrel') {
        // Big curled squirrel tail
        const tail = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), bodyMat);
        tail.scale.set(0.7, 1.35, 0.9);
        tail.position.set(0, 0.48, -0.3);
        group.add(tail);
      }
    } else if (def.species === 'Penguin') {
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 6), earMat);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.74, 0.32);
      group.add(beak);
    }

    // Arms
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 6), bodyMat);
    leftArm.position.set(-0.28, 0.42, 0);
    leftArm.rotation.z = 0.25;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 6), bodyMat);
    rightArm.position.set(0.28, 0.42, 0);
    rightArm.rotation.z = -0.25;
    group.add(rightArm);

    return { mesh: group, rightArm, leftArm };
  }

  public getNearestVillager(pos: THREE.Vector3, maxDistance = 2.1): ActiveVillager | null {
    let best: ActiveVillager | null = null;
    let bestDist = maxDistance;
    this.villagers.forEach((v) => {
      const d = Math.hypot(v.position.x - pos.x, v.position.z - pos.z);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    });
    return best;
  }

  public generateDialogue(
    v: ActiveVillager,
    period: 'morning' | 'afternoon' | 'evening'
  ): { text: string; isQuest: boolean } {
    v.friendship = Math.min(255, v.friendship + 2);
    const interpolate = (raw: string) => raw.replace(/\{catchphrase\}/g, v.def.catchphrase);

    if (v.hasQuest) {
      return {
        text: interpolate(v.def.questPrompt),
        isQuest: true,
      };
    }

    if (v.talkIndex === 0) {
      v.talkIndex++;
      return {
        text: interpolate(v.def.greetings[period]),
        isQuest: false,
      };
    }

    const line = v.def.chatter[(v.talkIndex - 1) % v.def.chatter.length];
    v.talkIndex++;
    return {
      text: interpolate(line),
      isQuest: false,
    };
  }

  public update(dt: number, elapsed: number, playerPos: THREE.Vector3): void {
    this.villagers.forEach((v) => {
      if (v.state === 'talking') {
        const dx = playerPos.x - v.position.x;
        const dz = playerPos.z - v.position.z;
        v.heading = Math.atan2(dx, dz);
        v.mesh.rotation.y = v.heading;
        return;
      }

      const distToPlayer = Math.hypot(playerPos.x - v.position.x, playerPos.z - v.position.z);

      // Utility check: wave warmly if player is nearby
      if (distToPlayer < 2.8) {
        v.state = 'wave';
        const dx = playerPos.x - v.position.x;
        const dz = playerPos.z - v.position.z;
        v.heading = Math.atan2(dx, dz);
        v.mesh.rotation.y = v.heading;
        v.rightArm.rotation.z = -2.2 + Math.sin(elapsed * 12) * 0.45;
        return;
      } else {
        v.rightArm.rotation.z = -0.25;
      }

      v.stateTimer -= dt;
      if (v.stateTimer <= 0) {
        if (v.state === 'idle') {
          // Pick a nearby walkable tile around their house or plaza
          for (let attempt = 0; attempt < 10; attempt++) {
            const rx = v.def.houseTile[0] + (Math.random() - 0.5) * 9;
            const rz = v.def.houseTile[1] + 2 + (Math.random() - 0.5) * 8;
            if (this.world.canWalkTo(rx, rz, v.position.x, v.position.z)) {
              v.targetPos.set(rx, this.world.getSurfaceHeight(rx, rz), rz);
              v.state = 'wander';
              v.stateTimer = 5.5;
              break;
            }
          }
        } else {
          v.state = 'idle';
          v.stateTimer = 2.5 + Math.random() * 3.5;
        }
      }

      if (v.state === 'wander') {
        const dx = v.targetPos.x - v.position.x;
        const dz = v.targetPos.z - v.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.2) {
          v.state = 'idle';
          v.stateTimer = 3.0;
        } else {
          const step = 1.45 * dt;
          const nx = v.position.x + (dx / dist) * step;
          const nz = v.position.z + (dz / dist) * step;
          if (this.world.canWalkTo(nx, nz, v.position.x, v.position.z)) {
            v.position.x = nx;
            v.position.z = nz;
            v.position.y = this.world.getSurfaceHeight(nx, nz);
            v.heading = Math.atan2(dx, dz);
            v.mesh.position.copy(v.position);
            v.mesh.position.y += Math.abs(Math.sin(elapsed * 9)) * 0.05;
            v.mesh.rotation.y = v.heading;
          } else {
            v.state = 'idle';
            v.stateTimer = 2.0;
          }
        }
      }
    });
  }
}
