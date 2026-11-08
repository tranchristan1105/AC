using System;
using UnityEngine;

namespace AnimalCrossing.Economy
{
    [Serializable]
    public struct RecipeIngredient
    {
        public string itemId;
        public int requiredCount;
    }

    [CreateAssetMenu(fileName = "NewDIYRecipe", menuName = "AnimalCrossing/DIY Recipe")]
    public class DIYRecipeSO : ScriptableObject
    {
        public string recipeId = "recipe_campfire";
        public string displayName = "Campfire";
        public string resultItemId = "campfire";
        public RecipeIngredient[] ingredients;
    }
}
