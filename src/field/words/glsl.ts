export const WORD_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
varying vec3 vColor;
varying float vPhase;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vPhase = aPhase;
}
`;

export const WORD_FRAG = /* glsl */ `
precision mediump float;
uniform float uTime;
varying vec3 vColor;
varying float vPhase;
void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  float core = smoothstep(0.22, 0.0, r);
  float halo = smoothstep(1.0, 0.0, r);
  halo *= halo;
  float tw = 0.72 + 0.28 * sin(uTime * 1.4 + vPhase);
  float a = clamp((core + halo * 0.62) * tw, 0.0, 1.0);
  gl_FragColor = vec4(vColor, a);
}
`;
