import * as THREE from 'three';

export interface RollingCurveUniforms {
  uCameraFocusZ: { value: number };
  uCurveStrength: { value: number };
  uFlatNearZ: { value: number };
}

/**
 * Reverse-Engineered Animal Crossing "Rolling Log" Horizon Shader.
 *
 * All simulation, collision, and grid coordinates live on a flat Cartesian plane (x, y, z).
 * During the vertex stage, vertices further north (smaller Z than the camera focus) or
 * further away along the Z-axis bend downward quadratically:
 *
 *   Δz = max(0.0, abs(worldPosition.z - uCameraFocusZ) - uFlatNearZ)
 *   worldPosition.y -= uCurveStrength * (Δz * Δz)
 */
export class RollingWorldShader {
  public static uniforms: RollingCurveUniforms = {
    uCameraFocusZ: { value: 24.0 },
    uCurveStrength: { value: 0.024 },
    uFlatNearZ: { value: 3.5 },
  };

  private static patchedMaterials: Set<THREE.Material> = new Set();

  public static applyToMaterial<T extends THREE.Material>(material: T): T {
    if (this.patchedMaterials.has(material)) {
      return material;
    }
    this.patchedMaterials.add(material);

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCameraFocusZ = RollingWorldShader.uniforms.uCameraFocusZ;
      shader.uniforms.uCurveStrength = RollingWorldShader.uniforms.uCurveStrength;
      shader.uniforms.uFlatNearZ = RollingWorldShader.uniforms.uFlatNearZ;

      shader.vertexShader = `
        uniform float uCameraFocusZ;
        uniform float uCurveStrength;
        uniform float uFlatNearZ;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `
        vec4 acWorldPos = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          acWorldPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        float acDeltaZ = max(0.0, abs(acWorldPos.z - uCameraFocusZ) - uFlatNearZ);
        float acDropY = uCurveStrength * acDeltaZ * acDeltaZ;
        acWorldPos.y -= acDropY;
        vec4 mvPosition = viewMatrix * acWorldPos;
        gl_Position = projectionMatrix * mvPosition;
        `
      );
    };

    material.needsUpdate = true;
    return material;
  }

  /**
   * Computes the displaced 3D world position of any point after applying the rolling-log curve,
   * used for projecting floating UI badges, speech bubbles, and touch raycast corrections.
   */
  public static evaluateCurvedPoint(worldPos: THREE.Vector3, target = new THREE.Vector3()): THREE.Vector3 {
    target.copy(worldPos);
    const deltaZ = Math.max(0, Math.abs(worldPos.z - this.uniforms.uCameraFocusZ.value) - this.uniforms.uFlatNearZ.value);
    target.y -= this.uniforms.uCurveStrength.value * deltaZ * deltaZ;
    return target;
  }

  public static setFocusZ(focusZ: number): void {
    this.uniforms.uCameraFocusZ.value = focusZ;
  }

  public static setCurveStrength(strength: number): void {
    this.uniforms.uCurveStrength.value = THREE.MathUtils.clamp(strength, 0.0, 0.065);
  }

  public static getCurveStrength(): number {
    return this.uniforms.uCurveStrength.value;
  }
}
