import * as THREE from 'three';
import { RollingWorldShader } from './RollingWorldShader';
import type { SurfaceType } from './AudioSynthesizer';

export type TileTerrain = 'ocean' | 'sand' | 'grass' | 'river' | 'plaza' | 'bridge' | 'incline' | 'cliff_edge';

export interface PlacedObject {
  uid: string;
  type:
    | 'apple_tree'
    | 'orange_tree'
    | 'palm_tree'
    | 'cedar_tree'
    | 'rock'
    | 'fossil_spot'
    | 'glowing_spot'
    | 'flower'
    | 'weed'
    | 'workbench'
    | 'nooks_cranny'
    | 'villager_house'
    | 'furniture';
  itemId?: string;
  name: string;
  tileX: number;
  tileZ: number;
  rotationY: number;
  hasFruit: boolean;
  hitsRemaining: number;
  watered?: boolean;
  villagerOwnerId?: string;
  mesh: THREE.Object3D;
  fruitMeshes?: THREE.Object3D[];
}

export interface DroppedLoot {
  uid: string;
  itemId: string;
  name: string;
  icon: string;
  tileX: number;
  tileZ: number;
  worldPos: THREE.Vector3;
  mesh: THREE.Object3D;
  bobOffset: number;
}

export interface GridTile {
  x: number;
  z: number;
  acreX: number;
  acreZ: number;
  elevation: number; // 0 = beach/ocean, 1 = meadow, 2 = northern cliff
  terrain: TileTerrain;
  walkable: boolean;
  customDesignTexture: THREE.CanvasTexture | null;
  customTileMesh: THREE.Mesh | null;
  object: PlacedObject | null;
}

/**
 * Reverse-Engineered Animal Crossing Spatial Grid (3x3 Acres = 48x48 Tiles).
 * Manages multi-tier elevation, river/waterfall geometry, buildings, interactive foliage,
 * dropped loot, and custom pixel path overlays.
 */
export class WorldGrid {
  public static readonly SIZE = 48;
  public static readonly ACRE_SIZE = 16;

  public readonly tiles: GridTile[][] = [];
  public readonly objects: Map<string, PlacedObject> = new Map();
  public readonly droppedLoots: Map<string, DroppedLoot> = new Map();
  public readonly rootGroup = new THREE.Group();

  private waterMaterials: THREE.MeshStandardMaterial[] = [];
  private nightWindowMaterials: THREE.MeshStandardMaterial[] = [];
  private waterfallParticles: THREE.Mesh[] = [];
  private customDesignCanvas: HTMLCanvasElement;
  private customDesignTexture: THREE.CanvasTexture;

  constructor(scene: THREE.Scene) {
    scene.add(this.rootGroup);
    this.customDesignCanvas = this.createDefaultCustomPatternCanvas();
    this.customDesignTexture = new THREE.CanvasTexture(this.customDesignCanvas);
    this.customDesignTexture.magFilter = THREE.NearestFilter;
    this.customDesignTexture.minFilter = THREE.NearestFilter;

    this.initGridLayout();
    this.buildTerrainMeshes();
    this.populateDefaultIslandObjects();
  }

