using UnityEngine;
using AnimalCrossing.Core;
using AnimalCrossing.World;
using AnimalCrossing.AI;

namespace AnimalCrossing.Player
{
    public enum PlayerToolType
    {
        Hand = 0,
        Axe = 1,
        Shovel = 2,
        FishingRod = 3,
        BugNet = 4,
        WateringCan = 5,
        CliffPermit = 6,
        WaterPermit = 7
    }

    /// <summary>
    /// Mobile-First Animal Crossing 3D Player Controller.
    /// Combines Unity CharacterController physics on the flat Cartesian grid with
    /// virtual thumbstick input, inverse-curve touch raycasting, and tool state execution.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class ACPlayerController : MonoBehaviour
    {
        public static ACPlayerController Instance { get; private set; }

        [Header("Movement Settings")]
        public float moveSpeed = 4.6f;
        public float rotationSmoothSpeed = 14f;
        public float gravity = -19.62f;

        [Header("Equipment & References")]
        public PlayerToolType equippedTool = PlayerToolType.Hand;
        public Transform rightHandToolSocket;
        public FishingController fishingController;
        public LayerMask interactableLayerMask = ~0;

        private CharacterController _controller;
        private Vector2 _mobileJoystickInput;
        private Vector3? _tapMoveDestination;
        private float _verticalVelocity;

        private void Awake()
        {
            Instance = this;
            _controller = GetComponent<CharacterController>();
        }

        private void Update()
        {
            HandleKeyboardShortcuts();
            UpdateMovement();
        }

        /// <summary>
        /// Called by Mobile Touch UI Virtual Thumbstick.
        /// </summary>
        public void SetMobileJoystickInput(Vector2 joystickVector)
        {
            _mobileJoystickInput = Vector2.ClampMagnitude(joystickVector, 1f);
            if (_mobileJoystickInput.sqrMagnitude > 0.01f)
            {
                _tapMoveDestination = null;
            }
        }

        public void EquipTool(PlayerToolType newTool)
        {
            equippedTool = newTool;
            if (fishingController != null && fishingController.IsLineCast && newTool != PlayerToolType.FishingRod)
            {
                fishingController.CancelLine();
            }
        }

        private void HandleKeyboardShortcuts()
        {
            if (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.E) || Input.GetKeyDown(KeyCode.Return))
            {
                ExecuteContextAction();
            }

            if (Input.GetKeyDown(KeyCode.Alpha1)) EquipTool(PlayerToolType.Hand);
            if (Input.GetKeyDown(KeyCode.Alpha2)) EquipTool(PlayerToolType.Axe);
            if (Input.GetKeyDown(KeyCode.Alpha3)) EquipTool(PlayerToolType.Shovel);
            if (Input.GetKeyDown(KeyCode.Alpha4)) EquipTool(PlayerToolType.FishingRod);
            if (Input.GetKeyDown(KeyCode.Alpha5)) EquipTool(PlayerToolType.BugNet);
            if (Input.GetKeyDown(KeyCode.Alpha6)) EquipTool(PlayerToolType.WateringCan);
            if (Input.GetKeyDown(KeyCode.Alpha7)) EquipTool(PlayerToolType.CliffPermit);
            if (Input.GetKeyDown(KeyCode.Alpha8)) EquipTool(PlayerToolType.WaterPermit);

            // Tap-to-walk / Tap-to-interact using analytical inverse-curve raycast
            if (Input.GetMouseButtonDown(0) && Camera.main != null && CurvedWorldManager.Instance != null)
            {
                if (UnityEngine.EventSystems.EventSystem.current != null &&
                    UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject())
                {
                    return;
                }

                if (CurvedWorldManager.Instance.RaycastCurvedWorld(
                        Camera.main,
                        Input.mousePosition,
                        out Vector3 flatHit,
                        out Collider hitCol,
                        interactableLayerMask))
                {
                    float dist = Vector2.Distance(
                        new Vector2(transform.position.x, transform.position.z),
                        new Vector2(flatHit.x, flatHit.z));

                    if (dist < 1.9f && hitCol != null)
                    {
                        Vector3 lookDir = flatHit - transform.position;
                        lookDir.y = 0f;
                        if (lookDir.sqrMagnitude > 0.01f)
                        {
                            transform.rotation = Quaternion.LookRotation(lookDir.normalized);
                        }
                        ExecuteContextAction();
                    }
                    else
                    {
                        _tapMoveDestination = flatHit;
                    }
                }
            }
        }

