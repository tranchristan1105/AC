using System;
using System.Collections.Generic;
using UnityEngine;
using AnimalCrossing.Core;

namespace AnimalCrossing.Economy
{
    /// <summary>
    /// Manages the Player's Pocket Inventory, Bells, Nook Miles, and DIY Crafting.
    /// </summary>
    public class PocketInventoryManager : MonoBehaviour
    {
        public static PocketInventoryManager Instance { get; private set; }

        [Header("Pocket Capacity & Registries")]
        public int maxPocketSlots = 20;
        public List<ItemDataSO> itemDatabase = new List<ItemDataSO>();
        public List<DIYRecipeSO> recipeDatabase = new List<DIYRecipeSO>();

        [Header("Live Player Balances")]
        public int bells = 2500;
        public int nookMiles = 600;
        public List<SavedInventorySlot> slots = new List<SavedInventorySlot>();

        public event Action OnInventoryOrBalanceChanged;

        private void Awake()
        {
            Instance = this;
            // Populate starter items so DIY crafting can be tested immediately in Play Mode
            AddItem("apple", 2);
            AddItem("softwood", 3);
            AddItem("hardwood", 3);
            AddItem("stone", 2);
            AddItem("iron_nugget", 1);
        }

        public void AddBells(int amount)
        {
            bells = Mathf.Max(0, bells + amount);
            OnInventoryOrBalanceChanged?.Invoke();
        }

        public void AddNookMiles(int amount)
        {
            nookMiles = Mathf.Max(0, nookMiles + amount);
            OnInventoryOrBalanceChanged?.Invoke();
        }

        public int GetItemCount(string itemId)
        {
            int total = 0;
            foreach (SavedInventorySlot s in slots)
            {
                if (s.itemId == itemId) total += s.count;
            }
            return total;
        }

        public bool AddItem(string itemId, int count = 1)
        {
            foreach (SavedInventorySlot slot in slots)
            {
                if (slot.itemId == itemId && slot.count < 30)
                {
                    slot.count += count;
                    OnInventoryOrBalanceChanged?.Invoke();
                    return true;
                }
            }

            if (slots.Count >= maxPocketSlots)
            {
                Debug.LogWarning("[PocketInventoryManager] Pocket is full!");
                return false;
            }

            slots.Add(new SavedInventorySlot { itemId = itemId, count = count });
            OnInventoryOrBalanceChanged?.Invoke();
            return true;
        }

        public bool RemoveItem(string itemId, int count = 1)
        {
            if (GetItemCount(itemId) < count) return false;

            int remaining = count;
            for (int i = slots.Count - 1; i >= 0 && remaining > 0; i--)
            {
                if (slots[i].itemId == itemId)
                {
                    int take = Mathf.Min(slots[i].count, remaining);
                    slots[i].count -= take;
                    remaining -= take;
                    if (slots[i].count <= 0)
                    {
                        slots.RemoveAt(i);
                    }
                }
            }

            OnInventoryOrBalanceChanged?.Invoke();
            return true;
        }

        public bool CanCraftRecipe(DIYRecipeSO recipe)
        {
            if (recipe == null || recipe.ingredients == null) return false;
            foreach (RecipeIngredient ing in recipe.ingredients)
            {
                if (GetItemCount(ing.itemId) < ing.requiredCount) return false;
            }
            return true;
        }

        public bool CraftRecipe(DIYRecipeSO recipe)
        {
            if (!CanCraftRecipe(recipe)) return false;

            foreach (RecipeIngredient ing in recipe.ingredients)
            {
                RemoveItem(ing.itemId, ing.requiredCount);
            }

            AddItem(recipe.resultItemId, 1);
            AddNookMiles(150);
            Debug.Log($"[PocketInventoryManager] Crafted {recipe.displayName}! (+150 Nook Miles)");
            return true;
        }

        public void CraftRecipeByIndex(int index)
        {
            if (index >= 0 && index < recipeDatabase.Count)
            {
                CraftRecipe(recipeDatabase[index]);
            }
            else
            {
                // Fallback default campfire craft using 3 softwood
                if (RemoveItem("softwood", 3))
                {
                    AddItem("campfire", 1);
                    AddNookMiles(150);
                    Debug.Log("[PocketInventoryManager] Crafted Campfire at DIY Workbench! (+150 Nook Miles)");
                }
            }
        }
    }
}
