using UnityEngine;

namespace AnimalCrossing.Economy
{
    public enum StalkMarketPattern
    {
        Fluctuating = 0,
        LargeSpike = 1,
        Decreasing = 2,
        SmallSpike = 3
    }

    /// <summary>
    /// Reverse-Engineered Animal Crossing: New Horizons Stalk Market (Turnip) Algorithm.
    /// Computes the 12 half-day AM/PM sell prices (Monday AM through Saturday PM) using
    /// the authentic 4-state Markov transition matrix.
    /// </summary>
    public class StalkMarketController : MonoBehaviour
    {
        public static StalkMarketController Instance { get; private set; }

        [Header("Weekly Turnip State")]
        public int sundayBuyPrice = 98;
        public StalkMarketPattern currentPattern = StalkMarketPattern.LargeSpike;
        public int[] halfDaySellPrices = new int[12];

        // Exact ACNH Markov transition probabilities: [PreviousPattern, NextPattern]
        private static readonly float[,] TransitionMatrix =
        {
            // Next: Fluct, Large, Decr, Small
            { 0.20f, 0.30f, 0.15f, 0.35f }, // From Fluctuating
            { 0.50f, 0.05f, 0.20f, 0.25f }, // From Large Spike
            { 0.25f, 0.45f, 0.05f, 0.25f }, // From Decreasing
            { 0.45f, 0.25f, 0.15f, 0.15f }  // From Small Spike
        };

        private void Awake()
        {
            Instance = this;
            GenerateWeeklyCurve(currentPattern);
        }

        public void AdvanceToNextWeek()
        {
            sundayBuyPrice = Random.Range(90, 111);
            currentPattern = RollNextMarkovPattern(currentPattern);
            GenerateWeeklyCurve(currentPattern);
        }

        private StalkMarketPattern RollNextMarkovPattern(StalkMarketPattern previous)
        {
            int row = (int)previous;
            float roll = Random.value;
            float cumulative = 0f;

            for (int col = 0; col < 4; col++)
            {
                cumulative += TransitionMatrix[row, col];
                if (roll <= cumulative)
                {
                    return (StalkMarketPattern)col;
                }
            }
            return StalkMarketPattern.Fluctuating;
        }

        public void GenerateWeeklyCurve(StalkMarketPattern pattern)
        {
            currentPattern = pattern;
            float b = sundayBuyPrice;

            switch (pattern)
            {
                case StalkMarketPattern.LargeSpike:
                    // Decreases early week, then spikes up to 2.0x - 6.0x before tailing off
                    int peakSlot = Random.Range(3, 9);
                    for (int i = 0; i < 12; i++)
                    {
                        if (i < peakSlot - 2)
                            halfDaySellPrices[i] = Mathf.RoundToInt(b * Random.Range(0.75f, 0.89f));
                        else if (i == peakSlot - 2)
                            halfDaySellPrices[i] = Mathf.RoundToInt(b * Random.Range(0.90f, 1.40f));
                        else if (i == peakSlot - 1)
                            halfDaySellPrices[i] = Mathf.RoundToInt(b * Random.Range(1.40f, 2.00f));
                        else if (i == peakSlot)
                            halfDaySellPrices[i] = Mathf.RoundToInt(b * Random.Range(2.00f, 6.00f));
                        else if (i == peakSlot + 1)
                            halfDaySellPrices[i] = Mathf.RoundToInt(b * Random.Range(1.40f, 2.00f));
                        else
                            halfDaySellPrices[i] = Mathf.RoundToInt(b * Random.Range(0.45f, 0.85f));
                    }
                    break;

                case StalkMarketPattern.SmallSpike:
                    int smallPeak = Random.Range(3, 9);
                    for (int i = 0; i < 12; i++)
                    {
                        if (i == smallPeak)
                            halfDaySellPrices[i] = Mathf.RoundToInt(b * Random.Range(1.40f, 2.00f));
                        else if (Mathf.Abs(i - smallPeak) == 1)
                            halfDaySellPrices[i] = Mathf.RoundToInt(b * Random.Range(1.10f, 1.40f));
                        else
                            halfDaySellPrices[i] = Mathf.RoundToInt(b * Random.Range(0.60f, 0.90f));
                    }
                    break;

                case StalkMarketPattern.Decreasing:
                    float rate = 0.88f;
                    for (int i = 0; i < 12; i++)
                    {
                        halfDaySellPrices[i] = Mathf.RoundToInt(b * rate);
                        rate -= Random.Range(0.03f, 0.05f);
                    }
                    break;

                case StalkMarketPattern.Fluctuating:
                default:
                    for (int i = 0; i < 12; i++)
                    {
                        halfDaySellPrices[i] = Mathf.RoundToInt(b * (i % 2 == 0
                            ? Random.Range(0.95f, 1.40f)
                            : Random.Range(0.60f, 0.85f)));
                    }
                    break;
            }
        }
    }
}
