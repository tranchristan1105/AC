using System.Collections.Generic;
using UnityEngine;

namespace AnimalCrossing.World
{
    /// <summary>
    /// Generates authentic Animal Crossing rounded/chamfered 3D Cliff & Overhang Grass Cap meshes
    /// driven by a tile's 4-bit Marching-Squares neighbor bitmask:
    ///   Bit 0 (1): North neighbor at same/higher elevation
    ///   Bit 1 (2): East neighbor at same/higher elevation
    ///   Bit 2 (4): South neighbor at same/higher elevation
    ///   Bit 3 (8): West neighbor at same/higher elevation
    /// </summary>
    public static class ProceduralCliffMeshBuilder
    {
        private static readonly Dictionary<int, Mesh> CachedBevelMeshes = new Dictionary<int, Mesh>();

        public static Mesh GetOrBuildCliffTileMesh(byte neighborMask, float height = 1.1f)
        {
            int key = (neighborMask << 16) ^ Mathf.RoundToInt(height * 100f);
            if (CachedBevelMeshes.TryGetValue(key, out Mesh cached) && cached != null)
            {
                return cached;
            }

            bool hasN = (neighborMask & (1 << 0)) != 0;
            bool hasE = (neighborMask & (1 << 1)) != 0;
            bool hasS = (neighborMask & (1 << 2)) != 0;
            bool hasW = (neighborMask & (1 << 3)) != 0;

            // Corner bevel radii: if both adjacent cardinal sides are exposed cliff edges, bevel the corner by 0.28m
            float bevelNW = (!hasN && !hasW) ? 0.28f : 0.0f;
            float bevelNE = (!hasN && !hasE) ? 0.28f : 0.0f;
            float bevelSE = (!hasS && !hasE) ? 0.28f : 0.0f;
            float bevelSW = (!hasS && !hasW) ? 0.28f : 0.0f;

            // Build 8-point 2D perimeter in local tile space [-0.5, +0.5]
            Vector2[] perimeter =
            {
                new Vector2(-0.5f + bevelNW,  0.5f),
                new Vector2( 0.5f - bevelNE,  0.5f),
                new Vector2( 0.5f,            0.5f - bevelNE),
                new Vector2( 0.5f,           -0.5f + bevelSE),
                new Vector2( 0.5f - bevelSE, -0.5f),
                new Vector2(-0.5f + bevelSW, -0.5f),
                new Vector2(-0.5f,           -0.5f + bevelSW),
                new Vector2(-0.5f,            0.5f - bevelNW)
            };

            Mesh mesh = new Mesh
            {
                name = $"AC_CliffTile_Mask{neighborMask}"
            };

            List<Vector3> vertices = new List<Vector3>();
            List<Vector3> normals = new List<Vector3>();
            List<Vector2> uvs = new List<Vector2>();
            List<int> soilTriangles = new List<int>();
            List<int> grassCapTriangles = new List<int>();

            float capThickness = 0.16f;
            float soilTopY = height - capThickness;

            // --- SUBMESH 0: Cliff Soil Extrusion (0 -> soilTopY) ---
            for (int i = 0; i < perimeter.Length; i++)
            {
                int next = (i + 1) % perimeter.Length;
                Vector2 p0 = perimeter[i];
                Vector2 p1 = perimeter[next];
                if ((p1 - p0).sqrMagnitude < 0.0001f) continue;

                Vector2 edge = (p1 - p0).normalized;
                Vector3 wallNormal = new Vector3(edge.y, 0f, -edge.x);

                int baseIdx = vertices.Count;
                vertices.Add(new Vector3(p0.x, 0f, p0.y));
                vertices.Add(new Vector3(p1.x, 0f, p1.y));
                vertices.Add(new Vector3(p1.x, soilTopY, p1.y));
                vertices.Add(new Vector3(p0.x, soilTopY, p0.y));

                for (int k = 0; k < 4; k++) normals.Add(wallNormal);
                uvs.Add(new Vector2(0f, 0f));
                uvs.Add(new Vector2(1f, 0f));
                uvs.Add(new Vector2(1f, 1f));
                uvs.Add(new Vector2(0f, 1f));

                soilTriangles.Add(baseIdx + 0);
                soilTriangles.Add(baseIdx + 2);
                soilTriangles.Add(baseIdx + 1);

                soilTriangles.Add(baseIdx + 0);
                soilTriangles.Add(baseIdx + 3);
                soilTriangles.Add(baseIdx + 2);
            }

            // --- SUBMESH 1: Grass Cap Lip & Top Face (soilTopY -> height) ---
            const float overhang = 1.035f;
            for (int i = 0; i < perimeter.Length; i++)
            {
                int next = (i + 1) % perimeter.Length;
                Vector2 p0 = perimeter[i] * overhang;
                Vector2 p1 = perimeter[next] * overhang;
                if ((p1 - p0).sqrMagnitude < 0.0001f) continue;

                Vector2 edge = (p1 - p0).normalized;
                Vector3 lipNormal = new Vector3(edge.y, 0.2f, -edge.x).normalized;

                int baseIdx = vertices.Count;
                vertices.Add(new Vector3(p0.x, soilTopY, p0.y));
                vertices.Add(new Vector3(p1.x, soilTopY, p1.y));
                vertices.Add(new Vector3(p1.x, height, p1.y));
                vertices.Add(new Vector3(p0.x, height, p0.y));

                for (int k = 0; k < 4; k++) normals.Add(lipNormal);
                uvs.Add(new Vector2(0f, 0f));
                uvs.Add(new Vector2(1f, 0f));
                uvs.Add(new Vector2(1f, 1f));
                uvs.Add(new Vector2(0f, 1f));

                grassCapTriangles.Add(baseIdx + 0);
                grassCapTriangles.Add(baseIdx + 2);
                grassCapTriangles.Add(baseIdx + 1);

                grassCapTriangles.Add(baseIdx + 0);
                grassCapTriangles.Add(baseIdx + 3);
                grassCapTriangles.Add(baseIdx + 2);
            }

            // Top Grass Polygon Fan
            int centerIdx = vertices.Count;
            vertices.Add(new Vector3(0f, height, 0f));
            normals.Add(Vector3.up);
            uvs.Add(new Vector2(0.5f, 0.5f));

            int ringStart = vertices.Count;
            for (int i = 0; i < perimeter.Length; i++)
            {
                Vector2 p = perimeter[i] * overhang;
                vertices.Add(new Vector3(p.x, height, p.y));
                normals.Add(Vector3.up);
                uvs.Add(new Vector2(p.x + 0.5f, p.y + 0.5f));
            }

            for (int i = 0; i < perimeter.Length; i++)
            {
                int next = (i + 1) % perimeter.Length;
                grassCapTriangles.Add(centerIdx);
                grassCapTriangles.Add(ringStart + i);
                grassCapTriangles.Add(ringStart + next);
            }

            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetUVs(0, uvs);
            mesh.subMeshCount = 2;
            mesh.SetTriangles(soilTriangles, 0);
            mesh.SetTriangles(grassCapTriangles, 1);
            mesh.RecalculateBounds();

            CachedBevelMeshes[key] = mesh;
            return mesh;
        }
    }
}
