using UnityEngine;

namespace AnimalCrossing.AI
{
    public enum VillagerPersonality
    {
        Normal,
        Lazy,
        Jock,
        Cranky,
        Smug,
        Peppy,
        Snooty,
        Sisterly
    }

    public enum VillagerHobby
    {
        Nature,
        Music,
        Fitness,
        Education,
        Fashion,
        Play
    }

    /// <summary>
    /// ScriptableObject defining an Animal Crossing Villager's personality, schedule,
    /// Animalese voice pitch, colors, and dialogue pools.
    /// </summary>
    [CreateAssetMenu(fileName = "NewVillagerProfile", menuName = "AnimalCrossing/Villager Profile")]
    public class VillagerProfileSO : ScriptableObject
    {
        [Header("Identity")]
        public string villagerId = "maple";
        public string displayName = "Maple";
        public string species = "Cub";
        public VillagerPersonality personality = VillagerPersonality.Normal;
        public VillagerHobby hobby = VillagerHobby.Nature;
        public string defaultCatchphrase = "honey";

        [Header("Animalese Voice Synthesis")]
        [Range(200f, 520f)]
        public float baseVoicePitchHz = 395f;

        [Header("Daily Macro Schedule (24h)")]
        [Range(0, 23)] public int wakeUpHour = 6;
        [Range(0, 23)] public int sleepHour = 23;

        [Header("Visual Palette")]
        public Color bodyColor = new Color(0.79f, 0.48f, 0.29f);
        public Color shirtColor = new Color(0.91f, 0.36f, 0.46f);

        [Header("Dialogue Lines ({catchphrase} is interpolated at runtime)")]
        [TextArea(2, 4)]
        public string[] dialogueLines = new[]
        {
            "Notice how our island curves gently over the horizon, {catchphrase}? That's our URP Rolling-Log vertex shader in action!",
            "If you shake fruit trees or strike rocks with your Shovel, you can craft cozy furniture at the Plaza DIY Workbench!",
            "Have you checked the turnip prices at Nook's Cranny today, {catchphrase}?"
        };
    }
}
