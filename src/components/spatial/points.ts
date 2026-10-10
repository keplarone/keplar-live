/** Shared round-dot point shader for spatial scenes (per-point size, colour and alpha attributes). */
export const pointsVertex = /* glsl */ `
  attribute float aSize; attribute vec3 aColor; attribute float aAlpha;
  varying vec3 vColor; varying float vAlpha;
  void main() { vColor = aColor; vAlpha = aAlpha; gl_PointSize = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const pointsFragment = /* glsl */ `
  precision mediump float; varying vec3 vColor; varying float vAlpha;
  void main() { float d = length(gl_PointCoord - 0.5); float m = smoothstep(0.5, 0.42, d); gl_FragColor = vec4(vColor, m * vAlpha); }
`;
