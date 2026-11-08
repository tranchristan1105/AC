# Animal Crossing Mobile — Unity 3D (URP) Architecture & Reverse-Engineered Core

This repository is a **Unity (Universal Render Pipeline / URP)** project (`Unity 2022.3 LTS` / `Unity 6`) implementing the reverse-engineered core systems of **Animal Crossing** (*New Horizons* and *Pocket Camp*) for **iOS and Android**.

---

## Quick Start in Unity Hub (One-Click Scene Setup)

1. Clone this repository:
   ```bash
   git clone https://github.com/tranchristan1105/AC.git
   ```
2. Open **Unity Hub** $\to$ **Add** $\to$ **Add project from disk** and select the cloned `AC` folder.
3. Once Unity finishes importing packages, click the top menu bar:
   > **`Tools` $\to$ `Animal Crossing` $\to$ `Bootstrap Playable 3D Island Scene`**
4. Unity will automatically generate all **Curved-World URP Materials**, **ScriptableObject Villager Profiles**, the **3D Multi-Elevation Island Grid**, **Player**, **Villagers**, and **Mobile HUD**, and open `Assets/_Project/Scenes/MainIsland.unity`.
5. Press **Play**!

---

## Project Architecture (`Assets/_Project/`)

```text
Assets/_Project/
├── Shaders/
│   ├── CurvedWorldCommon.hlsl       # Rolling-Log vertex displacement + analytical normal Jacobian rotation
│   ├── CurvedWorldLitURP.shader     # Multi-pass URP Toon/Matte Lit + curved ShadowCaster + DepthOnly
│   └── CurvedWaterURP.shader        # Stylized river/ocean water with shoreline foam & curved horizon
├── Scripts/
│   ├── Core/
│   │   ├── CurvedWorldManager.cs    # [ExecuteAlways] global shader controller + inverse-curve touch raycast
│   │   ├── RealTimeClockManager.cs  # System.DateTime sync, 05:00 AM rollover, 24h sun/sky lighting
│   │   └── IslandSaveSystem.cs      # Mobile persistentDataPath JSON save + offline delta catch-up
│   ├── World/
│   │   ├── IslandGridManager.cs     # 16x16 Acre & 1x1m Tile grid, cliff Marching Squares bitmask & Terraforming
│   │   └── InteractableWorldProp.cs # Fruit tree harmonic shake/chop, 8-hit combo rocks, fossils, workbench
│   ├── Player/
│   │   ├── ACPlayerController.cs    # CharacterController movement, virtual thumbstick, tap-to-walk, 8 tools
│   │   └── FishingController.cs     # Parabolic LineRenderer, 1-4 nibble fake-outs, mobile haptics, bite window
│   ├── AI/
│   │   ├── VillagerProfileSO.cs     # ScriptableObject for personality, schedule, Animalese pitch & dialogue
│   │   └── VillagerUtilityAgent.cs  # NavMeshAgent + Utility AI decision loop, waving & friendship tiers
│   ├── Audio/
│   │   └── AnimaleseSynthesizer.cs  # Unity OnAudioFilterRead real-time DSP formant voice synthesizer
│   ├── Economy/
│   │   ├── ItemDataSO.cs            # ScriptableObject for items, fish, bugs, fossils & placeable furniture
│   │   ├── DIYRecipeSO.cs           # ScriptableObject for DIY Workbench recipes
│   │   ├── StalkMarketController.cs # Exact ACNH 4-pattern Markov Turnip price predictor
│   │   └── PocketInventoryManager.cs# Pocket slots, Bells, Nook Miles & DIY crafting execution
│   ├── UI/
│   │   └── MobileTouchHUD.cs        # On-screen mobile tool dock, [A] action button & live Shader/RTC lab
│   └── Editor/
│       └── IslandSceneBootstrapper.cs # One-click Unity Editor scene, material & asset generator
```
