using System;
using UnityEngine;
using AnimalCrossing.Core;

namespace AnimalCrossing.World
{
    public enum TerrainSurfaceType : byte
    {
        Ocean = 0,
        Sand = 1,
        Grass = 2,
        River = 3,
        StonePlaza = 4,
        WoodBridge = 5,
        CustomPath = 6
    }

    [Serializable]
    public struct IslandTileData
    {
        public byte elevation; // 0 = Sea/Beach, 1 = Base Meadow, 2 = Mid Cliff, 3 = Upper Cliff
        public TerrainSurfaceType surface;
        public byte cliffEdgeBitmask; // 4-bit / 8-bit Marching Squares mask for rounded cliff bevels
        public bool hasBuriedItem;
        public string buriedItemId;
        public InteractableWorldProp occupantProp;
    }

    /// <summary>
    /// Reverse-Engineered Animal Crossing Spatial Acre & Tile Grid Manager.
    /// Organizes the island into 16x16-tile Acres for fast culling, auto-tiling bitmasks,
    /// and runtime Island Designer Terraforming (Cliff Construction & Waterscaping Permits).
    /// </summary>
    public class IslandGridManager : MonoBehaviour
    {
        public static IslandGridManager Instance { get; private set; }

        public const int AcreSize = 16;

        [Header("Island Dimensions (in Acres)")]
        public int acresWide = 3;
        public int acresDeep = 3;

        [Header("Terrain Materials (Using CurvedWorldLitURP / CurvedWaterURP)")]
        public Material grassMaterial;
        public Material cliffSoilMaterial;
        public Material sandMaterial;
        public Material plazaBrickMaterial;
        public Material waterMaterial;

        public int WidthInTiles => acresWide * AcreSize;
        public int DepthInTiles => acresDeep * AcreSize;

        private IslandTileData[,] _grid;
        private GameObject[,] _tileVisuals;

        private void Awake()
        {
            Instance = this;
            InitializeGridData();
        }

        private void Start()
        {
            if (RealTimeClockManager.Instance != null)
            {
                RealTimeClockManager.Instance.OnDailyRollover5AM += HandleDailyRollover5AM;
            }
        }

        public void InitializeGridData()
        {
            int w = WidthInTiles;
            int d = DepthInTiles;
            _grid = new IslandTileData[w, d];
            _tileVisuals = new GameObject[w, d];

            for (int x = 0; x < w; x++)
            {
                for (int z = 0; z < d; z++)
                {
                    IslandTileData tile = new IslandTileData();

                    // Perimeter Ocean & Sandy Beach
                    if (x < 3 || x >= w - 3 || z < 3 || z >= d - 3)
                    {
                        tile.elevation = 0;
                        tile.surface = TerrainSurfaceType.Ocean;
                    }
                    else if (x < 6 || x >= w - 6 || z < 6)
                    {
                        tile.elevation = 0;
                        tile.surface = TerrainSurfaceType.Sand;
                    }
                    else if (z >= d - 11 && x >= 7 && x <= w - 8)
                    {
                        // Northern Clifftop (Elevation 2)
                        tile.elevation = 2;
                        tile.surface = TerrainSurfaceType.Grass;
                    }
                    else
                    {
                        // Main Island Meadow (Elevation 1)
                        tile.elevation = 1;
                        tile.surface = TerrainSurfaceType.Grass;
                    }

                    // Winding River from Northern Cliff Waterfall to Southern Mouth
                    int riverCenter = (w / 2) + Mathf.RoundToInt(Mathf.Sin(z * 0.22f) * 2.5f);
                    if (z >= 3 && z <= d - 7 && Mathf.Abs(x - riverCenter) <= 1)
                    {
                        tile.surface = TerrainSurfaceType.River;
                    }

                    // Wooden Bridge across the River
                    if ((z == d / 2 || z == d / 2 + 1) && Mathf.Abs(x - riverCenter) <= 2)
                    {
                        tile.surface = TerrainSurfaceType.WoodBridge;
                        tile.elevation = 1;
                    }

                    // Central Brick Town Plaza
                    if (x >= (w / 2 - 6) && x <= (w / 2 - 2) && z >= (d / 2 - 2) && z <= (d / 2 + 2))
                    {
                        tile.surface = TerrainSurfaceType.StonePlaza;
                        tile.elevation = 1;
                    }

                    _grid[x, z] = tile;
                }
            }

            RecalculateCliffBitmasks();
        }

