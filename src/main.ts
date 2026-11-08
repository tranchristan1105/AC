import './style.css';
import * as THREE from 'three';
import { RollingWorldShader } from './engine/RollingWorldShader';
import { WorldGrid, type PlacedObject, type DroppedLoot } from './engine/WorldGrid';
import { RealTimeClock } from './engine/RealTimeClock';
import { AudioSynthesizer } from './engine/AudioSynthesizer';
import { InputController, type ToolType } from './engine/InputController';
import { CritterSpawner } from './simulation/CritterSpawner';
import { VillagerAI, type ActiveVillager } from './simulation/VillagerAI';
import { EconomySystem } from './simulation/EconomySystem';
import { CraftingSystem } from './simulation/CraftingSystem';
import { DeltaSimulator } from './simulation/DeltaSimulator';
import { UIManager } from './ui/UIManager';

class AnimalCrossingMobileApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly clockEngine = new RealTimeClock();
  private readonly audio = new AudioSynthesizer();
  private readonly input = new InputController();
  private readonly world: WorldGrid;
  private readonly critters: CritterSpawner;
  private readonly villagers: VillagerAI;
  private readonly economy = new EconomySystem();
  private readonly crafting = new CraftingSystem();
  private readonly deltaSim: DeltaSimulator;
  private readonly ui: UIManager;

  private readonly ambientLight: THREE.AmbientLight;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly rainParticles: THREE.Points;

  // Player state
  private readonly playerGroup = new THREE.Group();
  private playerLeftLeg!: THREE.Object3D;
  private playerRightLeg!: THREE.Object3D;
  private playerLeftArm!: THREE.Object3D;
  private playerRightArm!: THREE.Object3D;
  private playerToolSlot = new THREE.Group();
  private playerPos = new THREE.Vector3(21.5, 1.1, 22.5);
  private playerHeading = 0;
  private stepDistanceAccumulator = 0;
  private toolSwingTimer = 0;

  private lastFrameTime = performance.now();
  private elapsedSeconds = 0;
  private lastBgmHour = -1;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#6db9f2');

    // Authentic Animal Crossing ~38° elevated camera with narrow FOV
    this.camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.5, 95);

    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.8);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight('#fff8e7', 1.2);
    this.dirLight.position.set(16, 26, 18);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 65;
    const d = 16;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    this.world = new WorldGrid(this.scene);
    this.critters = new CritterSpawner(this.world);
    this.villagers = new VillagerAI(this.world);
    this.deltaSim = new DeltaSimulator(this.clockEngine.getIslandDayKey());

    this.buildPlayerCharacter();
    this.rainParticles = this.createRainParticles();
    this.scene.add(this.rainParticles);

    this.ui = new UIManager(
      this.audio,
      this.clockEngine,
      this.world,
      this.critters,
      this.economy,
      this.crafting,
      this.deltaSim,
      {
        onPlaceFurniture: (itemId) => this.placeFurnitureInFront(itemId),
        onPickupNearestFurniture: () => this.pickupNearestFurniture(),
        onDeliverVillagerGift: (v) => this.deliverGiftToVillager(v),
        onWeatherOrTimeChanged: () => this.syncAtmosphere(),
      }
    );

    this.bindControlsAndEvents();
    this.syncAtmosphere();
    this.ui.updateHUD();

    // Check offline 5:00 AM daily rollover catch-up on launch
    const rollover = this.deltaSim.checkAndSimulateRollover(
      this.clockEngine.getIslandDayKey(),
      this.world,
      this.economy
    );
    if (rollover) {
      this.ui.showToast(`🌅 Welcome back! ${rollover.fruitsRegrown} fruit trees refreshed for the new day!`);
    } else {
      this.ui.showToast('🏝️ Welcome to Nook Isle! Walk with the thumbstick or WASD, or tap objects!');
    }

    requestAnimationFrame((t) => this.animate(t));
  }

  private buildPlayerCharacter(): void {
    const skinMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#ffdbb5', roughness: 0.75 })
    );
    const shirtMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#2ec4b6', roughness: 0.8 })
    );
    const shortsMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#3a506b', roughness: 0.85 })
    );
    const hatMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#f4d35e', roughness: 0.85 })
    );
    const ribbonMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#e63946' })
    );
    const eyeMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#1d2d44' })
    );

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.075, 0.18, 4, 8);
    this.playerLeftLeg = new THREE.Mesh(legGeo, shortsMat);
    this.playerLeftLeg.position.set(-0.11, 0.16, 0);
    this.playerGroup.add(this.playerLeftLeg);

    this.playerRightLeg = new THREE.Mesh(legGeo, shortsMat);
    this.playerRightLeg.position.set(0.11, 0.16, 0);
    this.playerGroup.add(this.playerRightLeg);

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.27, 0.46, 10), shirtMat);
    torso.position.y = 0.44;
    torso.castShadow = true;
    this.playerGroup.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 14), skinMat);
    head.position.y = 0.84;
    head.castShadow = true;
    this.playerGroup.add(head);

    // Eyes & Rosy Nose (Animal Crossing triangle/round nose!)
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), eyeMat);
    leftEye.position.set(-0.095, 0.85, 0.255);
    this.playerGroup.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.x = 0.095;
    this.playerGroup.add(rightEye);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.08, 6), ribbonMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.81, 0.28);
    this.playerGroup.add(nose);

    // Straw Boater Hat
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), hatMat);
    brim.position.y = 1.04;
    brim.castShadow = true;
    this.playerGroup.add(brim);

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.18, 14), hatMat);
    crown.position.y = 1.13;
    this.playerGroup.add(crown);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.05, 14), ribbonMat);
    band.position.y = 1.08;
    this.playerGroup.add(band);

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.065, 0.22, 4, 8);
    this.playerLeftArm = new THREE.Mesh(armGeo, skinMat);
    this.playerLeftArm.position.set(-0.27, 0.48, 0);
    this.playerLeftArm.rotation.z = 0.22;
    this.playerGroup.add(this.playerLeftArm);

    this.playerRightArm = new THREE.Mesh(armGeo, skinMat);
    this.playerRightArm.position.set(0.27, 0.48, 0);
    this.playerRightArm.rotation.z = -0.22;
    this.playerRightArm.add(this.playerToolSlot);
    this.playerToolSlot.position.set(0, -0.1, 0.12);
    this.playerGroup.add(this.playerRightArm);

    this.playerPos.y = this.world.getSurfaceHeight(this.playerPos.x, this.playerPos.z);
    this.playerGroup.position.copy(this.playerPos);
    this.world.rootGroup.add(this.playerGroup);
  }

  private updateHeldToolMesh(tool: ToolType): void {
    this.playerToolSlot.clear();
    if (tool === 'hand') return;

    const handleMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#8d5524' })
    );
    const metalMat = RollingWorldShader.applyToMaterial(
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.4, roughness: 0.3 })
    );

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), handleMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.2;
    this.playerToolSlot.add(handle);

    if (tool === 'axe' || tool === 'shovel') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.22), metalMat);
      blade.position.z = 0.48;
      this.playerToolSlot.add(blade);
    } else if (tool === 'net') {
      const hoop = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.025, 6, 14),
        RollingWorldShader.applyToMaterial(new THREE.MeshStandardMaterial({ color: '#f8fafc' }))
      );
      hoop.position.z = 0.62;
      this.playerToolSlot.add(hoop);
    } else if (tool === 'rod') {
      const rodExt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.75, 6), handleMat);
      rodExt.rotation.x = Math.PI / 2;
      rodExt.position.z = 0.55;
      this.playerToolSlot.add(rodExt);
    } else if (tool === 'watering_can') {
      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 0.24, 8),
        RollingWorldShader.applyToMaterial(new THREE.MeshStandardMaterial({ color: '#38bdf8' }))
      );
      can.position.z = 0.35;
      this.playerToolSlot.add(can);
    } else if (tool === 'brush') {
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.2, 8),
        RollingWorldShader.applyToMaterial(new THREE.MeshStandardMaterial({ color: '#ec4899' }))
      );
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.52;
      this.playerToolSlot.add(tip);
    }
  }

  private createRainParticles(): THREE.Points {
    const count = 350;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = Math.random() * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: '#bae6fd',
      size: 0.12,
      transparent: true,
      opacity: 0.7,
    });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    return pts;
  }

  private bindControlsAndEvents(): void {
    const joystickZone = document.getElementById('joystick-zone')!;
    const joystickStick = document.getElementById('joystick-stick')!;
    const actionBtn = document.getElementById('btn-primary-action')!;

    this.input.bindUIElements(
      joystickZone,
      joystickStick,
      actionBtn,
      () => this.executePrimaryAction(),
      (tool) => {
        this.audio.playSfx('pop');
        this.updateHeldToolMesh(tool);
        document.querySelectorAll('.tool-btn').forEach((btn) => {
          btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === tool);
        });
      }
    );

    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = (btn as HTMLElement).dataset.tool as ToolType;
        if (tool) {
          this.input.setTool(tool);
        }
      });
    });

    // Tap on 3D Canvas to walk or interact
    this.canvas.addEventListener('pointerdown', (e) => {
      // Ensure WebAudio starts on first user gesture
      if (this.lastBgmHour === -1) {
        const atm = this.clockEngine.getAtmosphere();
        this.lastBgmHour = atm.hour;
        this.audio.startHourlyBgm(atm.hour);
      }

      // Project tap onto player's horizontal ground plane
      const rect = this.canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.playerPos.y);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, hit)) {
        // Analytical inverse adjustment for rolling-log Z curve
        const dz = Math.max(0, Math.abs(hit.z - this.playerPos.z) - 3.5);
        hit.z -= RollingWorldShader.getCurveStrength() * dz * 1.4;

        const dist = Math.hypot(hit.x - this.playerPos.x, hit.z - this.playerPos.z);
        if (dist < 1.85) {
          // Face the tapped spot and trigger primary context action
          this.playerHeading = Math.atan2(hit.x - this.playerPos.x, hit.z - this.playerPos.z);
          this.playerGroup.rotation.y = this.playerHeading;
          this.executePrimaryAction();
        } else {
          this.input.tapTargetWorld = hit;
        }
      }
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private getTargetObjectInFront(): PlacedObject | null {
    const reach = 1.25;
    const tx = Math.floor(this.playerPos.x + Math.sin(this.playerHeading) * reach);
    const tz = Math.floor(this.playerPos.z + Math.cos(this.playerHeading) * reach);
    const directTile = this.world.getTile(tx, tz);
    if (directTile?.object) return directTile.object;

    // Also check immediate 1.6m radius around player
    let closest: PlacedObject | null = null;
    let minDist = 1.65;
    this.world.objects.forEach((obj) => {
      const d = Math.hypot(obj.tileX + 0.5 - this.playerPos.x, obj.tileZ + 0.5 - this.playerPos.z);
      if (d < minDist) {
        minDist = d;
        closest = obj;
      }
    });
    return closest;
  }

  private getNearestDroppedLoot(): DroppedLoot | null {
    let closest: DroppedLoot | null = null;
    let minDist = 1.6;
    this.world.droppedLoots.forEach((loot) => {
      const d = Math.hypot(loot.worldPos.x - this.playerPos.x, loot.worldPos.z - this.playerPos.z);
      if (d < minDist) {
        minDist = d;
        closest = loot;
      }
    });
    return closest;
  }

  private evaluateContextAction(): {
    label: string;
    icon: string;
    worldTargetPos: THREE.Vector3 | null;
  } {
    // 1. Active Fishing Bobber
    if (this.critters.fishing.active) {
      const isBiting = this.critters.fishing.targetFish?.state === 'biting';
      return {
        label: isBiting ? 'REEL IN NOW!' : 'Cancel Line',
        icon: isBiting ? '🐟' : '🎣',
        worldTargetPos: this.critters.fishing.bobberPos.clone(),
      };
    }

    // 2. Nearby Dropped Loot
    const loot = this.getNearestDroppedLoot();
    if (loot) {
      return {
        label: `Pick Up ${loot.name}`,
        icon: loot.icon,
        worldTargetPos: loot.worldPos.clone(),
      };
    }

    // 3. Nearby Villager
    const villager = this.villagers.getNearestVillager(this.playerPos, 2.0);
    if (villager) {
      return {
        label: `Talk to ${villager.def.name}`,
        icon: '💬',
        worldTargetPos: villager.position.clone().add(new THREE.Vector3(0, 1.25, 0)),
      };
    }

    // 4. Tool-specific or Object-specific interactions
    const obj = this.getTargetObjectInFront();
    if (obj) {
      const objPos = new THREE.Vector3(
        obj.tileX + 0.5,
        this.world.getSurfaceHeight(obj.tileX + 0.5, obj.tileZ + 0.5) + 1.2,
        obj.tileZ + 0.5
      );
      if (obj.type === 'workbench') {
        return { label: 'DIY Craft', icon: '🔨', worldTargetPos: objPos };
      }
      if (obj.type === 'nooks_cranny') {
        return { label: "Nook's Shop", icon: '🏪', worldTargetPos: objPos };
      }
      if (obj.type === 'fossil_spot' || obj.type === 'glowing_spot') {
        return { label: 'Dig Spot', icon: '⛏️', worldTargetPos: objPos };
      }
      if (obj.type === 'rock') {
        return { label: 'Strike Rock', icon: '⛏️', worldTargetPos: objPos };
      }
      if (obj.type === 'apple_tree' || obj.type === 'orange_tree' || obj.type === 'palm_tree' || obj.type === 'cedar_tree') {
        if (this.input.activeTool === 'axe') {
          return { label: 'Chop Wood', icon: '🪓', worldTargetPos: objPos };
        }
        if (obj.hasFruit) {
          return { label: 'Shake Tree', icon: '🍎', worldTargetPos: objPos };
        }
      }
      if (obj.type === 'weed') {
        return { label: 'Pluck Weeds', icon: '🌿', worldTargetPos: objPos };
      }
      if (obj.type === 'flower' && this.input.activeTool === 'watering_can') {
        return { label: 'Water Flower', icon: '🚿', worldTargetPos: objPos };
      }
    }

    // 5. Fallback to active tool action
    const toolIcons: Record<ToolType, { icon: string; label: string }> = {
      hand: { icon: '🖐️', label: 'Interact' },
      axe: { icon: '🪓', label: 'Swing Axe' },
      shovel: { icon: '⛏️', label: 'Dig / Strike' },
      rod: { icon: '🎣', label: 'Cast Line' },
      net: { icon: '🦋', label: 'Swing Net' },
      watering_can: { icon: '🚿', label: 'Water' },
      brush: { icon: '🎨', label: 'Paint Path' },
    };
    const fallback = toolIcons[this.input.activeTool];
    return { label: fallback.label, icon: fallback.icon, worldTargetPos: null };
  }

  private executePrimaryAction(): void {
    this.toolSwingTimer = 0.28;

    // 1. Active Fishing Reel / Cancel
    if (this.critters.fishing.active) {
      const caught = this.critters.tryReelIn();
      if (caught) {
        this.audio.playSfx('fanfare');
        this.crafting.addItem(caught.id, 1);
        const task = this.economy.recordTaskProgress('catch_fish', 1);
        if (task) {
          this.ui.showToast(`✈️ Nook Miles+ Complete: ${task.title} (+${task.milesReward} Miles!)`);
        }
        this.ui.updateHUD();
        this.ui.openShowcaseBanner(`${caught.icon} Caught ${caught.name}!`, caught.catchPun);
      } else {
        this.audio.playSfx('splash');
        this.ui.showToast('Reeled in the fishing line.');
      }
      return;
    }

    // 2. Pick Up Dropped Loot
    const loot = this.getNearestDroppedLoot();
    if (loot) {
      this.world.removeDroppedLoot(loot.uid);
      if (loot.itemId === 'bells_bag') {
        this.economy.bells += 1000;
        this.audio.playSfx('bells');
        this.ui.showToast('💰 Picked up 1,000 Bells!');
      } else if (this.crafting.addItem(loot.itemId, 1)) {
        this.audio.playSfx('pop');
        this.ui.showToast(`${loot.icon} Added ${loot.name} to Pocket!`);
        if (['apple', 'orange', 'coconut'].includes(loot.itemId)) {
          const task = this.economy.recordTaskProgress('harvest_fruit', 1);
          if (task) {
            this.ui.showToast(`✈️ Nook Miles+ Complete: ${task.title} (+${task.milesReward} Miles!)`);
          }
        }
      } else {
        this.ui.showToast('Your Pocket is full! Sell or place items first.');
      }
      this.ui.updateHUD();
      return;
    }

    // 3. Talk to Nearby Villager
    const villager = this.villagers.getNearestVillager(this.playerPos, 2.0);
    if (villager) {
      villager.state = 'talking';
      const atm = this.clockEngine.getAtmosphere();
      const task = this.economy.recordTaskProgress('talk_villager', 1);
      if (task) {
        this.ui.showToast(`✈️ Nook Miles+ Complete: ${task.title} (+${task.milesReward} Miles!)`);
        this.ui.updateHUD();
      }
      const openNextLine = () => {
        const dlg = this.villagers.generateDialogue(villager, atm.period);
        this.ui.openVillagerDialogue(
          villager,
          dlg.text,
          () => openNextLine(),
          () => {
            villager.state = 'idle';
          }
        );
      };
      openNextLine();
      return;
    }

    // 4. Custom Design Path Brush
    if (this.input.activeTool === 'brush') {
      const tx = Math.floor(this.playerPos.x);
      const tz = Math.floor(this.playerPos.z);
      const painted = this.world.paintCustomTile(tx, tz);
      this.audio.playSfx('pop');
      this.ui.showToast(painted ? '🎨 Stamped Custom Pixel Path!' : 'Cleared Custom Path tile.');
      return;
    }

    // 5. Bug Net Swing
    if (this.input.activeTool === 'net') {
      this.audio.playSfx('chop');
      const caughtBug = this.critters.tryCatchBugNear(this.playerPos, this.playerHeading);
      if (caughtBug) {
        this.audio.playSfx('fanfare');
        this.crafting.addItem(caughtBug.id, 1);
        const task = this.economy.recordTaskProgress('catch_bug', 1);
        if (task) {
          this.ui.showToast(`✈️ Nook Miles+ Complete: ${task.title} (+${task.milesReward} Miles!)`);
        }
        this.ui.updateHUD();
        this.ui.openShowcaseBanner(`${caughtBug.icon} Caught ${caughtBug.name}!`, caughtBug.catchPun);
      }
      return;
    }

    // 6. Fishing Rod Cast
    if (this.input.activeTool === 'rod') {
      const casted = this.critters.castBobber(
        this.playerPos,
        this.playerHeading,
        () => {
          this.audio.playSfx('nibble');
        },
        () => {
          this.audio.playSfx('splash');
          this.ui.showToast('🐟 BITE! Tap [A] / Reel In NOW!');
        }
      );
      if (casted) {
        this.audio.playSfx('splash');
        this.ui.showToast('🎣 Cast bobber! Wait for the fish to bite...');
      } else {
        this.ui.showToast('Face the river or ocean shoreline to cast your Fishing Rod!');
      }
      return;
    }

    // 7. World Object Interactions (Workbench, Nook's Cranny, Trees, Rocks, Fossils, Weeds)
    const obj = this.getTargetObjectInFront();
    if (!obj) return;

    if (obj.type === 'workbench') {
      this.audio.playSfx('pop');
      this.ui.openModal('diy');
      return;
    }

    if (obj.type === 'nooks_cranny') {
      this.audio.playSfx('bells');
      this.ui.openModal('shop');
      return;
    }

    if (obj.type === 'weed') {
      this.audio.playSfx('pop');
      this.world.removeObject(obj);
      this.crafting.addItem('weeds', 1);
      this.ui.showToast('🌿 Plucked Clump of Weeds!');
      return;
    }

    if (obj.type === 'flower' && this.input.activeTool === 'watering_can') {
      this.audio.playSfx('splash');
      obj.watered = true;
      this.ui.showToast('🚿 Watered the island flowers! They sparkle in the sun!');
      return;
    }

    if (obj.type === 'fossil_spot' || obj.type === 'glowing_spot') {
      if (this.input.activeTool !== 'shovel') {
        this.input.setTool('shovel');
      }
      this.audio.playSfx('dig');
      this.world.removeObject(obj);

      if (obj.type === 'glowing_spot') {
        this.world.spawnDroppedLoot('bells_bag', '1,000 Bells', '💰', obj.tileX, obj.tileZ);
      } else {
        const fossils = [
          { id: 'trex_skull', name: 'T. Rex Skull', icon: '🦖' },
          { id: 'amber_fossil', name: 'Amber Fossil', icon: '琥' },
          { id: 'trilobite', name: 'Trilobite', icon: '🐚' },
        ];
        const f = fossils[Math.floor(Math.random() * fossils.length)];
        this.world.spawnDroppedLoot(f.id, f.name, f.icon, obj.tileX, obj.tileZ);
        const task = this.economy.recordTaskProgress('dig_fossil', 1);
        if (task) {
          this.ui.showToast(`✈️ Nook Miles+ Complete: ${task.title} (+${task.milesReward} Miles!)`);
          this.ui.updateHUD();
        }
      }
      return;
    }

    if (obj.type === 'rock') {
      if (this.input.activeTool !== 'shovel' && this.input.activeTool !== 'axe') {
        this.input.setTool('shovel');
      }
      if (obj.hitsRemaining <= 0) {
        this.ui.showToast('This rock is depleted for today! Simulate 5 AM Rollover in NookPhone to reset.');
        return;
      }
      obj.hitsRemaining--;
      this.audio.playSfx('rock');
      const offsetTileX = obj.tileX + (Math.random() > 0.5 ? 1 : -1) * 0.65;
      const offsetTileZ = obj.tileZ + 0.65;
      if (Math.random() < 0.42) {
        this.world.spawnDroppedLoot('iron_nugget', 'Iron Nugget', '🔩', offsetTileX, offsetTileZ);
      } else {
        this.world.spawnDroppedLoot('stone', 'Stone', '🪨', offsetTileX, offsetTileZ);
      }
      return;
    }

    if (
      obj.type === 'apple_tree' ||
      obj.type === 'orange_tree' ||
      obj.type === 'palm_tree' ||
      obj.type === 'cedar_tree'
    ) {
      // Tree shake animation
      obj.mesh.rotation.z = 0.09;
      setTimeout(() => (obj.mesh.rotation.z = -0.07), 80);
      setTimeout(() => (obj.mesh.rotation.z = 0), 160);

      if (this.input.activeTool === 'axe') {
        this.audio.playSfx('chop');
        if (obj.hitsRemaining > 0) {
          obj.hitsRemaining--;
          const isHard = Math.random() > 0.5;
          this.world.spawnDroppedLoot(
            isHard ? 'hardwood' : 'softwood',
            isHard ? 'Hardwood' : 'Softwood',
            '🪵',
            obj.tileX + (Math.random() - 0.5) * 1.2,
            obj.tileZ + 0.75
          );
        } else {
          this.ui.showToast('You gathered all the wood from this tree for today!');
        }
      } else if (obj.hasFruit) {
        this.audio.playSfx('pop');
        obj.hasFruit = false;
        obj.fruitMeshes?.forEach((m) => (m.visible = false));
        const fruitInfo =
          obj.type === 'apple_tree'
            ? { id: 'apple', name: 'Apple', icon: '🍎' }
            : obj.type === 'orange_tree'
            ? { id: 'orange', name: 'Orange', icon: '🍊' }
            : { id: 'coconut', name: 'Coconut', icon: '🥥' };

        this.world.spawnDroppedLoot(fruitInfo.id, fruitInfo.name, fruitInfo.icon, obj.tileX - 0.55, obj.tileZ + 0.65);
        this.world.spawnDroppedLoot(fruitInfo.id, fruitInfo.name, fruitInfo.icon, obj.tileX + 0.55, obj.tileZ + 0.65);
      } else {
        this.audio.playSfx('pop');
        this.ui.showToast('Equip the 🪓 Axe to chop wood, or simulate 5 AM Rollover to regrow fruit!');
      }
    }
  }

  private placeFurnitureInFront(itemId: string): boolean {
    const def = this.crafting.getItemDef(itemId);
    if (!def) return false;

    const tx = Math.floor(this.playerPos.x + Math.sin(this.playerHeading) * 1.25);
    const tz = Math.floor(this.playerPos.z + Math.cos(this.playerHeading) * 1.25);
    const tile = this.world.getTile(tx, tz);

    if (!tile || !tile.walkable || tile.object) {
      this.ui.showToast('Move to a clear grass or plaza tile to place furniture!');
      return false;
    }

    const spawned = this.world.spawnObject('furniture', def.name, tx, tz, undefined, itemId, this.playerHeading);
    if (spawned) {
      this.crafting.removeItem(itemId, 1);
      this.audio.playSfx('craft');
      this.ui.showToast(`✨ Placed ${def.name} on the island!`);
      return true;
    }
    return false;
  }

  private pickupNearestFurniture(): boolean {
    let target: PlacedObject | null = null;
    let bestDist = 2.2;
    this.world.objects.forEach((obj) => {
      if (obj.type === 'furniture') {
        const d = Math.hypot(obj.tileX + 0.5 - this.playerPos.x, obj.tileZ + 0.5 - this.playerPos.z);
        if (d < bestDist) {
          bestDist = d;
          target = obj;
        }
      }
    });

    if (!target) {
      this.ui.showToast('Stand next to placed furniture on the island to pick it up!');
      return false;
    }

    const found = target as PlacedObject;
    if (found.itemId && this.crafting.addItem(found.itemId, 1)) {
      this.world.removeObject(found);
      this.audio.playSfx('pop');
      this.ui.showToast(`📦 Picked up ${found.name} into your Pocket!`);
      return true;
    }
    return false;
  }

  private deliverGiftToVillager(v: ActiveVillager): string | null {
    const giftSlot = this.crafting.slots.find((s) => s.itemId !== 'turnips');
    if (!giftSlot) return null;

    const def = this.crafting.getItemDef(giftSlot.itemId);
    this.crafting.removeItem(giftSlot.itemId, 1);
    v.friendship = Math.min(255, v.friendship + 5);
    v.hasQuest = false;

    const rewardBells = Math.max(800, (def?.sellPrice || 300) * 2);
    this.economy.bells += rewardBells;
    this.audio.playSfx('fanfare');
    this.ui.updateHUD();

    return `Oh my goodness! Thank you SO much for the ${def?.name || 'gift'}, ${v.def.catchphrase}! Please take ${rewardBells} Bells as my thank-you gift! (Friendship Lv. ${Math.floor(v.friendship / 35) + 1})`;
  }

  private syncAtmosphere(): void {
    const atm = this.clockEngine.getAtmosphere();
    this.scene.background = atm.skyHorizon;
    this.ambientLight.color.copy(atm.ambientColor);
    this.ambientLight.intensity = atm.ambientIntensity;
    this.dirLight.color.copy(atm.sunColor);
    this.dirLight.intensity = atm.sunIntensity;
    this.rainParticles.visible = atm.weather === 'rain';

    if (atm.hour !== this.lastBgmHour) {
      this.lastBgmHour = atm.hour;
      this.audio.startHourlyBgm(atm.hour);
    }
  }

  private animate(now: number): void {
    requestAnimationFrame((t) => this.animate(t));

    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.elapsedSeconds += dt;

    // 1. Player Movement & Walk Cycle
    const move = this.input.getEffectiveMovement(this.playerPos);
    if (move.lengthSq() > 0.001 && !this.critters.fishing.active) {
      const speed = 4.25;
      const nx = this.playerPos.x + move.x * speed * dt;
      const nz = this.playerPos.z + move.y * speed * dt;

      if (this.world.canWalkTo(nx, this.playerPos.z, this.playerPos.x, this.playerPos.z)) {
        this.playerPos.x = nx;
      }
      if (this.world.canWalkTo(this.playerPos.x, nz, this.playerPos.x, this.playerPos.z)) {
        this.playerPos.z = nz;
      }

      this.playerPos.y = this.world.getSurfaceHeight(this.playerPos.x, this.playerPos.z);
      this.playerHeading = Math.atan2(move.x, move.y);
      this.playerGroup.position.copy(this.playerPos);
      this.playerGroup.position.y += Math.abs(Math.sin(this.elapsedSeconds * 13)) * 0.06;
      this.playerGroup.rotation.y = this.playerHeading;

      const swing = Math.sin(this.elapsedSeconds * 13) * 0.55;
      this.playerLeftLeg.rotation.x = swing;
      this.playerRightLeg.rotation.x = -swing;
      this.playerLeftArm.rotation.x = -swing * 0.7;
      this.playerRightArm.rotation.x = swing * 0.7;

      this.stepDistanceAccumulator += speed * dt;
      if (this.stepDistanceAccumulator > 1.25) {
        this.stepDistanceAccumulator = 0;
        const surface = this.world.getFootstepSurface(this.playerPos.x, this.playerPos.z);
        this.audio.playFootstep(surface);
      }
    } else {
      this.playerGroup.position.copy(this.playerPos);
      this.playerLeftLeg.rotation.x = 0;
      this.playerRightLeg.rotation.x = 0;
      this.playerLeftArm.rotation.x = 0;
      if (this.toolSwingTimer <= 0) {
        this.playerRightArm.rotation.x = 0;
      }
    }

    if (this.toolSwingTimer > 0) {
      this.toolSwingTimer -= dt;
      this.playerRightArm.rotation.x = -Math.sin((this.toolSwingTimer / 0.28) * Math.PI) * 1.5;
    }

    // 2. Update Rolling-Log Horizon Shader Anchor & Smooth Follow Camera
    RollingWorldShader.setFocusZ(this.playerPos.z);
    const targetCamPos = new THREE.Vector3(this.playerPos.x, this.playerPos.y + 8.6, this.playerPos.z + 10.6);
    this.camera.position.lerp(targetCamPos, 0.12);
    this.camera.lookAt(this.playerPos.x, this.playerPos.y + 0.65, this.playerPos.z - 1.5);

    // Move directional shadow frustum with player
    const atm = this.clockEngine.getAtmosphere();
    this.dirLight.position.copy(this.playerPos).add(atm.sunPosition);
    this.dirLight.target.position.copy(this.playerPos);

    // 3. Animate Rain Particles if raining
    if (this.rainParticles.visible) {
      this.rainParticles.position.set(this.playerPos.x, this.playerPos.y, this.playerPos.z);
      const posAttr = this.rainParticles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) - dt * 14;
        if (y < 0) y = 12;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // 4. Update World, Ecology & Villager AI
    this.world.update(this.elapsedSeconds, atm.isNight);
    this.critters.update(dt, this.elapsedSeconds, this.playerPos, atm.hour, atm.weather);
    this.villagers.update(dt, this.elapsedSeconds, this.playerPos);

    // 5. Update Context-Sensitive Floating Prompt & Primary Action Button
    const ctxAction = this.evaluateContextAction();
    const actionIconEl = document.getElementById('action-btn-icon');
    const actionLabelEl = document.getElementById('action-btn-label');
    if (actionIconEl) actionIconEl.textContent = ctxAction.icon;
    if (actionLabelEl) actionLabelEl.textContent = ctxAction.label;

    const promptEl = document.getElementById('world-context-prompt');
    const promptTextEl = document.getElementById('world-context-text');
    if (promptEl && promptTextEl) {
      if (ctxAction.worldTargetPos) {
        const curvedPos = RollingWorldShader.evaluateCurvedPoint(ctxAction.worldTargetPos);
        curvedPos.project(this.camera);
        const sx = (curvedPos.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-curvedPos.y * 0.5 + 0.5) * window.innerHeight;
        promptEl.style.left = `${sx}px`;
        promptEl.style.top = `${sy}px`;
        promptEl.style.opacity = '1';
        promptTextEl.textContent = `${ctxAction.icon} ${ctxAction.label}`;
      } else {
        promptEl.style.opacity = '0';
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

new AnimalCrossingMobileApp();
