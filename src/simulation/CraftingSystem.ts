import itemsData from '../data/items.json';
import crittersData from '../data/critters.json';

export interface ItemDef {
  id: string;
  name: string;
  category: 'fruit' | 'material' | 'fossil' | 'turnip' | 'furniture' | 'fish' | 'bug';
  sellPrice: number;
  buyPrice: number;
  icon: string;
  placeable?: boolean;
  description: string;
}

export interface RecipeIngredient {
  itemId: string;
  count: number;
}

export interface RecipeDef {
  id: string;
  resultItemId: string;
  name: string;
  icon: string;
  ingredients: RecipeIngredient[];
}

export interface InventorySlot {
  itemId: string;
  count: number;
}

/**
 * Reverse-Engineered Animal Crossing Pocket Inventory & DIY Crafting Engine.
 */
export class CraftingSystem {
  public readonly itemRegistry: Map<string, ItemDef> = new Map();
  public readonly recipes: RecipeDef[] = itemsData.recipes as RecipeDef[];
  public readonly slots: InventorySlot[] = [];
  public readonly maxSlots = 16;

  constructor() {
    (itemsData.items as ItemDef[]).forEach((item) => {
      this.itemRegistry.set(item.id, item);
    });

    // Register all fish & bugs as sellable pocket items too
    crittersData.forEach((c) => {
      this.itemRegistry.set(c.id, {
        id: c.id,
        name: c.name,
        category: c.category as 'fish' | 'bug',
        sellPrice: c.bellValue,
        buyPrice: 0,
        icon: c.icon,
        placeable: false,
        description: c.catchPun,
      });
    });

    // Starter pocket contents so the player can immediately craft, decorate, or gift
    this.addItem('apple', 2);
    this.addItem('softwood', 3);
    this.addItem('hardwood', 3);
    this.addItem('stone', 2);
    this.addItem('iron_nugget', 1);
    this.addItem('garden_lantern', 1);
  }

  public getItemDef(itemId: string): ItemDef | undefined {
    return this.itemRegistry.get(itemId);
  }

  public getItemCount(itemId: string): number {
    return this.slots.filter((s) => s.itemId === itemId).reduce((acc, s) => acc + s.count, 0);
  }

  public addItem(itemId: string, count = 1): boolean {
    const existing = this.slots.find((s) => s.itemId === itemId && s.count < 30);
    if (existing) {
      existing.count += count;
      return true;
    }
    if (this.slots.length >= this.maxSlots) {
      return false;
    }
    this.slots.push({ itemId, count });
    return true;
  }

  public removeItem(itemId: string, count = 1): boolean {
    const total = this.getItemCount(itemId);
    if (total < count) return false;

    let remaining = count;
    for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i--) {
      if (this.slots[i].itemId === itemId) {
        const take = Math.min(this.slots[i].count, remaining);
        this.slots[i].count -= take;
        remaining -= take;
        if (this.slots[i].count <= 0) {
          this.slots.splice(i, 1);
        }
      }
    }
    return true;
  }

  public canCraft(recipe: RecipeDef): boolean {
    return recipe.ingredients.every((ing) => this.getItemCount(ing.itemId) >= ing.count);
  }

  public craft(recipe: RecipeDef): ItemDef | null {
    if (!this.canCraft(recipe)) return null;
    recipe.ingredients.forEach((ing) => {
      this.removeItem(ing.itemId, ing.count);
    });
    this.addItem(recipe.resultItemId, 1);
    return this.getItemDef(recipe.resultItemId) || null;
  }
}
