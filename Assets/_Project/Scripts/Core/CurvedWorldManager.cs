using UnityEngine;

namespace AnimalCrossing.Core
{
    /// <summary>
    /// Reverse-Engineered Animal Crossing "Rolling Log" Horizon Controller.
    /// Runs in both Edit Mode and Play Mode ([ExecuteAlways]) to synchronize global HLSL shader uniforms
    /// and provide analytical inverse-curve raycasting for mobile touch input.
    /// </summary>
    [ExecuteAlways]
    public class CurvedWorldManager : MonoBehaviour
    {
        public static CurvedWorldManager Instance { get; private set; }

        [Header("Rolling-Log Horizon Parameters")]
        [Tooltip("Target Transform (usually the Player or Camera Focus) that anchors the flat near-zone.")]
        public Transform focusTarget;

        [Range(0.0f, 0.06f)]
        [Tooltip("0.000 = Flat Cartesian Grid, 0.024 = New Horizons Curve, 0.050 = Wild World Cylinder")]
        public float curveStrength = 0.024f;

        [Range(0.0f, 10.0f)]
        [Tooltip("Flat radius around the player before the horizon starts bending downward.")]
        public float flatNearZ = 3.5f;

        private static readonly int PlayerFocusZProp = Shader.PropertyToID("_AC_PlayerFocusZ");
        private static readonly int CurveStrengthProp = Shader.PropertyToID("_AC_CurveStrength");
        private static readonly int FlatNearZProp = Shader.PropertyToID("_AC_FlatNearZ");

        private void OnEnable()
        {
            Instance = this;
            PushShaderGlobals();
        }

        private void LateUpdate()
        {
            PushShaderGlobals();
        }

        public void PushShaderGlobals()
        {
            float focusZ = focusTarget != null ? focusTarget.position.z : transform.position.z;
            Shader.SetGlobalFloat(PlayerFocusZProp, focusZ);
            Shader.SetGlobalFloat(CurveStrengthProp, curveStrength);
            Shader.SetGlobalFloat(FlatNearZProp, flatNearZ);
        }

        /// <summary>
        /// Evaluates the visually displaced 3D world position after the vertex shader bends the horizon.
        /// Use this when positioning World-Space UI canvases (speech bubbles, interaction prompts).
        /// </summary>
        public Vector3 EvaluateCurvedPosition(Vector3 flatWorldPos)
        {
            float focusZ = focusTarget != null ? focusTarget.position.z : 0f;
            float effectiveDz = Mathf.Max(0f, Mathf.Abs(flatWorldPos.z - focusZ) - flatNearZ);
            flatWorldPos.y -= curveStrength * (effectiveDz * effectiveDz);
            return flatWorldPos;
        }

        /// <summary>
        /// Casts a ray from a mobile screen touch through the curved visual space into the flat physics world.
        /// Since Unity PhysX colliders remain on the flat Cartesian grid, we march along the camera ray
        /// and apply the inverse vertical curve offset (+k * dz^2) before testing physics intersection.
        /// </summary>
        public bool RaycastCurvedWorld(Camera cam, Vector2 screenPoint, out Vector3 flatHitPoint, out Collider hitCollider, LayerMask layerMask)
        {
            Ray screenRay = cam.ScreenPointToRay(screenPoint);
            float focusZ = focusTarget != null ? focusTarget.position.z : 0f;

            const int steps = 32;
            const float maxDist = 45f;
            float stepSize = maxDist / steps;

            Vector3 prevUnbent = screenRay.origin;

            for (int i = 1; i <= steps; i++)
            {
                float t = i * stepSize;
                Vector3 samplePt = screenRay.GetPoint(t);

                // Invert vertex drop: a point rendered at samplePt.y originated from flatY = samplePt.y + k * dz^2
                float effectiveDz = Mathf.Max(0f, Mathf.Abs(samplePt.z - focusZ) - flatNearZ);
                Vector3 unbentPt = samplePt;
                unbentPt.y += curveStrength * (effectiveDz * effectiveDz);

                Vector3 seg = unbentPt - prevUnbent;
                float segLen = seg.magnitude;
                if (segLen > 0.001f && Physics.Raycast(prevUnbent, seg / segLen, out RaycastHit hit, segLen, layerMask))
                {
                    flatHitPoint = hit.point;
                    hitCollider = hit.collider;
                    return true;
                }

                prevUnbent = unbentPt;
            }

            flatHitPoint = Vector3.zero;
            hitCollider = null;
            return false;
        }
    }
}
