using System.Collections;
using UnityEngine;
using AnimalCrossing.Economy;

namespace AnimalCrossing.Player
{
    /// <summary>
    /// Reverse-Engineered Animal Crossing Fishing Bobber & Nibble State Machine.
    /// Implements parabolic line rendering, 1-to-4 fake-out nibbles with mobile haptic feedback,
    /// and a timed reflex bite window.
    /// </summary>
    [RequireComponent(typeof(LineRenderer))]
    public class FishingController : MonoBehaviour
    {
        [Header("Fishing Configuration")]
        public float castDistance = 2.6f;
        public float biteReflexWindowSeconds = 1.45f;
        public Transform rodTipTransform;
        public Transform bobberTransform;

        public bool IsLineCast { get; private set; }
        public bool IsFishBiting { get; private set; }

        private LineRenderer _lineRenderer;
        private Coroutine _fishingRoutine;

        private void Awake()
        {
            _lineRenderer = GetComponent<LineRenderer>();
            _lineRenderer.positionCount = 12;
            _lineRenderer.startWidth = 0.025f;
            _lineRenderer.endWidth = 0.015f;
            _lineRenderer.enabled = false;

            if (bobberTransform != null)
            {
                bobberTransform.gameObject.SetActive(false);
            }
        }

        private void LateUpdate()
        {
            if (!IsLineCast || bobberTransform == null) return;

            Vector3 start = rodTipTransform != null ? rodTipTransform.position : transform.position + Vector3.up * 1.1f;
            Vector3 end = bobberTransform.position;

            for (int i = 0; i < _lineRenderer.positionCount; i++)
            {
                float t = i / (float)(_lineRenderer.positionCount - 1);
                Vector3 pt = Vector3.Lerp(start, end, t);
                // Slack catenary sag along fishing line
                pt.y -= Mathf.Sin(t * Mathf.PI) * 0.28f;
                _lineRenderer.SetPosition(i, pt);
            }
        }

        public void ToggleCastOrReel(Vector3 playerPos, Vector3 playerForward)
        {
            if (!IsLineCast)
            {
                CastLine(playerPos, playerForward);
            }
            else
            {
                TryReelIn();
            }
        }

        private void CastLine(Vector3 playerPos, Vector3 playerForward)
        {
            IsLineCast = true;
            IsFishBiting = false;

            Vector3 landingSpot = playerPos + playerForward.normalized * castDistance;
            landingSpot.y = 0.15f;

            if (bobberTransform != null)
            {
                bobberTransform.position = landingSpot;
                bobberTransform.gameObject.SetActive(true);
            }

            _lineRenderer.enabled = true;
            _fishingRoutine = StartCoroutine(FishNibbleAndBiteRoutine());
        }

        private void TryReelIn()
        {
            if (IsFishBiting)
            {
                string[] fishPool = { "sea_bass", "red_snapper", "koi", "coelacanth" };
                string caughtId = fishPool[Random.Range(0, fishPool.Length)];
                PocketInventoryManager.Instance?.AddItem(caughtId, 1);
                Debug.Log($"[FishingController] Caught {caughtId}!");
            }
            else
            {
                Debug.Log("[FishingController] Reeled in too early! The fish fled.");
            }

            CancelLine();
        }

        public void CancelLine()
        {
            if (_fishingRoutine != null)
            {
                StopCoroutine(_fishingRoutine);
                _fishingRoutine = null;
            }

            IsLineCast = false;
            IsFishBiting = false;
            _lineRenderer.enabled = false;

            if (bobberTransform != null)
            {
                bobberTransform.gameObject.SetActive(false);
            }
        }

        private IEnumerator FishNibbleAndBiteRoutine()
        {
            Vector3 restPos = bobberTransform != null ? bobberTransform.position : Vector3.zero;
            int nibbles = Random.Range(1, 5); // 1 to 4 nibbles before the real bite

            for (int i = 0; i < nibbles; i++)
            {
                yield return new WaitForSeconds(Random.Range(0.95f, 1.65f));
                if (bobberTransform != null)
                {
                    bobberTransform.position = restPos + Vector3.down * 0.12f;
                }
                yield return new WaitForSeconds(0.15f);
                if (bobberTransform != null)
                {
                    bobberTransform.position = restPos;
                }
            }

            // Real Bite! Submerge bobber & trigger mobile haptic vibration
            yield return new WaitForSeconds(Random.Range(0.8f, 1.3f));
            IsFishBiting = true;
            if (bobberTransform != null)
            {
                bobberTransform.position = restPos + Vector3.down * 0.32f;
            }

            #if UNITY_IOS || UNITY_ANDROID
            Handheld.Vibrate();
            #endif

            yield return new WaitForSeconds(biteReflexWindowSeconds);

            // Missed the bite window
            IsFishBiting = false;
            CancelLine();
        }
    }
}
