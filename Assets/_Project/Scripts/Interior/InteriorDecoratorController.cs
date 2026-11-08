using System.Collections.Generic;
using UnityEngine;
using AnimalCrossing.Core;
using AnimalCrossing.Economy;

namespace AnimalCrossing.Interior
{
    public enum PlacementLayer
    {
        Rug = 0,
        FloorFurniture = 1,
        TableTop = 2,
        WallMounted = 3
    }

    public class PlacedDecorInstance : MonoBehaviour
    {
        public string itemId = "campfire";
        public string displayName = "Campfire";
        public PlacementLayer layer = PlacementLayer.FloorFurniture;
        public Vector2Int subTileCoords;
        public Vector2Int footprintHalfTiles = new Vector2Int(2, 2); // 2x2 half-tiles = 1m x 1m
        public int rotationQuarterTurns;
    }

    /// <summary>
    /// Reverse-Engineered Animal Crossing: New Horizons / Happy Home Paradise Decorator Engine.
    /// Supports 0.5m sub-tile snapping, multi-layer occupancy (Rugs, Floor, Table-Top, Walls),
    /// touch drag-and-drop placement, 90-degree rotation, and Indoor/Outdoor camera transitions.
    /// </summary>
    public class InteriorDecoratorController : MonoBehaviour
    {
        public static InteriorDecoratorController Instance { get; private set; }

        [Header("Grid Settings (0.5m Sub-Tiles)")]
        public float subTileSize = 0.5f;
        public Vector3 roomOrigin = new Vector3(16f, 1.1f, 20f);
        public int gridHalfWidth = 16; // 8m x 8m decorator zone
        public int gridHalfDepth = 16;

        [Header("Decorator State")]
        public bool IsDecorating { get; private set; }
        public PlacedDecorInstance SelectedItem { get; private set; }

        private readonly List<PlacedDecorInstance> _placedItems = new List<PlacedDecorInstance>();
        private float _savedCurveStrength = 0.024f;
        private bool _isIndoorRoomView;

        private void Awake()
        {
            Instance = this;
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.Tab))
            {
                ToggleDecoratorMode();
            }

            if (!IsDecorating) return;

            // Rotate selected item 90 degrees on R key
            if (SelectedItem != null && Input.GetKeyDown(KeyCode.R))
            {
                RotateSelected90Degrees();
            }

