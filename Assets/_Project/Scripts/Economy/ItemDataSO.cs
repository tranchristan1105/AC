using UnityEngine;

namespace AnimalCrossing.Economy
{
    public enum ItemCategory
    {
        Fruit,
        Material,
        Fish,
        Insect,
        Fossil,
        Turnip,
        Furniture
    }

    [CreateAssetMenu(fileName = "NewItemData", menuName = "AnimalCrossing/Item Data")]
    public class ItemDataSO : ScriptableObject
    {
        public string itemId = "apple";
        public string displayName = "Apple";
        public ItemCategory category = ItemCategory.Fruit;
        public int sellPriceBells = 500;
        public int buyPriceBells = 600;
        public int maxStackSize = 10;
        public bool isPlaceableOutside;
        public GameObject worldPrefab;

        [TextArea(2, 3)]
        public string catchPunOrDescription = "A crisp island apple harvested from a fruit tree.";
    }
}
