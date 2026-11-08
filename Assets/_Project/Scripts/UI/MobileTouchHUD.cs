using UnityEngine;
using AnimalCrossing.Core;
using AnimalCrossing.Player;
using AnimalCrossing.Economy;
using AnimalCrossing.Interior;

namespace AnimalCrossing.UI
{
    /// <summary>
    /// Self-contained Mobile Touch & Debug HUD for testing all reverse-engineered systems
    /// immediately in the Unity Editor or on an iOS/Android device build.
    /// </summary>
    public class MobileTouchHUD : MonoBehaviour
    {
        public ACPlayerController player;
        public CurvedWorldManager curvedWorld;
        public RealTimeClockManager clock;
        public PocketInventoryManager inventory;
        public InteriorDecoratorController decorator;

        private bool _showEngineInspector;

        private void OnGUI()
        {
            GUI.skin.button.fontSize = 13;
            GUI.skin.label.fontSize = 13;

            // Top-Left Clock, Balances, Decorator Toggle & Engine Lab
            GUILayout.BeginArea(new Rect(16, 16, 560, 360));
            GUILayout.BeginHorizontal("box");
            string timeStr = clock != null ? clock.CurrentIslandTime.ToString("hh:mm tt (ddd)") : "10:30 AM";
            GUILayout.Label($"🏝️ {timeStr}", GUILayout.Width(145));

            int bells = inventory != null ? inventory.bells : 2500;
            int miles = inventory != null ? inventory.nookMiles : 600;
            GUILayout.Label($"💰 {bells:N0}   ✈️ {miles:N0}", GUILayout.Width(145));

            if (decorator != null)
            {
                Color prevBg = GUI.backgroundColor;
                if (decorator.IsDecorating) GUI.backgroundColor = new Color(0.95f, 0.62f, 0.15f);
                if (GUILayout.Button(decorator.IsDecorating ? "🏠 Exit Decor" : "🏠 Decorate", GUILayout.Width(110)))
                {
                    decorator.ToggleDecoratorMode();
                }
                GUI.backgroundColor = prevBg;
            }

            if (GUILayout.Button(_showEngineInspector ? "Close Lab" : "⚙️ Shader/RTC", GUILayout.Width(115)))
            {
                _showEngineInspector = !_showEngineInspector;
            }
            GUILayout.EndHorizontal();

            // Decorator Sub-Tile Controls
            if (decorator != null && decorator.IsDecorating)
            {
                GUILayout.BeginVertical("box");
                GUILayout.Label("🪑 0.5m Sub-Tile Decorator (Click & drag furniture on grid, or spawn below):");
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("+ Place Log Bench"))
                {
                    Vector3 spawnPos = player != null ? player.transform.position + player.transform.forward * 1.5f : decorator.roomOrigin;
                    decorator.SpawnFurnitureOnGrid("log_bench", "Log Bench", new Color(0.68f, 0.45f, 0.25f), spawnPos);
                }
                if (GUILayout.Button("+ Place Lantern"))
                {
                    Vector3 spawnPos = player != null ? player.transform.position + player.transform.forward * 1.5f : decorator.roomOrigin;
                    decorator.SpawnFurnitureOnGrid("garden_lantern", "Garden Lantern", new Color(0.98f, 0.88f, 0.35f), spawnPos);
                }
                if (decorator.SelectedItem != null)
                {
                    if (GUILayout.Button("↻ Rotate 90° (R)")) decorator.RotateSelected90Degrees();
                    if (GUILayout.Button("📦 Pocket")) decorator.StoreSelectedIntoPocket();
                }
                GUILayout.EndHorizontal();
                GUILayout.EndVertical();
            }

            // Shader & Real-Time Clock Inspector
            if (_showEngineInspector && curvedWorld != null && clock != null)
            {
                GUILayout.BeginVertical("box");
                GUILayout.Label($"Rolling-Log Curvature (k): {curvedWorld.curveStrength:F3}");
                curvedWorld.curveStrength = GUILayout.HorizontalSlider(curvedWorld.curveStrength, 0.0f, 0.055f);

                GUILayout.Space(6);
                GUILayout.Label($"Time-Travel Offset: {clock.timeOffsetHours:+0.0;-0.0;0.0} Hours");
                clock.timeOffsetHours = GUILayout.HorizontalSlider(clock.timeOffsetHours, -12f, 12f);

                GUILayout.Space(6);
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("☀️ Clear Sky")) clock.currentWeather = IslandWeather.Clear;
                if (GUILayout.Button("🌧️ Rain")) clock.currentWeather = IslandWeather.Rain;
                if (GUILayout.Button("🌅 5 AM Rollover")) clock.TriggerManualDailyRollover();
                GUILayout.EndHorizontal();
                GUILayout.EndVertical();
            }
            GUILayout.EndArea();

            // Bottom Tool Dock
            if (player != null)
            {
                float dockW = 680f;
                GUILayout.BeginArea(new Rect((Screen.width - dockW) * 0.5f, Screen.height - 64f, dockW, 52f));
                GUILayout.BeginHorizontal("box");
                DrawToolButton("1: 🖐️ Hand", PlayerToolType.Hand);
                DrawToolButton("2: 🪓 Axe", PlayerToolType.Axe);
                DrawToolButton("3: ⛏️ Shovel", PlayerToolType.Shovel);
                DrawToolButton("4: 🎣 Rod", PlayerToolType.FishingRod);
                DrawToolButton("5: 🦋 Net", PlayerToolType.BugNet);
                DrawToolButton("7: ⛰️ Cliff", PlayerToolType.CliffPermit);
                DrawToolButton("8: 🌊 River", PlayerToolType.WaterPermit);
                GUILayout.EndHorizontal();
                GUILayout.EndArea();

                // Bottom-Right Mobile [A] Action Button
                if (GUI.Button(new Rect(Screen.width - 124f, Screen.height - 124f, 100f, 100f), "[A]\nInteract"))
                {
                    player.ExecuteContextAction();
                }
            }
        }

        private void DrawToolButton(string label, PlayerToolType tool)
        {
            Color prev = GUI.backgroundColor;
            if (player.equippedTool == tool)
            {
                GUI.backgroundColor = new Color(0.22f, 0.78f, 0.48f);
            }
            if (GUILayout.Button(label, GUILayout.Height(38f)))
            {
                player.EquipTool(tool);
            }
            GUI.backgroundColor = prev;
        }
    }
}