            HandleTouchOrMouseDrag();
        }

        public void ToggleDecoratorMode(bool flattenHorizonForIndoors = false)
        {
            IsDecorating = !IsDecorating;
            _isIndoorRoomView = flattenHorizonForIndoors;

            if (CurvedWorldManager.Instance != null)
            {
                if (IsDecorating && _isIndoorRoomView)
                {
                    _savedCurveStrength = CurvedWorldManager.Instance.curveStrength;
                    CurvedWorldManager.Instance.curveStrength = 0f; // Indoor rooms in AC render flat
                }
                else if (!IsDecorating && _isIndoorRoomView)
                {
                    CurvedWorldManager.Instance.curveStrength = _savedCurveStrength;
                }
            }

            if (!IsDecorating)
            {
                SelectedItem = null;
            }
        }

        public PlacedDecorInstance SpawnFurnitureOnGrid(string itemId, string displayName, Color tint, Vector3 worldPos)
        {
            Vector2Int subCoords = WorldToSubTile(worldPos);
            Vector3 snappedPos = SubTileToWorld(subCoords, worldPos.y);

            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = $"Decor_{displayName}";
            go.transform.position = snappedPos + Vector3.up * 0.35f;
            go.transform.localScale = new Vector3(0.85f, 0.7f, 0.85f);

            Renderer r = go.GetComponent<Renderer>();
            if (r != null)
            {
                Shader curvedShader = Shader.Find("AnimalCrossing/CurvedWorldLitURP") ?? Shader.Find("Standard");
                Material mat = new Material(curvedShader) { color = tint };
                if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", tint);
                r.sharedMaterial = mat;
            }

            PlacedDecorInstance decor = go.AddComponent<PlacedDecorInstance>();
            decor.itemId = itemId;
            decor.displayName = displayName;
            decor.subTileCoords = subCoords;
            decor.footprintHalfTiles = new Vector2Int(2, 2);

            _placedItems.Add(decor);
            SelectedItem = decor;
            return decor;
        }

        public void RotateSelected90Degrees()
        {
            if (SelectedItem == null) return;
            SelectedItem.rotationQuarterTurns = (SelectedItem.rotationQuarterTurns + 1) % 4;
            SelectedItem.transform.rotation = Quaternion.Euler(0f, SelectedItem.rotationQuarterTurns * 90f, 0f);
        }

        public void StoreSelectedIntoPocket()
        {
            if (SelectedItem == null) return;
            PocketInventoryManager.Instance?.AddItem(SelectedItem.itemId, 1);
            _placedItems.Remove(SelectedItem);
            Destroy(SelectedItem.gameObject);
            SelectedItem = null;
        }

        private void HandleTouchOrMouseDrag()
        {
            if (Camera.main == null) return;

            if (Input.GetMouseButtonDown(0))
            {
                if (UnityEngine.EventSystems.EventSystem.current != null &&
                    UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject())
                {
                    return;
                }

                Ray ray = Camera.main.ScreenPointToRay(Input.mousePosition);
                if (Physics.Raycast(ray, out RaycastHit hit, 60f))
                {
                    PlacedDecorInstance clickedDecor = hit.collider.GetComponentInParent<PlacedDecorInstance>();
                    if (clickedDecor != null)
                    {
                        SelectedItem = clickedDecor;
                        return;
                    }
                }
            }

            if (Input.GetMouseButton(0) && SelectedItem != null)
            {
                Plane floorPlane = new Plane(Vector3.up, new Vector3(0f, roomOrigin.y, 0f));
                Ray ray = Camera.main.ScreenPointToRay(Input.mousePosition);
                if (floorPlane.Raycast(ray, out float enter))
                {
                    Vector3 hitPt = ray.GetPoint(enter);
                    Vector2Int candidateSubTile = WorldToSubTile(hitPt);

                    if (!IsFootprintOccupied(candidateSubTile, SelectedItem.footprintHalfTiles, SelectedItem.layer, SelectedItem))
                    {
                        SelectedItem.subTileCoords = candidateSubTile;
                        Vector3 snapped = SubTileToWorld(candidateSubTile, roomOrigin.y);
                        SelectedItem.transform.position = snapped + Vector3.up * 0.35f;
                    }
                }
            }
        }

        public bool IsFootprintOccupied(
            Vector2Int targetSubTile,
            Vector2Int footprint,
            PlacementLayer layer,
            PlacedDecorInstance ignoreSelf = null)
        {
            RectInt candidateRect = new RectInt(targetSubTile.x, targetSubTile.y, footprint.x, footprint.y);

            foreach (PlacedDecorInstance item in _placedItems)
            {
                if (item == null || item == ignoreSelf) continue;
                if (item.layer != layer) continue; // Rugs (Layer 0) can coexist under FloorFurniture (Layer 1)

                RectInt existingRect = new RectInt(
                    item.subTileCoords.x,
                    item.subTileCoords.y,
                    item.footprintHalfTiles.x,
                    item.footprintHalfTiles.y);

                if (candidateRect.Overlaps(existingRect))
                {
                    return true;
                }
            }
            return false;
        }

        public Vector2Int WorldToSubTile(Vector3 worldPos)
        {
            int sx = Mathf.RoundToInt((worldPos.x - roomOrigin.x) / subTileSize);
            int sz = Mathf.RoundToInt((worldPos.z - roomOrigin.z) / subTileSize);
            return new Vector2Int(sx, sz);
        }

        public Vector3 SubTileToWorld(Vector2Int subTile, float yHeight)
        {
            return new Vector3(
                roomOrigin.x + subTile.x * subTileSize,
                yHeight,
                roomOrigin.z + subTile.y * subTileSize);
        }
    }
}
