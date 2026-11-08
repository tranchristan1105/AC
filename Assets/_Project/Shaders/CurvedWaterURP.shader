Shader "AnimalCrossing/CurvedWaterURP"
{
    Properties
    {
        _ShallowColor("Shallow Turquoise Color", Color) = (0.20, 0.78, 0.92, 0.88)
        _DeepColor("Deep Ocean Color", Color) = (0.08, 0.48, 0.78, 0.94)
        _FoamColor("Shoreline Foam Color", Color) = (0.96, 0.99, 1.0, 1.0)
        _WaveSpeed("Wave Ripple Speed", Range(0.2, 4.0)) = 1.4
        _WaveAmplitude("Wave Height", Range(0.0, 0.2)) = 0.045
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "Transparent"
            "RenderPipeline" = "UniversalPipeline"
            "Queue" = "Transparent"
        }

        Pass
        {
            Name "UniversalForward"
            Tags { "LightMode" = "UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "CurvedWorldCommon.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
                float2 uv         : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float2 uv         : TEXCOORD1;
            };

            CBUFFER_START(UnityPerMaterial)
                half4 _ShallowColor;
                half4 _DeepColor;
                half4 _FoamColor;
                float _WaveSpeed;
                float _WaveAmplitude;
            CBUFFER_END

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                float3 posWS = TransformObjectToWorld(IN.positionOS.xyz);

                // Gentle surface wave displacement before horizon curve
                float wave = sin(posWS.x * 2.2 + _Time.y * _WaveSpeed) * cos(posWS.z * 1.9 + _Time.y * _WaveSpeed * 0.8);
                posWS.y += wave * _WaveAmplitude;

                ApplyRollingLogPositionOnly(posWS);

                OUT.positionWS = posWS;
                OUT.uv = IN.uv;
                OUT.positionCS = TransformWorldToHClip(posWS);
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                // Procedural sparkling water caustics & shoreline foam band
                float rippleA = sin(IN.positionWS.x * 3.8 + _Time.y * _WaveSpeed * 1.3);
                float rippleB = cos(IN.positionWS.z * 3.4 - _Time.y * _WaveSpeed * 1.1);
                float caustic = smoothstep(0.72, 0.92, (rippleA * rippleB) * 0.5 + 0.5);

                half4 waterCol = lerp(_DeepColor, _ShallowColor, saturate(IN.uv.y));
                half3 finalRGB = lerp(waterCol.rgb, _FoamColor.rgb, caustic * 0.35);

                Light mainLight = GetMainLight();
                finalRGB *= (mainLight.color * 0.85h + 0.25h);

                return half4(finalRGB, waterCol.a);
            }
            ENDHLSL
        }
    }
}
