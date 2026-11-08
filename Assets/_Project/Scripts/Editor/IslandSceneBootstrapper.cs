#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using AnimalCrossing.Core;
using AnimalCrossing.World;
using AnimalCrossing.Player;
using AnimalCrossing.AI;
using AnimalCrossing.Audio;
using AnimalCrossing.Economy;
using AnimalCrossing.UI;

namespace AnimalCrossing.Editor
{
    /// <summary>
    /// One-Click Unity Editor Scene & Asset Bootstrapper.
    /// Generates all Curved-World URP Materials, ScriptableObject profiles, 3D Multi-Elevation Island,
    /// Player, Camera, Trees, Rocks, Nook's Cranny, and Wandering Villagers in a ready-to-play scene.
    /// </summary>
    public static class IslandSceneBootstrapper
    {
        [MenuItem("Tools/Animal Crossing/Bootstrap Playable 3D Island Scene", false, 1)]
        public static void BootstrapPlayableScene()
        {
            EnsureDirectory("Assets/_Project/Materials");
            EnsureDirectory("Assets/_Project/ScriptableObjects");
            EnsureDirectory("Assets/_Project/Scenes");

            // 1. Create URP Curved-World Materials
            Shader curvedLitShader = Shader.Find("AnimalCrossing/CurvedWorldLitURP");
            Shader curvedWaterShader = Shader.Find("AnimalCrossing/CurvedWaterURP");
            if (curvedLitShader == null)
            {
                curvedLitShader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            }
            if (curvedWaterShader == null)
            {
                curvedWaterShader = curvedLitShader;
            }

            Material matGrassLight = CreateOrUpdateMaterial("Mat_GrassLight", curvedLitShader, new Color(0.43f, 0.78f, 0.37f));
            Material matGrassDark = CreateOrUpdateMaterial("Mat_GrassDark", curvedLitShader, new Color(0.38f, 0.72f, 0.33f));
            Material matCliffSoil = CreateOrUpdateMaterial("Mat_CliffSoil", curvedLitShader, new Color(0.56f, 0.38f, 0.22f));
            Material matSand = CreateOrUpdateMaterial("Mat_BeachSand", curvedLitShader, new Color(0.95f, 0.85f, 0.60f));
            Material matPlaza = CreateOrUpdateMaterial("Mat_PlazaBrick", curvedLitShader, new Color(0.85f, 0.61f, 0.45f));
            Material matWood = CreateOrUpdateMaterial("Mat_Wood", curvedLitShader, new Color(0.62f, 0.42f, 0.26f));
            Material matFoliage = CreateOrUpdateMaterial("Mat_TreeFoliage", curvedLitShader, new Color(0.24f, 0.64f, 0.31f));
            Material matApple = CreateOrUpdateMaterial("Mat_FruitApple", curvedLitShader, new Color(0.90f, 0.22f, 0.27f));
            Material matRock = CreateOrUpdateMaterial("Mat_MineralRock", curvedLitShader, new Color(0.55f, 0.60f, 0.68f));
            Material matWater = CreateOrUpdateMaterial("Mat_CurvedWater", curvedWaterShader, new Color(0.20f, 0.78f, 0.92f));

            // 2. Create New Scene
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // 3. Create Game Systems Root
            GameObject systemsRoot = new GameObject("_IslandSystems");
            CurvedWorldManager curvedMgr = systemsRoot.AddComponent<CurvedWorldManager>();
            RealTimeClockManager clockMgr = systemsRoot.AddComponent<RealTimeClockManager>();
            systemsRoot.AddComponent<IslandSaveSystem>();
            PocketInventoryManager invMgr = systemsRoot.AddComponent<PocketInventoryManager>();
            systemsRoot.AddComponent<StalkMarketController>();
            IslandGridManager gridMgr = systemsRoot.AddComponent<IslandGridManager>();

            gridMgr.grassMaterial = matGrassLight;
            gridMgr.cliffSoilMaterial = matCliffSoil;
            gridMgr.sandMaterial = matSand;
            gridMgr.plazaBrickMaterial = matPlaza;
            gridMgr.waterMaterial = matWater;

            // 4. Directional Sun Light
            GameObject sunObj = new GameObject("Directional Sun Light");
            Light sunLight = sunObj.AddComponent<Light>();
            sunLight.type = LightType.Directional;
            sunLight.shadows = LightShadows.Soft;
            sunObj.transform.rotation = Quaternion.Euler(48f, -30f, 0f);
            clockMgr.directionalSunLight = sunLight;

            // 5. Build 3D Island Terrain Hierarchy (48x48 Tiles = 3x3 Acres)
            gridMgr.InitializeGridData();
            GameObject terrainRoot = new GameObject("IslandTerrain");

            for (int x = 0; x < gridMgr.WidthInTiles; x++)
            {
                for (int z = 0; z < gridMgr.DepthInTiles; z++)
                {
                    IslandTileData t = gridMgr.GetTile(x, z);
                    bool checker = (x + z) % 2 == 0;

                    if (t.surface == TerrainSurfaceType.Ocean || t.surface == TerrainSurfaceType.River)
                    {
                        GameObject waterTile = GameObject.CreatePrimitive(PrimitiveType.Cube);
                        waterTile.name = $"Water_{x}_{z}";
                        waterTile.transform.SetParent(terrainRoot.transform);
                        float wy = t.surface == TerrainSurfaceType.Ocean ? -0.4f : t.elevation * 1.1f - 0.5f;
                        waterTile.transform.position = new Vector3(x + 0.5f, wy, z + 0.5f);
                        waterTile.GetComponent<Renderer>().sharedMaterial = matWater;
                        Object.DestroyImmediate(waterTile.GetComponent<Collider>());
                        continue;
                    }

                    GameObject block = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    block.name = $"Tile_{x}_{z}";
                    block.transform.SetParent(terrainRoot.transform);

                    float height = Mathf.Max(0.4f, t.elevation * 1.1f);
                    block.transform.localScale = new Vector3(1f, height, 1f);
                    block.transform.position = new Vector3(x + 0.5f, height * 0.5f - (t.surface == TerrainSurfaceType.Sand ? 0.25f : 0f), z + 0.5f);

                    Material surfaceMat = checker ? matGrassLight : matGrassDark;
                    if (t.surface == TerrainSurfaceType.Sand) surfaceMat = matSand;
                    else if (t.surface == TerrainSurfaceType.StonePlaza) surfaceMat = matPlaza;
                    else if (t.surface == TerrainSurfaceType.WoodBridge) surfaceMat = matWood;

                    block.GetComponent<Renderer>().sharedMaterial = surfaceMat;
                }
            }

            // 6. Spawn Interactive Fruit Trees, Rocks, Fossils & DIY Workbench
            GameObject propsRoot = new GameObject("InteractiveProps");
            Vector2Int[] treeCoords =
            {
                new Vector2Int(14, 24), new Vector2Int(16, 28), new Vector2Int(20, 30),
                new Vector2Int(28, 25), new Vector2Int(32, 22), new Vector2Int(15, 18)
            };
            foreach (Vector2Int tc in treeCoords)
            {
                SpawnAppleTree(propsRoot.transform, tc.x, tc.y, gridMgr, matWood, matFoliage, matApple);
            }

            Vector2Int[] rockCoords = { new Vector2Int(12, 20), new Vector2Int(30, 28), new Vector2Int(18, 38) };
            foreach (Vector2Int rc in rockCoords)
            {
                SpawnMineralRock(propsRoot.transform, rc.x, rc.y, gridMgr, matRock);
            }

            // DIY Workbench on Town Plaza
            GameObject wb = GameObject.CreatePrimitive(PrimitiveType.Cube);
            wb.name = "DIY_Workbench";
            wb.transform.SetParent(propsRoot.transform);
            wb.transform.position = gridMgr.TileToWorldCenter(19, 24) + new Vector3(0f, 0.4f, 0f);
            wb.transform.localScale = new Vector3(0.9f, 0.8f, 0.7f);
            wb.GetComponent<Renderer>().sharedMaterial = matWood;
            InteractableWorldProp wbProp = wb.AddComponent<InteractableWorldProp>();
            wbProp.propType = WorldPropType.DIYWorkbench;
            wbProp.displayName = "DIY Workbench";

            // 7. Create Player & Follow Camera
            GameObject playerObj = CreatePlayerCharacter(gridMgr.TileToWorldCenter(20, 22), matWood, matApple);
            ACPlayerController playerCtrl = playerObj.GetComponent<ACPlayerController>();
            curvedMgr.focusTarget = playerObj.transform;

            GameObject camObj = new GameObject("Main Camera");
            camObj.tag = "MainCamera";
            Camera cam = camObj.AddComponent<Camera>();
            cam.fieldOfView = 35f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            camObj.AddComponent<AudioListener>();
            camObj.transform.SetParent(playerObj.transform);
            camObj.transform.localPosition = new Vector3(0f, 8.2f, -9.8f);
            camObj.transform.localRotation = Quaternion.Euler(36f, 0f, 0f);

            // 8. Spawn Autonomous Villagers (Maple & Marshal) with Animalese Synthesizers
            SpawnVillager(
                "Maple",
                gridMgr.TileToWorldCenter(17, 23),
                395f,
                "honey",
                CreateOrUpdateMaterial("Mat_VillagerMaple", curvedLitShader, new Color(0.79f, 0.48f, 0.29f)),
                matApple);

            SpawnVillager(
                "Marshal",
                gridMgr.TileToWorldCenter(23, 25),
                435f,
                "sulky",
                CreateOrUpdateMaterial("Mat_VillagerMarshal", curvedLitShader, new Color(0.96f, 0.95f, 0.92f)),
                matGrassDark);

            // 9. Attach Mobile HUD
            MobileTouchHUD hud = systemsRoot.AddComponent<MobileTouchHUD>();
            hud.player = playerCtrl;
            hud.curvedWorld = curvedMgr;
            hud.clock = clockMgr;
            hud.inventory = invMgr;

            EditorSceneManager.SaveScene(scene, "Assets/_Project/Scenes/MainIsland.unity");
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Selection.activeGameObject = systemsRoot;

            Debug.Log("✅ [IslandSceneBootstrapper] Successfully generated 'Assets/_Project/Scenes/MainIsland.unity'! Press PLAY to test the Curved-World URP island.");
        }

