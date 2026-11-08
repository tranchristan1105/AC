using System;
using UnityEngine;

namespace AnimalCrossing.Core
{
    public enum IslandWeather
    {
        Clear,
        Rain,
        Snow,
        CherryBlossom
    }

    /// <summary>
    /// Reverse-Engineered Animal Crossing Real-Time Clock (RTC) & 24-Hour Lighting Controller.
    /// Locks island time to System.DateTime.Now, evaluates the 05:00 AM daily rollover,
    /// and drives directional Sun/Moon rotation and sky ambient lighting.
    /// </summary>
    public class RealTimeClockManager : MonoBehaviour
    {
        public static RealTimeClockManager Instance { get; private set; }

        [Header("Time & Weather Settings")]
        [Range(-12f, 12f)]
        [Tooltip("Time-travel offset in hours for testing dawn, golden hour, or night.")]
        public float timeOffsetHours = 0f;

        public IslandWeather currentWeather = IslandWeather.Clear;
        public Light directionalSunLight;
        public ParticleSystem rainParticleSystem;

        public event Action<int> OnHourChanged;
        public event Action<string> OnDailyRollover5AM;

        private int _lastBroadcastHour = -1;
        private string _lastIslandDayKey;

        public DateTime CurrentIslandTime => DateTime.Now.AddHours(timeOffsetHours);

        /// <summary>
        /// In Animal Crossing, the island calendar day rolls over at 05:00 AM local time.
        /// </summary>
        public string CurrentIslandDayKey
        {
            get
            {
                DateTime shifted = CurrentIslandTime.AddHours(-5.0);
                return shifted.ToString("yyyy-MM-dd");
            }
        }

        public bool IsNightTime
        {
            get
            {
                int hr = CurrentIslandTime.Hour;
                return hr >= 19 || hr < 6;
            }
        }

        private void Awake()
        {
            Instance = this;
            _lastIslandDayKey = PlayerPrefs.GetString("AC_LastIslandDayKey", CurrentIslandDayKey);
        }

        private void Update()
        {
            DateTime now = CurrentIslandTime;
            float hourFloat = now.Hour + now.Minute / 60f + now.Second / 3600f;

            UpdateAtmosphereLighting(hourFloat);

            if (now.Hour != _lastBroadcastHour)
            {
                _lastBroadcastHour = now.Hour;
                OnHourChanged?.Invoke(now.Hour);
            }

            string currentKey = CurrentIslandDayKey;
            if (currentKey != _lastIslandDayKey)
            {
                _lastIslandDayKey = currentKey;
                PlayerPrefs.SetString("AC_LastIslandDayKey", currentKey);
                PlayerPrefs.Save();
                OnDailyRollover5AM?.Invoke(currentKey);
            }
        }

        private void UpdateAtmosphereLighting(float hourFloat)
        {
            if (directionalSunLight == null) return;

            // Sun pitch arc across the sky
            float sunAngle = ((hourFloat - 6f) / 24f) * 360f;
            directionalSunLight.transform.rotation = Quaternion.Euler(Mathf.Clamp(sunAngle, 18f, 162f), -28f, 0f);

            Color sunColor;
            Color skyAmbient;
            float intensity;

            if (hourFloat >= 5f && hourFloat < 8f)
            {
                // Sunrise / Dawn
                float t = (hourFloat - 5f) / 3f;
                sunColor = Color.Lerp(new Color(1.0f, 0.58f, 0.38f), new Color(1.0f, 0.96f, 0.88f), t);
                skyAmbient = Color.Lerp(new Color(0.35f, 0.32f, 0.52f), new Color(0.75f, 0.88f, 0.98f), t);
                intensity = Mathf.Lerp(0.55f, 1.15f, t);
            }
            else if (hourFloat >= 8f && hourFloat < 16.5f)
            {
                // Midday
                sunColor = new Color(1.0f, 0.97f, 0.90f);
                skyAmbient = new Color(0.78f, 0.90f, 1.0f);
                intensity = 1.2f;
            }
            else if (hourFloat >= 16.5f && hourFloat < 19.5f)
            {
                // Golden Hour / Sunset
                float t = (hourFloat - 16.5f) / 3f;
                sunColor = Color.Lerp(new Color(1.0f, 0.55f, 0.28f), new Color(0.45f, 0.54f, 0.88f), t);
                skyAmbient = Color.Lerp(new Color(0.95f, 0.72f, 0.58f), new Color(0.22f, 0.28f, 0.48f), t);
                intensity = Mathf.Lerp(1.1f, 0.42f, t);
            }
            else
            {
                // Starry Night / Moonlight
                sunColor = new Color(0.52f, 0.68f, 0.98f);
                skyAmbient = new Color(0.18f, 0.24f, 0.42f);
                intensity = 0.42f;
            }

            if (currentWeather == IslandWeather.Rain)
            {
                sunColor = Color.Lerp(sunColor, new Color(0.55f, 0.65f, 0.75f), 0.6f);
                intensity *= 0.68f;
            }

            directionalSunLight.color = sunColor;
            directionalSunLight.intensity = intensity;
            RenderSettings.ambientLight = skyAmbient;

            if (Camera.main != null)
            {
                Camera.main.backgroundColor = skyAmbient;
            }

            if (rainParticleSystem != null)
            {
                bool shouldPlay = currentWeather == IslandWeather.Rain;
                if (shouldPlay && !rainParticleSystem.isPlaying) rainParticleSystem.Play();
                else if (!shouldPlay && rainParticleSystem.isPlaying) rainParticleSystem.Stop();
            }
        }

        [ContextMenu("Simulate 05:00 AM Daily Rollover")]
        public void TriggerManualDailyRollover()
        {
            OnDailyRollover5AM?.Invoke(CurrentIslandDayKey);
        }
    }
}