        public bool IsValidTile(int x, int z)
        {
            return _grid != null && x >= 0 && x < WidthInTiles && z >= 0 && z < DepthInTiles;
        }

        public IslandTileData GetTile(int x, int z)
        {
            if (!IsValidTile(x, z)) return default;
            return _grid[x, z];
        }

        public Vector3 TileToWorldCenter(int x, int z)
        {
            if (!IsValidTile(x, z)) return new Vector3(x + 0.5f, 0f, z + 0.5f);
            float y = _grid[x, z].elevation * 1.1f;
            return new Vector3(x + 0.5f, y, z + 0.5f);
        }

        public Vector2Int WorldToTileCoords(Vector3 worldPos)
        {
            return new Vector2Int(Mathf.FloorToInt(worldPos.x), Mathf.FloorToInt(worldPos.z));
        }

        /// <summary>
        /// Computes 4-neighbor Marching Squares bitmask so cliff edges and riverbanks
        /// automatically select rounded 45-degree bevel meshes when terraforming.
        /// </summary>
        public void RecalculateCliffBitmasks()
        {
            int w = WidthInTiles;
            int d = DepthInTiles;

            for (int x = 1; x < w - 1; x++)
            {
                for (int z = 1; z < d - 1; z++)
                {
                    byte elev = _grid[x, z].elevation;
                    byte mask = 0;
                    if (_grid[x, z + 1].elevation == elev) mask |= 1 << 0; // North
                    if (_grid[x + 1, z].elevation == elev) mask |= 1 << 1; // East
                    if (_grid[x, z - 1].elevation == elev) mask |= 1 << 2; // South
                    if (_grid[x - 1, z].elevation == elev) mask |= 1 << 3; // West
                    _grid[x, z].cliffEdgeBitmask = mask;
                }
            }
        }

        /// <summary>
        /// Island Designer Cliff-Construction Permit: toggles cliff elevation at (x, z) if unoccupied.
        /// </summary>
        public bool TryTerraformCliff(int x, int z)
        {
            if (!IsValidTile(x, z)) return false;
            ref IslandTileData tile = ref _grid[x, z];
            if (tile.occupantProp != null || tile.surface == TerrainSurfaceType.Ocean) return false;

            tile.elevation = (byte)(tile.elevation == 1 ? 2 : 1);
            tile.surface = TerrainSurfaceType.Grass;
            RecalculateCliffBitmasks();
            RefreshTileVisual(x, z);
            return true;
        }

        /// <summary>
        /// Island Designer Waterscaping Permit: carves or fills a river tile at (x, z).
        /// </summary>
        public bool TryTerraformWater(int x, int z)
        {
            if (!IsValidTile(x, z)) return false;
            ref IslandTileData tile = ref _grid[x, z];
            if (tile.occupantProp != null || tile.surface == TerrainSurfaceType.Ocean) return false;

            tile.surface = tile.surface == TerrainSurfaceType.River
                ? TerrainSurfaceType.Grass
                : TerrainSurfaceType.River;
            RefreshTileVisual(x, z);
            return true;
        }

        public void RegisterPropAtTile(int x, int z, InteractableWorldProp prop)
        {
            if (!IsValidTile(x, z)) return;
            _grid[x, z].occupantProp = prop;
        }

        private void RefreshTileVisual(int x, int z)
        {
            if (_tileVisuals != null && _tileVisuals[x, z] != null)
            {
                Vector3 pos = _tileVisuals[x, z].transform.position;
                pos.y = _grid[x, z].elevation * 1.1f - 0.55f;
                _tileVisuals[x, z].transform.position = pos;
            }
        }

        private void HandleDailyRollover5AM(string newDayKey)
        {
            InteractableWorldProp[] allProps = FindObjectsOfType<InteractableWorldProp>();
            foreach (InteractableWorldProp prop in allProps)
            {
                prop.ResetDailyState();
            }
            Debug.Log($"[IslandGridManager] 05:00 AM Rollover completed for day {newDayKey}. All trees and rocks replenished.");
        }
    }
}