        private static void SpawnAppleTree(
            Transform parent,
            int tx,
            int tz,
            IslandGridManager grid,
            Material matTrunk,
            Material matLeaves,
            Material matFruit)
        {
            GameObject root = new GameObject($"AppleTree_{tx}_{tz}");
            root.transform.SetParent(parent);
            root.transform.position = grid.TileToWorldCenter(tx, tz);

            CapsuleCollider col = root.AddComponent<CapsuleCollider>();
            col.center = new Vector3(0f, 1.0f, 0f);
            col.radius = 0.4f;
            col.height = 2.0f;

            GameObject trunk = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            trunk.transform.SetParent(root.transform, false);
            trunk.transform.localPosition = new Vector3(0f, 0.65f, 0f);
            trunk.transform.localScale = new Vector3(0.42f, 0.65f, 0.42f);
            trunk.GetComponent<Renderer>().sharedMaterial = matTrunk;
            Object.DestroyImmediate(trunk.GetComponent<Collider>());

            GameObject canopy = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            canopy.transform.SetParent(root.transform, false);
            canopy.transform.localPosition = new Vector3(0f, 1.65f, 0f);
            canopy.transform.localScale = new Vector3(1.45f, 1.35f, 1.45f);
            canopy.GetComponent<Renderer>().sharedMaterial = matLeaves;
            Object.DestroyImmediate(canopy.GetComponent<Collider>());

            Transform[] fruits = new Transform[3];
            Vector3[] offsets =
            {
                new Vector3(-0.42f, 1.35f, -0.58f),
                new Vector3(0.42f, 1.35f, -0.58f),
                new Vector3(0f, 1.78f, -0.62f)
            };
            for (int i = 0; i < 3; i++)
            {
                GameObject f = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                f.transform.SetParent(root.transform, false);
                f.transform.localPosition = offsets[i];
                f.transform.localScale = Vector3.one * 0.28f;
                f.GetComponent<Renderer>().sharedMaterial = matFruit;
                Object.DestroyImmediate(f.GetComponent<Collider>());
                fruits[i] = f.transform;
            }

            InteractableWorldProp prop = root.AddComponent<InteractableWorldProp>();
            prop.propType = WorldPropType.FruitTree;
            prop.displayName = "Apple Tree";
            prop.dropItemId = "apple";
            prop.fruitVisuals = fruits;
            grid.RegisterPropAtTile(tx, tz, prop);
        }