  private createDefaultCustomPatternCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e8c39e';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#d4a373';
    for (let y = 0; y < 16; y += 4) {
      for (let x = (y % 8 === 0 ? 0 : 2); x < 16; x += 4) {
        ctx.fillRect(x, y, 3, 3);
      }
    }
    ctx.fillStyle = '#faedcd';
    ctx.fillRect(1, 1, 2, 1);
    ctx.fillRect(9, 5, 2, 1);
    return canvas;
  }

  public getCustomDesignCanvas(): HTMLCanvasElement {
    return this.customDesignCanvas;
  }

  public notifyCustomDesignUpdated(): void {
    this.customDesignTexture.needsUpdate = true;
  }

  private initGridLayout(): void {
    for (let x = 0; x < WorldGrid.SIZE; x++) {
      this.tiles[x] = [];
      for (let z = 0; z < WorldGrid.SIZE; z++) {
        const acreX = Math.floor(x / WorldGrid.ACRE_SIZE);
        const acreZ = Math.floor(z / WorldGrid.ACRE_SIZE);

        let elevation = 1;
        let terrain: TileTerrain = 'grass';
        let walkable = true;

        // Outer Ocean Perimeter
        if (x < 4 || x >= 44 || z < 3 || z >= 43) {
          elevation = 0;
          terrain = 'ocean';
          walkable = false;
        } else if (x < 7 || x >= 41 || z >= 39) {
          // Sandy Beach Perimeter
          elevation = 0;
          terrain = 'sand';
          walkable = true;
        } else if (z < 11 && x >= 8 && x <= 39) {
          // Northern Clifftop (Elevation 2)
          elevation = 2;
          terrain = 'grass';
          walkable = true;
        }

        // West Cliff Incline Ramp (x: 15..16, z: 10..12) allowing smooth walk up to Elevation 2
        if ((x === 15 || x === 16) && z >= 10 && z <= 12) {
          elevation = 1 + (12 - z) * 0.5;
          terrain = 'incline';
          walkable = true;
        }

        // River winding from Northern Cliff Pond down to Southern Beach Mouth
        const riverCenter = Math.round(24 + Math.sin(z * 0.22) * 2.5);
        if (z >= 6 && z <= 42 && Math.abs(x - riverCenter) <= 1) {
          terrain = 'river';
          walkable = false;
        }

        // Wooden River Bridge at z = 25..26
        if ((z === 25 || z === 26) && Math.abs(x - riverCenter) <= 2) {
          terrain = 'bridge';
          walkable = true;
          elevation = 1;
        }

        // Town Brick Plaza (x: 18..23, z: 20..24)
        if (x >= 18 && x <= 23 && z >= 20 && z <= 24 && terrain !== 'river') {
          terrain = 'plaza';
          walkable = true;
          elevation = 1;
        }

        // Southern Wooden Fishing Pier (x: 34..35, z: 41..45)
        if ((x === 34 || x === 35) && z >= 40 && z <= 45) {
          terrain = 'bridge';
          walkable = true;
          elevation = 0.25;
        }

        this.tiles[x][z] = {
          x,
          z,
          acreX,
          acreZ,
          elevation,
          terrain,
          walkable,
          customDesignTexture: null,
          customTileMesh: null,
          object: null,
        };
      }
    }
  }

  public getTile(x: number, z: number): GridTile | null {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (ix < 0 || ix >= WorldGrid.SIZE || iz < 0 || iz >= WorldGrid.SIZE) {
      return null;
    }
    return this.tiles[ix][iz];
  }

  public getSurfaceHeight(worldX: number, worldZ: number): number {
    const tile = this.getTile(worldX, worldZ);
    if (!tile) return 0;
    if (tile.terrain === 'incline') {
      // Smooth ramp interpolation between z=12 (elev 1) and z=10 (elev 2)
      const t = THREE.MathUtils.clamp((12.5 - worldZ) / 2.5, 0, 1);
      return (1 + t) * 1.1;
    }
    if (tile.terrain === 'sand') {
      return 0.25;
    }
    if (tile.terrain === 'bridge' && tile.z >= 40) {
      return 0.45;
    }
    return tile.elevation * 1.1;
  }

  public getFootstepSurface(worldX: number, worldZ: number): SurfaceType {
    const tile = this.getTile(worldX, worldZ);
    if (!tile) return 'grass';
    if (tile.terrain === 'sand') return 'sand';
    if (tile.terrain === 'bridge' || tile.terrain === 'incline') return 'wood_bridge';
    if (tile.terrain === 'plaza') return 'stone_plaza';
    return 'grass';
  }

  public canWalkTo(worldX: number, worldZ: number, currentX: number, currentZ: number): boolean {
    const targetTile = this.getTile(worldX, worldZ);
    const currentTile = this.getTile(currentX, currentZ);
    if (!targetTile || !targetTile.walkable) return false;
    if (targetTile.object && targetTile.object.type !== 'flower' && targetTile.object.type !== 'weed' && targetTile.object.type !== 'fossil_spot' && targetTile.object.type !== 'glowing_spot') {
      return false;
    }

    if (currentTile) {
      // Prevent walking straight up/down vertical cliffs unless on an incline or beach slope
      const currElev = currentTile.elevation;
      const nextElev = targetTile.elevation;
      const isBeachTransition =
        (currentTile.terrain === 'sand' && targetTile.elevation === 1) ||
        (targetTile.terrain === 'sand' && currentTile.elevation === 1);
      const isInclineTransition = currentTile.terrain === 'incline' || targetTile.terrain === 'incline';

      if (!isBeachTransition && !isInclineTransition && Math.abs(currElev - nextElev) > 0.6) {
        return false;
      }
    }
    return true;
  }

  private createCurvedMaterial(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0.05,
      ...params,
    });
    return RollingWorldShader.applyToMaterial(mat);
  }

  private buildTerrainMeshes(): void {
    const matGrassLight = this.createCurvedMaterial({ color: '#6ec85f' });
    const matGrassDark = this.createCurvedMaterial({ color: '#62ba54' });
    const matCliffSoil = this.createCurvedMaterial({ color: '#8f6239', roughness: 0.95 });
    const matSand = this.createCurvedMaterial({ color: '#f3d999', roughness: 0.9 });
    const matPlazaLight = this.createCurvedMaterial({ color: '#d89b72', roughness: 0.8 });
    const matPlazaDark = this.createCurvedMaterial({ color: '#c78860', roughness: 0.8 });
    const matWood = this.createCurvedMaterial({ color: '#9e6b43', roughness: 0.85 });

    const matWater = this.createCurvedMaterial({
      color: '#34b7eb',
      roughness: 0.2,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88,
    });
    this.waterMaterials.push(matWater);

    const tileGeo = new THREE.BoxGeometry(1.01, 1.1, 1.01);

    // Group terrain blocks by material for high mobile batch efficiency
    for (let x = 0; x < WorldGrid.SIZE; x++) {
      for (let z = 0; z < WorldGrid.SIZE; z++) {
        const tile = this.tiles[x][z];
        const checker = (x + z) % 2 === 0;

        if (tile.terrain === 'ocean') {
          const mesh = new THREE.Mesh(tileGeo, matWater);
          mesh.position.set(x + 0.5, -0.45, z + 0.5);
          this.rootGroup.add(mesh);
          continue;
        }

        if (tile.terrain === 'sand') {
          const mesh = new THREE.Mesh(tileGeo, matSand);
          mesh.position.set(x + 0.5, -0.3, z + 0.5);
          mesh.receiveShadow = true;
          this.rootGroup.add(mesh);
          continue;
        }

        if (tile.terrain === 'river') {
          const bedMesh = new THREE.Mesh(tileGeo, matCliffSoil);
          bedMesh.position.set(x + 0.5, tile.elevation * 1.1 - 0.85, z + 0.5);
          this.rootGroup.add(bedMesh);

          const waterMesh = new THREE.Mesh(new THREE.BoxGeometry(1.01, 0.7, 1.01), matWater);
          waterMesh.position.set(x + 0.5, tile.elevation * 1.1 - 0.52, z + 0.5);
          this.rootGroup.add(waterMesh);

          // Waterfall edge at z = 10 -> 11
          if (z === 10) {
            const fallMat = this.createCurvedMaterial({
              color: '#b8f2ff',
              emissive: '#38bdf8',
              emissiveIntensity: 0.25,
              roughness: 0.15,
            });
            const fallMesh = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.35, 0.35), fallMat);
            fallMesh.position.set(x + 0.5, 1.55, z + 0.95);
            this.rootGroup.add(fallMesh);
            this.waterfallParticles.push(fallMesh);
          }
          continue;
        }

        const heightCenter =
          tile.terrain === 'incline'
            ? (1 + (12 - z) * 0.5) * 1.1 - 0.55
            : tile.terrain === 'bridge' && z >= 40
            ? -0.1
            : tile.elevation * 1.1 - 0.55;

        // Base cliff soil column if elevation >= 1
        if (tile.elevation >= 1) {
          const soilHeight = tile.elevation * 1.1;
          const soilGeo = new THREE.BoxGeometry(1.01, soilHeight, 1.01);
          const soilMesh = new THREE.Mesh(soilGeo, matCliffSoil);
          soilMesh.position.set(x + 0.5, soilHeight * 0.5 - 0.15, z + 0.5);
          soilMesh.castShadow = true;
          soilMesh.receiveShadow = true;
          this.rootGroup.add(soilMesh);
        }

        // Top cap material
        let topMat = checker ? matGrassLight : matGrassDark;
        if (tile.terrain === 'plaza') {
          topMat = checker ? matPlazaLight : matPlazaDark;
        } else if (tile.terrain === 'bridge' || tile.terrain === 'incline') {
          topMat = matWood;
        }

        const capGeo = new THREE.BoxGeometry(1.01, 0.24, 1.01);
        const capMesh = new THREE.Mesh(capGeo, topMat);
        capMesh.position.set(x + 0.5, heightCenter + 0.45, z + 0.5);
        capMesh.receiveShadow = true;
        this.rootGroup.add(capMesh);

        // Bridge railings
        if (tile.terrain === 'bridge' && z <= 30 && (z === 25 || z === 26)) {
          const railMesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 0.12), matWood);
          railMesh.position.set(x + 0.5, heightCenter + 0.75, z === 25 ? z + 0.08 : z + 0.92);
          railMesh.castShadow = true;
          this.rootGroup.add(railMesh);
        }
      }
    }
  }

  private populateDefaultIslandObjects(): void {
    // 1. DIY Workbench on Town Plaza
    this.spawnObject('workbench', 'DIY Workbench', 18, 21);

    // 2. Nook's Cranny Shop (East of Plaza)
    this.spawnObject('nooks_cranny', "Nook's Cranny", 29, 20);

    // 3. Villager Houses (Maple, Marshal, Roald)
    this.spawnObject('villager_house', "Maple's House", 11, 14, 'maple');
    this.spawnObject('villager_house', "Marshal's House", 35, 14, 'marshal');
    this.spawnObject('villager_house', "Roald's House", 13, 31, 'roald');

    // 4. Apple & Orange Fruit Trees across the meadow
    const appleTreeCoords = [
      [10, 19],
      [14, 17],
      [16, 28],
      [20, 15],
      [31, 26],
      [36, 22],
    ];
    appleTreeCoords.forEach(([tx, tz]) => this.spawnObject('apple_tree', 'Apple Tree', tx, tz));

    const orangeTreeCoords = [
      [10, 25],
      [28, 15],
      [33, 30],
      [38, 26],
      [21, 32],
    ];
    orangeTreeCoords.forEach(([tx, tz]) => this.spawnObject('orange_tree', 'Orange Tree', tx, tz));

    // 5. Cedar Trees on the Northern Cliff (Elevation 2)
    const cedarCoords = [
      [11, 6],
      [15, 5],
      [20, 6],
      [29, 6],
      [34, 5],
      [38, 7],
    ];
    cedarCoords.forEach(([tx, tz]) => this.spawnObject('cedar_tree', 'Cedar Tree', tx, tz));

    // 6. Coconut Palm Trees along the Sandy Beach
    const palmCoords = [
      [6, 18],
      [6, 30],
      [12, 40],
      [29, 40],
      [41, 20],
      [41, 32],
    ];
    palmCoords.forEach(([tx, tz]) => this.spawnObject('palm_tree', 'Coconut Palm', tx, tz));

    // 7. Mineral Rocks (strike with Shovel or Axe for Stone, Iron & Bells)
    const rockCoords = [
      [13, 8],
      [22, 8],
      [17, 35],
      [37, 33],
    ];
    rockCoords.forEach(([tx, tz]) => this.spawnObject('rock', 'Island Rock', tx, tz));

    // 8. Daily Buried Fossils (Star-shaped cracks) & Glowing Bell Spot
    const fossilCoords = [
      [15, 22],
      [27, 29],
      [32, 18],
      [19, 8],
    ];
    fossilCoords.forEach(([tx, tz]) => this.spawnObject('fossil_spot', 'Buried Fossil', tx, tz));
    this.spawnObject('glowing_spot', 'Glowing Money Spot', 22, 29);

    // 9. Wildflowers & Weeds
    const flowerCoords = [
      [12, 16],
      [13, 16],
      [34, 16],
      [36, 16],
      [19, 19],
      [24, 19],
      [20, 27],
      [28, 23],
      [30, 23],
    ];
    flowerCoords.forEach(([tx, tz]) => this.spawnObject('flower', 'Island Cosmos', tx, tz));

    const weedCoords = [
      [9, 22],
      [18, 33],
      [39, 19],
      [26, 7],
    ];
    weedCoords.forEach(([tx, tz]) => this.spawnObject('weed', 'Clump of Weeds', tx, tz));

    // 10. Default Cozy Campfire near the Plaza
    this.spawnObject('furniture', 'Campfire', 22, 23, undefined, 'campfire');
  }

  public spawnObject(
    type: PlacedObject['type'],
    name: string,
    tileX: number,
    tileZ: number,
    villagerOwnerId?: string,
    itemId?: string,
    rotationY = 0
  ): PlacedObject | null {
    const tile = this.getTile(tileX, tileZ);
    if (!tile || tile.object) return null;

    const uid = `${type}_${tileX}_${tileZ}_${Math.random().toString(36).slice(2, 6)}`;
    const surfaceY = this.getSurfaceHeight(tileX + 0.5, tileZ + 0.5);
    const { mesh, fruitMeshes } = this.createObjectMesh(type, villagerOwnerId, itemId);

    mesh.position.set(tileX + 0.5, surfaceY, tileZ + 0.5);
    mesh.rotation.y = rotationY;
    this.rootGroup.add(mesh);

    const obj: PlacedObject = {
      uid,
      type,
      itemId,
      name,
      tileX,
      tileZ,
      rotationY,
      hasFruit: type === 'apple_tree' || type === 'orange_tree' || type === 'palm_tree',
      hitsRemaining: type === 'rock' ? 5 : 3,
      villagerOwnerId,
      mesh,
      fruitMeshes,
    };

    tile.object = obj;
    this.objects.set(uid, obj);
    return obj;
  }

  public removeObject(obj: PlacedObject): void {
    const tile = this.getTile(obj.tileX, obj.tileZ);
    if (tile && tile.object?.uid === obj.uid) {
      tile.object = null;
    }
    this.rootGroup.remove(obj.mesh);
    this.objects.delete(obj.uid);
  }

  public paintCustomTile(tileX: number, tileZ: number): boolean {
    const tile = this.getTile(tileX, tileZ);
    if (!tile || !tile.walkable || tile.terrain === 'ocean' || tile.terrain === 'river') {
      return false;
    }
    if (tile.customTileMesh) {
      // Toggle off if already painted
      this.rootGroup.remove(tile.customTileMesh);
      tile.customTileMesh = null;
      return false;
    }

    const mat = this.createCurvedMaterial({
      map: this.customDesignTexture,
      roughness: 0.75,
    });
    const plane = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.92), mat);
    const y = this.getSurfaceHeight(tileX + 0.5, tileZ + 0.5);
    plane.position.set(tileX + 0.5, y + 0.02, tileZ + 0.5);
    this.rootGroup.add(plane);
    tile.customTileMesh = plane;
    return true;
  }

  private createObjectMesh(
    type: PlacedObject['type'],
    villagerOwnerId?: string,
    itemId?: string
  ): { mesh: THREE.Object3D; fruitMeshes?: THREE.Object3D[] } {
    const group = new THREE.Group();
    const fruitMeshes: THREE.Object3D[] = [];

    if (type === 'apple_tree' || type === 'orange_tree') {
      const trunkMat = this.createCurvedMaterial({ color: '#7c4d2b' });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.25, 8), trunkMat);
      trunk.position.y = 0.62;
      trunk.castShadow = true;
      group.add(trunk);

      const leafMat = this.createCurvedMaterial({ color: '#3ea34e' });
      const spheres = [
        [0, 1.55, 0, 0.72],
        [-0.42, 1.32, 0.15, 0.52],
        [0.42, 1.32, 0.15, 0.52],
        [0, 1.35, -0.35, 0.52],
      ];
      spheres.forEach(([sx, sy, sz, sr]) => {
        const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(sr, 1), leafMat);
        canopy.position.set(sx, sy, sz);
        canopy.castShadow = true;
        group.add(canopy);
      });

      const fruitColor = type === 'apple_tree' ? '#e63946' : '#f77f00';
      const fruitMat = this.createCurvedMaterial({ color: fruitColor, roughness: 0.35 });
      const fruitOffsets = [
        [-0.36, 1.28, 0.52],
        [0.36, 1.3, 0.5],
        [0.0, 1.65, 0.55],
      ];
      fruitOffsets.forEach(([fx, fy, fz]) => {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), fruitMat);
        fruit.position.set(fx, fy, fz);
        group.add(fruit);
        fruitMeshes.push(fruit);
      });
    } else if (type === 'cedar_tree') {
      const trunkMat = this.createCurvedMaterial({ color: '#5c3a21' });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.1, 8), trunkMat);
      trunk.position.y = 0.55;
      trunk.castShadow = true;
      group.add(trunk);

      const pineMat = this.createCurvedMaterial({ color: '#2b6e46' });
      [0.95, 1.45, 1.9].forEach((py, idx) => {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.85 - idx * 0.18, 0.85, 8), pineMat);
        cone.position.y = py;
        cone.castShadow = true;
        group.add(cone);
      });
    } else if (type === 'palm_tree') {
      const trunkMat = this.createCurvedMaterial({ color: '#a47551' });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.55, 8), trunkMat);
      trunk.position.y = 0.75;
      trunk.rotation.z = 0.08;
      trunk.castShadow = true;
      group.add(trunk);

      const frondMat = this.createCurvedMaterial({ color: '#65b741' });
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const frond = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.26), frondMat);
        frond.position.set(Math.cos(angle) * 0.42, 1.52, Math.sin(angle) * 0.42);
        frond.rotation.y = -angle;
        frond.rotation.z = -0.35;
        frond.castShadow = true;
        group.add(frond);
      }

      const cocoMat = this.createCurvedMaterial({ color: '#6f4e37' });
      [
        [-0.18, 1.38, 0.18],
        [0.18, 1.38, 0.18],
      ].forEach(([cx, cy, cz]) => {
        const coco = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), cocoMat);
        coco.position.set(cx, cy, cz);
        group.add(coco);
        fruitMeshes.push(coco);
      });
    } else if (type === 'rock') {
      const rockMat = this.createCurvedMaterial({ color: '#8d99ae', roughness: 0.9 });
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 0), rockMat);
      rock.scale.set(1.1, 0.78, 1.0);
      rock.position.y = 0.32;
      rock.castShadow = true;
      group.add(rock);
    } else if (type === 'fossil_spot') {
      const starMat = this.createCurvedMaterial({ color: '#4a3219' });
      for (let i = 0; i < 3; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.09), starMat);
        bar.position.y = 0.02;
        bar.rotation.y = (i * Math.PI) / 3;
        group.add(bar);
      }
    } else if (type === 'glowing_spot') {
      const glowMat = this.createCurvedMaterial({
        color: '#fde047',
        emissive: '#facc15',
        emissiveIntensity: 0.85,
      });
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 12), glowMat);
      disc.position.y = 0.03;
      group.add(disc);
    } else if (type === 'flower') {
      const stemMat = this.createCurvedMaterial({ color: '#2b9348' });
      const petalColors = ['#ff5d8f', '#ffd166', '#ffffff', '#ff9f1c'];
      const petalMat = this.createCurvedMaterial({
        color: petalColors[Math.floor(Math.random() * petalColors.length)],
      });
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 0.24;
        const oz = (i % 2 === 0 ? 1 : -1) * 0.14;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 6), stemMat);
        stem.position.set(ox, 0.12, oz);
        group.add(stem);

        const blossom = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), petalMat);
        blossom.scale.set(1, 0.5, 1);
        blossom.position.set(ox, 0.26, oz);
        group.add(blossom);
      }
    } else if (type === 'weed') {
      const weedMat = this.createCurvedMaterial({ color: '#52b788' });
      for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), weedMat);
        blade.position.set((i - 1.5) * 0.12, 0.17, ((i % 2) - 0.5) * 0.15);
        blade.rotation.z = (i - 1.5) * 0.15;
        group.add(blade);
      }
    } else if (type === 'workbench') {
      const woodMat = this.createCurvedMaterial({ color: '#b07d4f' });
      const topMat = this.createCurvedMaterial({ color: '#d4a373' });
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.55, 0.62), woodMat);
      base.position.y = 0.28;
      base.castShadow = true;
      group.add(base);

      const top = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.72), topMat);
      top.position.y = 0.6;
      top.castShadow = true;
      group.add(top);

      const toolRack = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.45, 0.08), woodMat);
      toolRack.position.set(0, 0.85, -0.28);
      group.add(toolRack);
    } else if (type === 'nooks_cranny') {
      const wallMat = this.createCurvedMaterial({ color: '#fefae0' });
      const roofMat = this.createCurvedMaterial({ color: '#e07a5f' });
      const signMat = this.createCurvedMaterial({ color: '#2a9d8f' });
      const winMat = this.createCurvedMaterial({
        color: '#fff3b0',
        emissive: '#ffd166',
        emissiveIntensity: 0.2,
      });
      this.nightWindowMaterials.push(winMat);

      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.55, 1.9), wallMat);
      body.position.y = 0.78;
      body.castShadow = true;
      group.add(body);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 0.95, 4), roofMat);
      roof.position.y = 1.95;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);

      const awning = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.55), signMat);
      awning.position.set(0, 1.15, 1.05);
      group.add(awning);

      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.88, 0.08),
        this.createCurvedMaterial({ color: '#6f4e37' })
      );
      door.position.set(0, 0.45, 0.96);
      group.add(door);

      const windowLeft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.08), winMat);
      windowLeft.position.set(-0.68, 0.72, 0.96);
      group.add(windowLeft);

      const windowRight = windowLeft.clone();
      windowRight.position.x = 0.68;
      group.add(windowRight);
    } else if (type === 'villager_house') {
      const roofColor =
        villagerOwnerId === 'maple' ? '#d9534f' : villagerOwnerId === 'marshal' ? '#457b9d' : '#f4a261';
      const wallMat = this.createCurvedMaterial({ color: '#fff8eb' });
      const roofMat = this.createCurvedMaterial({ color: roofColor });
      const winMat = this.createCurvedMaterial({
        color: '#fffae5',
        emissive: '#ffcf56',
        emissiveIntensity: 0.25,
      });
      this.nightWindowMaterials.push(winMat);

      const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.35, 1.55), wallMat);
      body.position.y = 0.68;
      body.castShadow = true;
      group.add(body);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.42, 0.88, 4), roofMat);
      roof.position.y = 1.75;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);

      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.78, 0.08),
        this.createCurvedMaterial({ color: roofColor })
      );
      door.position.set(0, 0.4, 0.78);
      group.add(door);

      const win = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.08), winMat);
      win.position.set(0.5, 0.68, 0.78);
      group.add(win);
    } else {
      // Crafted Placeable Furniture
      if (itemId === 'campfire') {
        const logMat = this.createCurvedMaterial({ color: '#6c462b' });
        for (let i = 0; i < 4; i++) {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.65, 6), logMat);
          log.position.y = 0.1;
          log.rotation.z = Math.PI / 2;
          log.rotation.y = (i * Math.PI) / 4;
          group.add(log);
        }
        const fireMat = this.createCurvedMaterial({
          color: '#ff7b00',
          emissive: '#ff5400',
          emissiveIntensity: 0.9,
        });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 7), fireMat);
        flame.position.y = 0.35;
        group.add(flame);
      } else if (itemId === 'log_bench') {
        const seatMat = this.createCurvedMaterial({ color: '#a97142' });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.32, 0.44), seatMat);
        seat.position.y = 0.22;
        seat.castShadow = true;
        group.add(seat);
      } else if (itemId === 'garden_lantern') {
        const stoneMat = this.createCurvedMaterial({ color: '#9ca3af' });
        const glowMat = this.createCurvedMaterial({
          color: '#fef08a',
          emissive: '#facc15',
          emissiveIntensity: 0.85,
        });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.35, 8), stoneMat);
        base.position.y = 0.17;
        group.add(base);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.24), glowMat);
        lamp.position.y = 0.48;
        group.add(lamp);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 4), stoneMat);
        cap.position.y = 0.68;
        cap.rotation.y = Math.PI / 4;
        group.add(cap);
      } else if (itemId === 'zen_fountain') {
        const stoneMat = this.createCurvedMaterial({ color: '#cbd5e1' });
        const waterMat = this.createCurvedMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.3 });
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 0.32, 12), stoneMat);
        basin.position.y = 0.16;
        group.add(basin);
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.34, 12), waterMat);
        pool.position.y = 0.17;
        group.add(pool);
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.72, 10), stoneMat);
        pillar.position.y = 0.38;
        group.add(pillar);
      } else {
        // Picnic set
        const blanketMat = this.createCurvedMaterial({ color: '#ef4444' });
        const basketMat = this.createCurvedMaterial({ color: '#d97706' });
        const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.04, 0.88), blanketMat);
        blanket.position.y = 0.02;
        group.add(blanket);
        const basket = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.26), basketMat);
        basket.position.set(0.1, 0.16, 0);
        group.add(basket);
      }
    }

    return { mesh: group, fruitMeshes };
  }

  public spawnDroppedLoot(itemId: string, name: string, icon: string, tileX: number, tileZ: number): DroppedLoot {
    const uid = `loot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const y = this.getSurfaceHeight(tileX + 0.5, tileZ + 0.5);

    const colorMap: Record<string, string> = {
      apple: '#e63946',
      orange: '#f77f00',
      coconut: '#6f4e37',
      softwood: '#d4a373',
      hardwood: '#7f4f24',
      stone: '#94a3b8',
      iron_nugget: '#38bdf8',
      weeds: '#52b788',
      amber_fossil: '#f59e0b',
      trex_skull: '#3b82f6',
      trilobite: '#6366f1',
      bells_bag: '#facc15',
    };

    const mat = this.createCurvedMaterial({
      color: colorMap[itemId] || '#facc15',
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 1), mat);
    const worldPos = new THREE.Vector3(tileX + 0.5, y + 0.26, tileZ + 0.5);
    mesh.position.copy(worldPos);
    mesh.castShadow = true;
    this.rootGroup.add(mesh);

    const loot: DroppedLoot = {
      uid,
      itemId,
      name,
      icon,
      tileX,
      tileZ,
      worldPos,
      mesh,
      bobOffset: Math.random() * Math.PI * 2,
    };
    this.droppedLoots.set(uid, loot);
    return loot;
  }

  public removeDroppedLoot(uid: string): void {
    const loot = this.droppedLoots.get(uid);
    if (!loot) return;
    this.rootGroup.remove(loot.mesh);
    this.droppedLoots.delete(uid);
  }

  public update(elapsedSeconds: number, isNight: boolean): void {
    // Animate dropped loot gentle bobbing & spinning
    this.droppedLoots.forEach((loot) => {
      loot.mesh.rotation.y = elapsedSeconds * 1.8 + loot.bobOffset;
      loot.mesh.position.y = loot.worldPos.y + Math.sin(elapsedSeconds * 3.2 + loot.bobOffset) * 0.06;
    });

    // Animate waterfall shimmer
    this.waterfallParticles.forEach((wf, idx) => {
      wf.scale.x = 0.96 + Math.sin(elapsedSeconds * 8 + idx) * 0.05;
    });

    // Glow house & shop windows brightly at night
    const targetEmissive = isNight ? 1.15 : 0.15;
    this.nightWindowMaterials.forEach((mat) => {
      mat.emissiveIntensity = targetEmissive;
    });
  }
}
