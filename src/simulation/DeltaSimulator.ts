import { WorldGrid } from '../engine/WorldGrid';
import { EconomySystem, type TurnipPattern } from './EconomySystem';

export interface DailyRolloverReport {
  fruitsRegrown: number;
  rocksReplenished: number;
  fossilsBuried: number;
  newTurnipSlot: string;
  newTurnipPrice: number;
}

/**
 * Reverse-Engineered Animal Crossing Offline Delta Catch-Up Simulator.
 * Evaluates 05:00 AM rollovers without needing background processes while the app is closed.
 */
export class DeltaSimulator {
  private lastDayKey: string;

  constructor(initialDayKey: string) {
    this.lastDayKey = localStorage.getItem('ac_mobile_last_day_key') || initialDayKey;
    localStorage.setItem('ac_mobile_last_day_key', initialDayKey);
  }

  public checkAndSimulateRollover(
    currentDayKey: string,
    world: WorldGrid,
    economy: EconomySystem
  ): DailyRolloverReport | null {
    if (currentDayKey === this.lastDayKey) {
      return null;
    }
    this.lastDayKey = currentDayKey;
    localStorage.setItem('ac_mobile_last_day_key', currentDayKey);
    return this.triggerDailyRollover(world, economy);
  }

  public triggerDailyRollover(world: WorldGrid, economy: EconomySystem): DailyRolloverReport {
    let fruitsRegrown = 0;
    let rocksReplenished = 0;
    let fossilsBuried = 0;

    // 1. Regrow fruit on harvested fruit trees & reset rock hit counters
    world.objects.forEach((obj) => {
      if (
        (obj.type === 'apple_tree' || obj.type === 'orange_tree' || obj.type === 'palm_tree') &&
        !obj.hasFruit
      ) {
        obj.hasFruit = true;
        obj.fruitMeshes?.forEach((m) => (m.visible = true));
        fruitsRegrown++;
      }
      if (obj.type === 'rock') {
        obj.hitsRemaining = 5;
        rocksReplenished++;
      }
      if (obj.type === 'cedar_tree' || obj.type === 'apple_tree' || obj.type === 'orange_tree') {
        obj.hitsRemaining = 3;
      }
    });

    // 2. Ensure at least 4 buried fossils and 1 glowing money spot exist on the island
    const existingFossils = Array.from(world.objects.values()).filter((o) => o.type === 'fossil_spot').length;
    const neededFossils = Math.max(0, 4 - existingFossils);

    for (let i = 0; i < neededFossils; i++) {
      for (let attempt = 0; attempt < 25; attempt++) {
        const tx = Math.floor(9 + Math.random() * 30);
        const tz = Math.floor(12 + Math.random() * 24);
        const tile = world.getTile(tx, tz);
        if (tile && tile.terrain === 'grass' && !tile.object) {
          world.spawnObject('fossil_spot', 'Buried Fossil', tx, tz);
          fossilsBuried++;
          break;
        }
      }
    }

    const hasGlow = Array.from(world.objects.values()).some((o) => o.type === 'glowing_spot');
    if (!hasGlow) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const tx = Math.floor(10 + Math.random() * 26);
        const tz = Math.floor(14 + Math.random() * 20);
        const tile = world.getTile(tx, tz);
        if (tile && tile.terrain === 'grass' && !tile.object) {
          world.spawnObject('glowing_spot', 'Glowing Money Spot', tx, tz);
          break;
        }
      }
    }

    // 3. Advance Stalk Market price slot (or roll new weekly pattern on wrap)
    economy.currentSlotIndex = (economy.currentSlotIndex + 1) % economy.turnipWeeklySlots.length;
    if (economy.currentSlotIndex === 0) {
      const patterns: TurnipPattern[] = ['Large Spike', 'Small Spike', 'Fluctuating', 'Decreasing'];
      economy.generateTurnipWeek(patterns[Math.floor(Math.random() * patterns.length)]);
    }

    const slot = economy.turnipWeeklySlots[economy.currentSlotIndex];
    return {
      fruitsRegrown,
      rocksReplenished,
      fossilsBuried,
      newTurnipSlot: slot.label,
      newTurnipPrice: slot.price,
    };
  }
}