        private static void SpawnMineralRock(Transform parent, int tx, int tz, IslandGridManager grid, Material matRock)
        {
            GameObject rock = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            rock.name = $"MineralRock_{tx}_{tz}";
            rock.transform.SetParent(parent);
            rock.transform.position = grid.TileToWorldCenter(tx, tz) + new Vector3(0f, 0.32f, 0f);
            rock.transform.localScale = new Vector3(0.95f, 0.68f, 0.88f);
            rock.GetComponent<Renderer>().sharedMaterial = matRock;

            InteractableWorldProp prop = rock.AddComponent<InteractableWorldProp>();
            prop.propType = WorldPropType.MineralRock;
            prop.displayName = "Mineral Rock";
            prop.maxDailyHits = 8;
            grid.RegisterPropAtTile(tx, tz, prop);
        }

        private static GameObject CreatePlayerCharacter(Vector3 spawnPos, Material bodyMat, Material accentMat)
        {
            GameObject player = new GameObject("Player_Islander");
            player.transform.position = spawnPos + Vector3.up * 0.1f;

            CharacterController cc = player.AddComponent<CharacterController>();
            cc.center = new Vector3(0f, 0.65f, 0f);
            cc.radius = 0.32f;
            cc.height = 1.3f;

            GameObject body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.transform.SetParent(player.transform, false);
            body.transform.localPosition = new Vector3(0f, 0.55f, 0f);
            body.transform.localScale = new Vector3(0.55f, 0.55f, 0.55f);
            body.GetComponent<Renderer>().sharedMaterial = accentMat;
            Object.DestroyImmediate(body.GetComponent<Collider>());

            GameObject head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.transform.SetParent(player.transform, false);
            head.transform.localPosition = new Vector3(0f, 1.05f, 0f);
            head.transform.localScale = Vector3.one * 0.58f;
            head.GetComponent<Renderer>().sharedMaterial = bodyMat;
            Object.DestroyImmediate(head.GetComponent<Collider>());

            GameObject bobber = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            bobber.name = "FishingBobber";
            bobber.transform.localScale = Vector3.one * 0.24f;
            bobber.GetComponent<Renderer>().sharedMaterial = accentMat;
            Object.DestroyImmediate(bobber.GetComponent<Collider>());

            FishingController fishCtrl = player.AddComponent<FishingController>();
            fishCtrl.bobberTransform = bobber.transform;
            fishCtrl.rodTipTransform = head.transform;

            ACPlayerController acPlayer = player.AddComponent<ACPlayerController>();
            acPlayer.fishingController = fishCtrl;

            return player;
        }

