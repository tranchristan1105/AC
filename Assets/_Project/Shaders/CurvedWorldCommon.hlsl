#ifndef AC_CURVED_WORLD_COMMON_INCLUDED
#define AC_CURVED_WORLD_COMMON_INCLUDED

// Global uniforms updated every frame by CurvedWorldManager.cs
float _AC_PlayerFocusZ;
float _AC_CurveStrength;
float _AC_FlatNearZ;

/**
 * Reverse-Engineered Animal Crossing "Rolling Log" Horizon Vertex Displacement.
 *
 * Bends world-space Y downward quadratically as a function of Z-distance from the camera/player focus,
 * and analytically rotates the vertex normal using the surface tangent Jacobian so diffuse lighting
 * and URP shadow normal bias remain artifact-free across the horizon curve.
 */
void ApplyRollingLogCurvature(inout float3 positionWS, inout float3 normalWS)
{
    float signedDz = positionWS.z - _AC_PlayerFocusZ;
    float absDz = abs(signedDz);
    float effectiveDz = max(0.0, absDz - _AC_FlatNearZ);

    // Quadratic drop: y' = y - k * (effectiveDz)^2
    float dropY = _AC_CurveStrength * (effectiveDz * effectiveDz);
    positionWS.y -= dropY;

    // Analytical derivative dy'/dz = -2 * k * sign(signedDz) * effectiveDz
    if (effectiveDz > 0.0001 && _AC_CurveStrength > 0.00001)
    {
        float slope = -2.0 * _AC_CurveStrength * sign(signedDz) * effectiveDz;
        // Normal transformation from tangent (1, dy'/dz) -> (-slope, 1) in (Z, Y) plane
        float3 bentNormal = float3(
            normalWS.x,
            normalWS.y - slope * normalWS.z,
            normalWS.z + slope * normalWS.y
        );
        normalWS = normalize(bentNormal);
    }
}

void ApplyRollingLogPositionOnly(inout float3 positionWS)
{
    float absDz = abs(positionWS.z - _AC_PlayerFocusZ);
    float effectiveDz = max(0.0, absDz - _AC_FlatNearZ);
    positionWS.y -= _AC_CurveStrength * (effectiveDz * effectiveDz);
}

#endif
