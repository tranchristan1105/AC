using System.Collections;
using UnityEngine;
using AnimalCrossing.Economy;

namespace AnimalCrossing.World
{
    public enum WorldPropType
    {
        FruitTree,
        CedarTree,
        MineralRock,
        BuriedFossilSpot,
        GlowingBellSpot,
        DIYWorkbench,
        NooksCrannyShop,
        PlacedFurniture
    }

    /// <summary>
    /// Handles interactive world objects on the island grid:
    /// - Fruit Trees (harmonic shake animation + fruit drop + 3-chop wood harvesting)
    /// - Mineral/Money Rocks (8-hit rapid strike window)
    /// - Buried Fossil Cracks & Glowing Bell Spots
    /// </summary>
    public class InteractableWorldProp : MonoBehaviour
    {
        [Header("Prop Identity")]
        public WorldPropType propType = WorldPropType.FruitTree;
        public string displayName = "Apple Tree";
        public string dropItemId = "apple";
        public int maxDailyHits = 3;

        [Header("Visual References")]
        public Transform[] fruitVisuals;
        public GameObject droppedLootPrefab;

        public bool HasFruit { get; private set; } = true;
        public int HitsRemaining { get; private set; }

        private float _rockComboTimer;
        private bool _isShaking;

        private void Awake()
        {
            ResetDailyState();
        }

        private void Update()
        {
            if (_rockComboTimer > 0f)
            {
                _rockComboTimer -= Time.deltaTime;
                if (_rockComboTimer <= 0f && propType == WorldPropType.MineralRock && HitsRemaining < maxDailyHits)
                {
                    // Rapid strike window expired (exact New Horizons rock timer behavior)
                    HitsRemaining = 0;
                }
            }
        }

        public void ResetDailyState()
        {
            HasFruit = propType == WorldPropType.FruitTree;
            HitsRemaining = propType == WorldPropType.MineralRock ? 8 : maxDailyHits;

            if (fruitVisuals != null)
            {
                foreach (Transform fruit in fruitVisuals)
                {
                    if (fruit != null) fruit.gameObject.SetActive(HasFruit);
                }
            }
        }

        public void InteractWithHand()
        {
            if (propType == WorldPropType.FruitTree || propType == WorldPropType.CedarTree)
            {
                if (!_isShaking)
                {
                    StartCoroutine(ShakeTreeRoutine(dropFruit: HasFruit));
                }
            }
            else if (propType == WorldPropType.DIYWorkbench)
            {
                PocketInventoryManager.Instance?.CraftRecipeByIndex(0);
            }
        }

        public void InteractWithAxe()
        {
            if (propType != WorldPropType.FruitTree && propType != WorldPropType.CedarTree) return;

            if (!_isShaking)
            {
                StartCoroutine(ShakeTreeRoutine(dropFruit: false));
            }

            if (HitsRemaining > 0)
            {
                HitsRemaining--;
                string woodId = Random.value > 0.5f ? "softwood" : "hardwood";
                PocketInventoryManager.Instance?.AddItem(woodId, 1);
                SpawnDropBounceVisual(new Color(0.82f, 0.62f, 0.42f));
            }
        }

        public void InteractWithShovel()
        {
            if (propType == WorldPropType.MineralRock)
            {
                if (HitsRemaining <= 0) return;
                if (HitsRemaining == maxDailyHits)
                {
                    // Start 10-second rapid-strike combo window on first hit
                    _rockComboTimer = 10.0f;
                }

                HitsRemaining--;
                string mineralId = Random.value < 0.4f ? "iron_nugget" : "stone";
                PocketInventoryManager.Instance?.AddItem(mineralId, 1);
                SpawnDropBounceVisual(new Color(0.55f, 0.65f, 0.78f));
            }
            else if (propType == WorldPropType.BuriedFossilSpot)
            {
                PocketInventoryManager.Instance?.AddItem("trex_skull", 1);
                Destroy(gameObject);
            }
            else if (propType == WorldPropType.GlowingBellSpot)
            {
                if (PocketInventoryManager.Instance != null)
                {
                    PocketInventoryManager.Instance.AddBells(1000);
                }
                Destroy(gameObject);
            }
        }

        private IEnumerator ShakeTreeRoutine(bool dropFruit)
        {
            _isShaking = true;
            Quaternion startRot = transform.localRotation;
            float elapsed = 0f;
            const float duration = 0.45f;

            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                float angle = Mathf.Sin(elapsed * 38f) * Mathf.Exp(-elapsed * 6f) * 9f;
                transform.localRotation = startRot * Quaternion.Euler(0f, 0f, angle);
                yield return null;
            }

            transform.localRotation = startRot;

            if (dropFruit && HasFruit)
            {
                HasFruit = false;
                if (fruitVisuals != null)
                {
                    foreach (Transform f in fruitVisuals)
                    {
                        if (f != null) f.gameObject.SetActive(false);
                    }
                }

                PocketInventoryManager.Instance?.AddItem(dropItemId, 3);
                SpawnDropBounceVisual(new Color(0.92f, 0.24f, 0.28f));
            }

            _isShaking = false;
        }

        private void SpawnDropBounceVisual(Color tint)
        {
            GameObject orb = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            orb.transform.position = transform.position + new Vector3(Random.Range(-0.6f, 0.6f), 1.2f, -0.75f);
            orb.transform.localScale = Vector3.one * 0.32f;
            Renderer r = orb.GetComponent<Renderer>();
            if (r != null && r.material != null)
            {
                r.material.color = tint;
            }
            Rigidbody rb = orb.AddComponent<Rigidbody>();
            rb.AddForce(new Vector3(Random.Range(-1.2f, 1.2f), 3.2f, -1.5f), ForceMode.Impulse);
            Destroy(orb, 1.4f);
        }
    }
}
