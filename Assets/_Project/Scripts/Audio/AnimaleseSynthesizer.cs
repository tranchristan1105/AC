using System.Collections;
using UnityEngine;

namespace AnimalCrossing.Audio
{
    /// <summary>
    /// Reverse-Engineered Animal Crossing Procedural "Animalese" Speech Synthesizer.
    /// Uses Unity's real-time audio DSP callback (OnAudioFilterRead) to generate formant-filtered
    /// vocal syllables per character with zero external audio asset dependencies.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public class AnimaleseSynthesizer : MonoBehaviour
    {
        [Header("Voice Parameters")]
        [Range(0.01f, 0.35f)]
        public float masterGain = 0.09f;
        public float charDurationSeconds = 0.055f;

        private volatile bool _isSpeakingPhoneme;
        private volatile float _currentFreqHz = 380f;
        private volatile float _formantFreqHz = 1100f;
        private double _phase;
        private double _formantPhase;
        private int _sampleRate = 48000;

        private Coroutine _speechRoutine;

        private void Awake()
        {
            _sampleRate = AudioSettings.outputSampleRate;
            AudioSource src = GetComponent<AudioSource>();
            src.playOnAwake = true;
            src.loop = true;
            src.spatialBlend = 0.4f;
            if (!src.isPlaying)
            {
                src.Play();
            }
        }

        public void SpeakSentence(string sentence, float basePitchHz = 385f)
        {
            if (_speechRoutine != null)
            {
                StopCoroutine(_speechRoutine);
            }
            _speechRoutine = StartCoroutine(SpeakSentenceRoutine(sentence, basePitchHz));
        }

        private IEnumerator SpeakSentenceRoutine(string sentence, float basePitchHz)
        {
            bool isQuestion = sentence.TrimEnd().EndsWith("?");

            for (int i = 0; i < sentence.Length; i++)
            {
                char c = char.ToLowerInvariant(sentence[i]);
                if (char.IsLetterOrDigit(c))
                {
                    int code = c - 'a';
                    float melodicJitter = Mathf.Sin(i * 1.45f) * 0.08f + ((code % 7) - 3) * 0.025f;
                    float questionRise = (isQuestion && i > sentence.Length - 6) ? 1.15f : 1.0f;

                    _currentFreqHz = basePitchHz * (1f + melodicJitter) * questionRise;
                    _formantFreqHz = 800f + ((Mathf.Abs(code) * 97) % 1200);
                    _isSpeakingPhoneme = true;

                    yield return new WaitForSeconds(charDurationSeconds * 0.78f);
                    _isSpeakingPhoneme = false;
                    yield return new WaitForSeconds(charDurationSeconds * 0.22f);
                }
                else if (c == ',' || c == '.' || c == '!' || c == '?')
                {
                    _isSpeakingPhoneme = false;
                    yield return new WaitForSeconds(0.14f);
                }
                else
                {
                    _isSpeakingPhoneme = false;
                    yield return new WaitForSeconds(0.025f);
                }
            }

            _isSpeakingPhoneme = false;
        }

        private void OnAudioFilterRead(float[] data, int channels)
        {
            if (!_isSpeakingPhoneme) return;

            double freqIncrement = _currentFreqHz / _sampleRate;
            double formantIncrement = _formantFreqHz / _sampleRate;

            for (int i = 0; i < data.Length; i += channels)
            {
                _phase += freqIncrement;
                if (_phase > 1.0) _phase -= 1.0;

                _formantPhase += formantIncrement;
                if (_formantPhase > 1.0) _formantPhase -= 1.0;

                // Blend sawtooth glottal pulse with resonant formant carrier
                float glottalSaw = (float)(_phase * 2.0 - 1.0);
                float formantWave = Mathf.Sin((float)(_formantPhase * Mathf.PI * 2.0));
                float sample = (glottalSaw * 0.55f + formantWave * 0.45f) * masterGain;

                for (int ch = 0; ch < channels; ch++)
                {
                    data[i + ch] += sample;
                }
            }
        }
    }
}
