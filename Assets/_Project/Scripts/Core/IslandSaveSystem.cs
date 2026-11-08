using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace AnimalCrossing.Core
{
    [Serializable]
    public class SavedPlacedItem
    {
        public string itemId;
        public int tileX;
        public int tileZ;
        public float rotationY;
    }

    [Serializable]
    public class SavedInventorySlot
    {
        public string itemId;
        public int count;
    }

    [Serializable]
    public class IslandSaveData
    {
        public string lastIslandDayKey = "";
        public long lastSavedUtcTicks;
        public int bells = 2500;
        public int nookMiles = 600;
        public int homeLoanBalance = 19800;
        public int homeLevel = 1;
        public int turnipPatternIndex = 1; // 1 = Large Spike
        public int turnipBuyPrice = 98;
        public List<SavedInventorySlot> pocketSlots = new List<SavedInventorySlot>();
        public List<SavedPlacedItem> placedObjects = new List<SavedPlacedItem>();
    }

    /// <summary>
    /// Handles JSON persistence to Application.persistentDataPath and runs the
    /// Deterministic Offline Delta Catch-Up Simulator when the mobile app resumes.
    /// </summary>
    public class IslandSaveSystem : MonoBehaviour
    {
        public static IslandSaveSystem Instance { get; private set; }
        public IslandSaveData Data { get; private set; } = new IslandSaveData();

        private string SaveFilePath => Path.Combine(Application.persistentDataPath, "ac_island_save.json");

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            LoadSaveFile();
        }

        public void LoadSaveFile()
        {
            if (File.Exists(SaveFilePath))
            {
                try
                {
                    string json = File.ReadAllText(SaveFilePath);
                    Data = JsonUtility.FromJson<IslandSaveData>(json) ?? new IslandSaveData();
                }
                catch (Exception e)
                {
                    Debug.LogWarning($"[IslandSaveSystem] Failed to parse save file, starting fresh: {e.Message}");
                    Data = new IslandSaveData();
                }
            }
            else
            {
                Data = new IslandSaveData();
            }
        }

        public void WriteSaveFile()
        {
            Data.lastSavedUtcTicks = DateTime.UtcNow.Ticks;
            if (RealTimeClockManager.Instance != null)
            {
                Data.lastIslandDayKey = RealTimeClockManager.Instance.CurrentIslandDayKey;
            }

            string json = JsonUtility.ToJson(Data, true);
            File.WriteAllText(SaveFilePath, json);
        }

        private void OnApplicationPause(bool pauseStatus)
        {
            if (pauseStatus)
            {
                WriteSaveFile();
            }
        }

        private void OnApplicationQuit()
        {
            WriteSaveFile();
        }
    }
}