        private static void SpawnVillager(
            string name,
            Vector3 pos,
            float voicePitch,
            string catchphrase,
            Material bodyMat,
            Material shirtMat)
        {
            VillagerProfileSO profile = ScriptableObject.CreateInstance<VillagerProfileSO>();
            profile.villagerId = name.ToLowerInvariant();
            profile.displayName = name;
            profile.baseVoicePitchHz = voicePitch;
            profile.defaultCatchphrase = catchphrase;
            AssetDatabase.CreateAsset(profile, $"Assets/_Project/ScriptableObjects/Villager_{name}.asset");

            GameObject vObj = new GameObject($"Villager_{name}");
            vObj.transform.position = pos;

            CapsuleCollider col = vObj.AddComponent<CapsuleCollider>();
            col.center = new Vector3(0f, 0.6f, 0f);
            col.radius = 0.35f;
            col.height = 1.2f;

            GameObject torso = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            torso.transform.SetParent(vObj.transform, false);
            torso.transform.localPosition = new Vector3(0f, 0.38f, 0f);
            torso.transform.localScale = new Vector3(0.48f, 0.38f, 0.48f);
            torso.GetComponent<Renderer>().sharedMaterial = shirtMat;
            Object.DestroyImmediate(torso.GetComponent<Collider>());

            GameObject head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.transform.SetParent(vObj.transform, false);
            head.transform.localPosition = new Vector3(0f, 0.88f, 0f);
            head.transform.localScale = Vector3.one * 0.56f;
            head.GetComponent<Renderer>().sharedMaterial = bodyMat;
            Object.DestroyImmediate(head.GetComponent<Collider>());

            GameObject rightArm = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            rightArm.transform.SetParent(vObj.transform, false);
            rightArm.transform.localPosition = new Vector3(0.32f, 0.45f, 0f);
            rightArm.transform.localScale = new Vector3(0.16f, 0.22f, 0.16f);
            rightArm.GetComponent<Renderer>().sharedMaterial = bodyMat;
            Object.DestroyImmediate(rightArm.GetComponent<Collider>());

            AnimaleseSynthesizer synth = vObj.AddComponent<AnimaleseSynthesizer>();
            VillagerUtilityAgent agent = vObj.AddComponent<VillagerUtilityAgent>();
            agent.profile = profile;
            agent.voiceSynthesizer = synth;
            agent.rightArmTransform = rightArm.transform;
        }

        private static Material CreateOrUpdateMaterial(string matName, Shader shader, Color baseColor)
        {
            string path = $"Assets/_Project/Materials/{matName}.mat";
            Material mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(shader);
                AssetDatabase.CreateAsset(mat, path);
            }
            else
            {
                mat.shader = shader;
            }
            mat.color = baseColor;
            if (mat.HasProperty("_BaseColor"))
            {
                mat.SetColor("_BaseColor", baseColor);
            }
            EditorUtility.SetDirty(mat);
            return mat;
        }

        private static void EnsureDirectory(string assetFolderPath)
        {
            if (!Directory.Exists(assetFolderPath))
            {
                Directory.CreateDirectory(assetFolderPath);
            }
        }
    }
}
#endif
