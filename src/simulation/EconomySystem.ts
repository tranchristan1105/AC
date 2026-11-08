export type TurnipPattern = 'Large Spike' | 'Small Spike' | 'Fluctuating' | 'Decreasing';

export interface NookMilesTask {
  id: string;
  title: string;
  icon: string;
  progress: number;
  target: number;
  milesReward: number;
  completed: boolean;
}

export interface TurnipPriceSlot {
  label: string;
  price: number;
}

/**
 * Reverse-Engineered Animal Crossing Dual-Currency Economy & Stalk Market Simulator.
 */
export class EconomySystem {
  public bells = 2500;
  public miles = 600;
  public homeLoanRemaining = 19800;
  public homeLevel = 1;

  public turnipBuyPrice = 98;
  public turnipPattern: TurnipPattern = 'Large Spike';
  public turnipWeeklySlots: TurnipPriceSlot[] = [];
  public currentSlotIndex = 4; // Wednesday AM (right near the spike!)

  public milesTasks: NookMilesTask[] = [
    {
      id: 'catch_fish',
      title: 'Angling for Success (Catch 2 Fish)',
      icon: '🎣',
      progress: 0,
      target: 2,
      milesReward: 200,
      completed: false,
    },
    {
      id: 'catch_bug',
      title: 'Bug Catcher (Catch 2 Insects)',
      icon: '🦋',
      progress: 0,
      target: 2,
      milesReward: 200,
      completed: false,
    },
    {
      id: 'harvest_fruit',
      title: 'Orchard Harvester (Pick 3 Fruits)',
      icon: '🍎',
      progress: 0,
      target: 3,
      milesReward: 150,
      completed: false,
    },
    {
      id: 'talk_villager',
      title: 'Island Hospitality (Chat with Neighbors)',
      icon: '💬',
      progress: 0,
      target: 2,
      milesReward: 150,
      completed: false,
    },
    {
      id: 'dig_fossil',
      title: 'Paleontologist (Unearth a Fossil)',
      icon: '🦴',
      progress: 0,
      target: 1,
      milesReward: 250,
      completed: false,
    },
    {
      id: 'craft_item',
      title: 'DIY Artisan (Craft 1 Item at Workbench)',
      icon: '🔨',
      progress: 0,
      target: 1,
      milesReward: 300,
      completed: false,
    },
  ];

  constructor() {
    this.generateTurnipWeek('Large Spike');
  }

  /**
   * Simulates the 4-pattern Markov price curve from Animal Crossing: New Horizons.
   */
  public generateTurnipWeek(pattern: TurnipPattern): void {
    this.turnipPattern = pattern;
    const base = this.turnipBuyPrice;
    const labels = [
      'Mon AM',
      'Mon PM',
      'Tue AM',
      'Tue PM',
      'Wed AM',
      'Wed PM',
      'Thu AM',
      'Thu PM',
      'Fri AM',
      'Fri PM',
      'Sat AM',
      'Sat PM',
    ];

    let multipliers: number[] = [];
    if (pattern === 'Large Spike') {
      multipliers = [0.88, 0.84, 0.79, 1.18, 1.85, 4.95, 1.92, 1.12, 0.74, 0.68, 0.62, 0.55];
    } else if (pattern === 'Small Spike') {
      multipliers = [0.82, 0.77, 0.73, 1.15, 1.48, 1.96, 1.54, 1.18, 0.85, 0.78, 0.71, 0.65];
    } else if (pattern === 'Fluctuating') {
      multipliers = [1.14, 1.28, 0.78, 0.72, 1.34, 1.18, 0.69, 0.82, 1.38, 1.22, 0.76, 0.88];
    } else {
      // Decreasing
      multipliers = [0.89, 0.85, 0.81, 0.76, 0.72, 0.68, 0.63, 0.59, 0.54, 0.5, 0.45, 0.41];
    }

    this.turnipWeeklySlots = labels.map((label, idx) => ({
      label,
      price: Math.round(base * multipliers[idx]),
    }));
  }

  public getCurrentTurnipSellPrice(): number {
    return this.turnipWeeklySlots[this.currentSlotIndex]?.price ?? 100;
  }

  public recordTaskProgress(taskId: string, amount = 1): NookMilesTask | null {
    const task = this.milesTasks.find((t) => t.id === taskId);
    if (!task || task.completed) return null;

    task.progress = Math.min(task.target, task.progress + amount);
    if (task.progress >= task.target) {
      task.completed = true;
      this.miles += task.milesReward;
      return task;
    }
    return null;
  }

  public payHomeLoan(amount: number): { paid: number; upgraded: boolean } {
    const actual = Math.min(this.bells, this.homeLoanRemaining, amount);
    if (actual <= 0) return { paid: 0, upgraded: false };

    this.bells -= actual;
    this.homeLoanRemaining -= actual;
    if (this.homeLoanRemaining <= 0) {
      this.homeLevel++;
      this.homeLoanRemaining = this.homeLevel * 29800;
      return { paid: actual, upgraded: true };
    }
    return { paid: actual, upgraded: false };
  }
}
