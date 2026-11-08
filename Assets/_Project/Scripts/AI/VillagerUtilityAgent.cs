using UnityEngine;
using UnityEngine.AI;
using AnimalCrossing.Audio;

namespace AnimalCrossing.AI
{
    public enum VillagerBehaviorState
    {
        Idle,
        WanderAcre,
        InspectFlowers,
        WaveAtPlayer,
        TalkingToPlayer
    }

    /// <summary>
    /// Reverse-Engineered Animal Crossing Villager Utility AI & Friendship Agent.
    /// Uses NavMeshAgent (with automatic fallback steering) and evaluates nearby affordances.
    /// </summary>
    public class VillagerUtilityAgent : MonoBehaviour
    {
        [Header("Villager Profile & Voice")]
        public VillagerProfileSO profile;
        public AnimaleseSynthesizer voiceSynthesizer;
        public Transform rightArmTransform;

        [Header("AI Parameters")]
        public float wanderRadius = 6.5f;
        public float playerGreetingDistance = 2.8f;

        public VillagerBehaviorState CurrentState { get; private set; } = VillagerBehaviorState.Idle;
        public int FriendshipPoints { get; private set; } = 35; // 0..255 (6 friendship tiers)

        private NavMeshAgent _navAgent;
        private Vector3 _homeAnchor;
        private Vector3 _fallbackTarget;
        private float _decisionTimer;
        private int _dialogueIndex;

        private void Awake()
        {
            _navAgent = GetComponent<NavMeshAgent>();
            _homeAnchor = transform.position;
            _fallbackTarget = _homeAnchor;
        }

        private void Update()
        {
            if (CurrentState == VillagerBehaviorState.TalkingToPlayer)
            {
                return;
            }

            // Check if player is close enough to wave warmly
            if (Player.ACPlayerController.Instance != null)
            {
                Vector3 playerPos = Player.ACPlayerController.Instance.transform.position;
                float distToPlayer = Vector3.Distance(transform.position, playerPos);

                if (distToPlayer <= playerGreetingDistance)
                {
                    CurrentState = VillagerBehaviorState.WaveAtPlayer;
                    FacePosition(playerPos);
                    AnimateWaveArm();
                    return;
                }
            }

            if (rightArmTransform != null)
            {
                rightArmTransform.localRotation = Quaternion.Euler(0f, 0f, -15f);
            }

            _decisionTimer -= Time.deltaTime;
            if (_decisionTimer <= 0f)
            {
                EvaluateUtilityDecision();
            }

            UpdateWanderMovement();
        }

        private void EvaluateUtilityDecision()
        {
            _decisionTimer = Random.Range(3.5f, 6.5f);

            if (Random.value < 0.65f)
            {
                CurrentState = VillagerBehaviorState.WanderAcre;
                Vector2 randCircle = Random.insideUnitCircle * wanderRadius;
                _fallbackTarget = _homeAnchor + new Vector3(randCircle.x, 0f, randCircle.y);

                if (_navAgent != null && _navAgent.isOnNavMesh)
                {
                    _navAgent.SetDestination(_fallbackTarget);
                }
            }
            else
            {
                CurrentState = VillagerBehaviorState.Idle;
            }
        }

        private void UpdateWanderMovement()
        {
            if (CurrentState != VillagerBehaviorState.WanderAcre) return;

            if (_navAgent != null && _navAgent.isOnNavMesh)
            {
                return;
            }

            // Fallback steering when NavMesh has not been baked yet
            Vector3 delta = _fallbackTarget - transform.position;
            delta.y = 0f;
            if (delta.magnitude < 0.25f)
            {
                CurrentState = VillagerBehaviorState.Idle;
                return;
            }

            Vector3 dir = delta.normalized;
            transform.position += dir * (1.55f * Time.deltaTime);
            FacePosition(transform.position + dir);
        }

        public void InteractWithPlayer(Transform playerTransform)
        {
            CurrentState = VillagerBehaviorState.TalkingToPlayer;
            FacePosition(playerTransform.position);

            FriendshipPoints = Mathf.Min(255, FriendshipPoints + 2);

            string rawLine = "Hello there, islander!";
            float pitch = 390f;
            string catchphrase = "honey";

            if (profile != null && profile.dialogueLines != null && profile.dialogueLines.Length > 0)
            {
                rawLine = profile.dialogueLines[_dialogueIndex % profile.dialogueLines.Length];
                pitch = profile.baseVoicePitchHz;
                catchphrase = profile.defaultCatchphrase;
                _dialogueIndex++;
            }

            string formattedLine = rawLine.Replace("{catchphrase}", catchphrase);
            Debug.Log($"[{ (profile != null ? profile.displayName : name) }] (Friendship {FriendshipPoints}/255): {formattedLine}");

            if (voiceSynthesizer != null)
            {
                voiceSynthesizer.SpeakSentence(formattedLine, pitch);
            }

            Invoke(nameof(ResumeNormalBehavior), 3.5f);
        }

        private void ResumeNormalBehavior()
        {
            CurrentState = VillagerBehaviorState.Idle;
        }

        private void FacePosition(Vector3 targetWorldPos)
        {
            Vector3 look = targetWorldPos - transform.position;
            look.y = 0f;
            if (look.sqrMagnitude > 0.001f)
            {
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(look), 10f * Time.deltaTime);
            }
        }

        private void AnimateWaveArm()
        {
            if (rightArmTransform == null) return;
            float waveAngle = -135f + Mathf.Sin(Time.time * 12f) * 28f;
            rightArmTransform.localRotation = Quaternion.Euler(0f, 0f, waveAngle);
        }
    }
}
