using UnityEngine;
using AnimalCrossing.Core;
using AnimalCrossing.Player;
using AnimalCrossing.Economy;

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

        private bool _showEngineInspector;

        private void OnGUI()
        {
            GUI.skin.button.fontSize = 14;
            GUI.skin.label.fontSize = 14;

            // Top-Left Clock & Engine Lab Toggle
            GUILayout.BeginArea(new Rect(16, 16, 420, 320));
            GUILayout.BeginHorizontal("box");
            string timeStr = clock != null ? clock.CurrentIslandTime.ToString("hh:mm tt (ddd)") : "10:30 AM";
            GUILayout.Label($"🏝️ {timeStr}", GUILayout.Width(165));

            int bells = inventory != null ? inventory.bells : 2500;
            int miles = inventory != null ? inventory.nookMiles : 600;
            GUILayout.Label($"💰 {bells:N0} Bells   ✈️ {miles:N0} Miles");

            if (GUILayout.Button(_showEngineInspector ? "Close Lab" : "⚙️ Shader & RTC", GUILayout.Width(120)))
            {
                _showEngineInspector = !_showEngineInspector;
            }
            GUILayout.EndHorizontal();

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