        private void UpdateMovement()
        {
            if (fishingController != null && fishingController.IsLineCast)
            {
                return;
            }

            Vector2 moveInput = _mobileJoystickInput;

            // Poll keyboard / gamepad axes if virtual thumbstick is idle
            if (moveInput.sqrMagnitude < 0.01f)
            {
                float h = Input.GetAxisRaw("Horizontal");
                float v = Input.GetAxisRaw("Vertical");
                moveInput = Vector2.ClampMagnitude(new Vector2(h, v), 1f);
                if (moveInput.sqrMagnitude > 0.01f)
                {
                    _tapMoveDestination = null;
                }
            }

            // Tap-to-walk steering
            if (moveInput.sqrMagnitude < 0.01f && _tapMoveDestination.HasValue)
            {
                Vector3 delta = _tapMoveDestination.Value - transform.position;
                delta.y = 0f;
                if (delta.magnitude < 0.35f)
                {
                    _tapMoveDestination = null;
                }
                else
                {
                    Vector3 dir = delta.normalized;
                    moveInput = new Vector2(dir.x, dir.z);
                }
            }

            Vector3 horizontalVelocity = new Vector3(moveInput.x, 0f, moveInput.y) * moveSpeed;

            if (horizontalVelocity.sqrMagnitude > 0.01f)
            {
                Quaternion targetRot = Quaternion.LookRotation(horizontalVelocity.normalized, Vector3.up);
                transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, rotationSmoothSpeed * Time.deltaTime);
            }

            if (_controller.isGrounded && _verticalVelocity < 0f)
            {
                _verticalVelocity = -2f;
            }
            _verticalVelocity += gravity * Time.deltaTime;

            Vector3 finalMotion = horizontalVelocity + Vector3.up * _verticalVelocity;
            _controller.Move(finalMotion * Time.deltaTime);
        }

        /// <summary>
        /// Context-sensitive [A] button action: talks to villagers, reels in fish, shakes/chops trees,
        /// strikes rocks, digs fossils, or terraforms cliffs/rivers.
        /// </summary>
        public void ExecuteContextAction()
        {
            // 1. Active Fishing Rod Cast / Reel
            if (equippedTool == PlayerToolType.FishingRod && fishingController != null)
            {
                fishingController.ToggleCastOrReel(transform.position, transform.forward);
                return;
            }

            // 2. Check for nearby Villager to talk to
            Collider[] nearby = Physics.OverlapSphere(transform.position + transform.forward * 0.9f, 1.25f);
            foreach (Collider col in nearby)
            {
                VillagerUtilityAgent villager = col.GetComponentInParent<VillagerUtilityAgent>();
                if (villager != null)
                {
                    villager.InteractWithPlayer(transform);
                    return;
                }
            }

            // 3. Check for nearby InteractableWorldProp (Tree, Rock, Fossil, Workbench)
            foreach (Collider col in nearby)
            {
                InteractableWorldProp prop = col.GetComponentInParent<InteractableWorldProp>();
                if (prop != null)
                {
                    switch (equippedTool)
                    {
                        case PlayerToolType.Axe:
                            prop.InteractWithAxe();
                            break;
                        case PlayerToolType.Shovel:
                            prop.InteractWithShovel();
                            break;
                        default:
                            prop.InteractWithHand();
                            break;
                    }
                    return;
                }
            }

            // 4. Island Designer Terraforming Permits (Cliff & River sculpting)
            if (IslandGridManager.Instance != null)
            {
                Vector3 targetWorld = transform.position + transform.forward * 1.15f;
                Vector2Int coords = IslandGridManager.Instance.WorldToTileCoords(targetWorld);

                if (equippedTool == PlayerToolType.CliffPermit)
                {
                    IslandGridManager.Instance.TryTerraformCliff(coords.x, coords.y);
                }
                else if (equippedTool == PlayerToolType.WaterPermit)
                {
                    IslandGridManager.Instance.TryTerraformWater(coords.x, coords.y);
                }
            }
        }
    }
}
