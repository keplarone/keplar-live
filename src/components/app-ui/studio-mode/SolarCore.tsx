"use client";

import { useEffect, useRef } from "react";
import s from "./solar.module.css";

/**
 * The Solar core: a small three.js scene in the Studio overlay that shows what the build is really doing. It never runs on
 * its own schedule of fake work: every state comes from useStudioAgent (looking, planning, a running Studio step, a play
 * test, finished, a warning), and `pulse` changes only when a Studio step actually completes.
 *
 *   idle      slow turn, breathing glow            typing    the core leans in with each keystroke
 *   looking   a scan ring sweeps the shell         planning  the rings separate onto new axes
 *   thinking  particles stream inward (a model call is in flight)
 *   building  particles and node links run hot; each completed step sends a pulse through the structure
 *   testing   the rings lock to three square axes and step round
 *   done      everything converges and flashes once          error  a short shake, a red tint, then it settles
 *
 * The renderer is transparent (the overlay window shows Studio through it), capped at 2x pixel density, paused while the page
 * is hidden or the core is off screen, drawn once and then left still with reduced motion, and fully disposed on unmount.
 */
export type SolarState = "idle" | "typing" | "looking" | "planning" | "thinking" | "building" | "testing" | "done" | "error";

const RINGS = 3;
const NODES = 9;
const PARTICLES = 420;

export function SolarCore({ state, pulse, typing = 0, className }: { state: SolarState; pulse: number; typing?: number; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ state, pulse, typing });
  const kick = useRef<() => void>(() => {});

  useEffect(() => { live.current = { state, pulse, typing }; kick.current(); }, [state, pulse, typing]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    void import("three").then((THREE) => {
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power", premultipliedAlpha: true });
      } catch {
        el.dataset.fallback = "";
        return;
      }
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
      camera.position.set(0, 0, 6.2);
      const root = new THREE.Group();
      scene.add(root);

      const hues = [new THREE.Color("#b77cff"), new THREE.Color("#45d8ec"), new THREE.Color("#ff6fb2")];
      const ok = new THREE.Color("#5ef2a6");
      const bad = new THREE.Color("#ff5d5d");

      // Core: a displaced sphere with a fresnel rim, its colour flowing between the three hues.
      const coreUniforms = {
        uTime: { value: 0 }, uEnergy: { value: 0.3 }, uFlash: { value: 0 }, uTint: { value: new THREE.Color(0, 0, 0) }, uTintAmt: { value: 0 },
        uA: { value: hues[0] }, uB: { value: hues[1] }, uC: { value: hues[2] },
      };
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.62, 5),
        new THREE.ShaderMaterial({
          uniforms: coreUniforms,
          transparent: true,
          vertexShader: `
            uniform float uTime; uniform float uEnergy; varying vec3 vN; varying vec3 vP; varying float vW;
            float w(vec3 p){ return sin(p.x*3.1+uTime*1.3)*sin(p.y*2.7-uTime*1.1)*sin(p.z*3.3+uTime*0.9); }
            void main(){ float d = w(position) * (0.05 + 0.09*uEnergy); vW = d; vec3 p = position + normal*d;
              vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(p,1.0); vP = mv.xyz; gl_Position = projectionMatrix*mv; }`,
          fragmentShader: `
            uniform float uTime; uniform float uEnergy; uniform float uFlash; uniform vec3 uTint; uniform float uTintAmt;
            uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; varying vec3 vN; varying vec3 vP; varying float vW;
            void main(){ vec3 v = normalize(-vP); float f = pow(1.0 - max(dot(vN, v), 0.0), 2.2);
              float t = 0.5 + 0.5*sin(uTime*0.6 + vW*18.0 + vN.y*2.0);
              vec3 c = mix(mix(uA, uB, t), uC, 0.5 + 0.5*sin(uTime*0.4 + vN.x*3.0));
              vec3 body = c*(0.28 + 0.35*uEnergy) + vec3(1.0)*f*(0.9 + 0.6*uEnergy);
              body = mix(body, uTint*1.3, uTintAmt); body += vec3(1.0)*uFlash*0.8;
              gl_FragColor = vec4(body, 0.86 + 0.14*f); }`,
        }),
      );
      root.add(core);

      // Glow: a soft additive sprite behind the core (a cheap bloom).
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = glowCanvas.height = 128;
      const g = glowCanvas.getContext("2d")!;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,255,255,0.9)"); grad.addColorStop(0.25, "rgba(190,170,255,0.45)"); grad.addColorStop(1, "rgba(120,200,255,0)");
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
      glow.scale.setScalar(3.4);
      root.add(glow);

      // Shell: a faceted glass shell, rim-lit only (transparent in the middle), and its edges.
      const shellGeo = new THREE.IcosahedronGeometry(1.08, 1);
      const shell = new THREE.Mesh(shellGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uScan: { value: -2 }, uCol: { value: hues[1] } },
        vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vO; void main(){ vN = normalize(normalMatrix*normal); vO = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform float uScan; uniform vec3 uCol; varying vec3 vN; varying vec3 vP; varying vec3 vO;
          void main(){ float f = pow(1.0 - abs(dot(vN, normalize(-vP))), 3.0); float scan = smoothstep(0.12, 0.0, abs(vO.y - uScan));
            gl_FragColor = vec4(mix(vec3(0.75,0.8,1.0), uCol, 0.5)*(f*0.35 + scan*0.5), f*0.3 + scan*0.45); }`,
      }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shellGeo), new THREE.LineBasicMaterial({ color: 0xc9d4ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
      const shellGroup = new THREE.Group();
      shellGroup.add(shell, edges);
      root.add(shellGroup);

      // Rings, each in its own tilted group, with nodes riding on them.
      const ringGroups: InstanceType<typeof THREE.Group>[] = [];
      const ringMats: InstanceType<typeof THREE.MeshBasicMaterial>[] = [];
      const radii = [1.42, 1.66, 1.9];
      const baseTilt = [[1.2, 0.2], [0.5, -0.9], [-0.35, 0.7]];
      const planTilt = [[0.0, 0.0], [1.5708, 0.0], [0.0, 1.5708]];
      for (let i = 0; i < RINGS; i++) {
        const grp = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: hues[i], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
        grp.add(new THREE.Mesh(new THREE.TorusGeometry(radii[i]!, 0.008, 6, 180), mat));
        grp.rotation.set(baseTilt[i]![0]!, baseTilt[i]![1]!, 0);
        ringGroups.push(grp); ringMats.push(mat);
        root.add(grp);
      }
      const nodeGeo = new THREE.SphereGeometry(0.045, 12, 12);
      const nodes: { mesh: InstanceType<typeof THREE.Mesh>; ring: number; phase: number }[] = [];
      for (let i = 0; i < NODES; i++) {
        const ring = i % RINGS;
        const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: hues[ring], transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
        ringGroups[ring]!.add(mesh);
        nodes.push({ mesh, ring, phase: (i / NODES) * Math.PI * 2 * 1.618 });
      }
      // Links from every node to the core (the network), redrawn each frame.
      const linkPos = new Float32Array(NODES * 6);
      const linkGeo = new THREE.BufferGeometry();
      linkGeo.setAttribute("position", new THREE.BufferAttribute(linkPos, 3));
      const linkMat = new THREE.LineBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false });
      const links = new THREE.LineSegments(linkGeo, linkMat);
      root.add(links);

      // Particles: each travels from a far point on a sphere to the core and starts again.
      const pPos = new Float32Array(PARTICLES * 3);
      const pDir = new Float32Array(PARTICLES * 3);
      const pT = new Float32Array(PARTICLES);
      for (let i = 0; i < PARTICLES; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        pDir.set([r * Math.cos(a), u, r * Math.sin(a)], i * 3);
        pT[i] = Math.random();
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
      const pMat = new THREE.PointsMaterial({ size: 0.035, color: 0xdfe6ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
      const particles = new THREE.Points(pGeo, pMat);
      root.add(particles);

      // Pointer parallax, from anywhere over the overlay.
      const pointer = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => { pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = (e.clientY / innerHeight) * 2 - 1; };
      window.addEventListener("pointermove", onMove, { passive: true });

      const resize = () => {
        const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // Keep the whole structure in view when the stage is short (the strip above a conversation).
        camera.position.z = w / h > 2.2 ? 7.4 : 6.2;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(() => { resize(); if (still) draw(0); });
      ro.observe(el);
      resize();

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      let still = reduced.matches;
      let visible = true;
      let frame = 0;
      let last = performance.now();
      let time = 0;
      // Smoothed values that chase their targets, so state changes morph instead of jumping.
      const sm = { energy: 0.3, speed: 0.25, flow: 0.15, spread: 0, lock: 0, links: 0.05, flash: 0, tint: 0, shake: 0, scan: -2, lean: 0 };
      let lastPulse = live.current.pulse;
      let lastState = live.current.state;
      let lastTyping = live.current.typing;
      const chase = (k: keyof typeof sm, target: number, rate: number, dt: number) => { sm[k] += (target - sm[k]) * (1 - Math.exp(-rate * dt)); };

      const draw = (dt: number) => {
        const { state: st, pulse: pu, typing: ty } = live.current;
        if (pu !== lastPulse) { lastPulse = pu; sm.flash = Math.max(sm.flash, 0.55); }
        if (st !== lastState) {
          if (st === "done") sm.flash = 1;
          if (st === "error") sm.shake = 1;
          lastState = st;
        }
        if (ty !== lastTyping) { lastTyping = ty; sm.lean = Math.min(1, sm.lean + 0.35); }
        const T = {
          idle: { energy: 0.3, speed: 0.22, flow: 0.12, spread: 0, lock: 0, links: 0.05 },
          typing: { energy: 0.45, speed: 0.3, flow: 0.2, spread: 0, lock: 0, links: 0.08 },
          looking: { energy: 0.55, speed: 0.35, flow: 0.25, spread: 0.2, lock: 0, links: 0.1 },
          planning: { energy: 0.65, speed: 0.45, flow: 0.35, spread: 1, lock: 0, links: 0.18 },
          thinking: { energy: 0.8, speed: 0.55, flow: 0.8, spread: 0.35, lock: 0, links: 0.22 },
          building: { energy: 1, speed: 0.75, flow: 1, spread: 0.15, lock: 0, links: 0.4 },
          testing: { energy: 0.6, speed: 0.5, flow: 0.3, spread: 0, lock: 1, links: 0.15 },
          done: { energy: 0.5, speed: 0.18, flow: 0.1, spread: -0.35, lock: 0, links: 0.12 },
          error: { energy: 0.35, speed: 0.16, flow: 0.05, spread: 0.1, lock: 0, links: 0.04 },
        }[st];
        for (const k of ["energy", "speed", "flow", "spread", "lock", "links"] as const) chase(k, T[k], k === "spread" || k === "lock" ? 2.2 : 3, dt);
        chase("tint", st === "error" ? 0.55 : st === "done" ? 0.35 : 0, 2.5, dt);
        sm.flash *= Math.exp(-2.6 * dt);
        sm.shake *= Math.exp(-3.2 * dt);
        sm.lean *= Math.exp(-4 * dt);
        if (st === "looking") { sm.scan += dt * 1.6; if (sm.scan > 1.2) sm.scan = -1.2; } else chase("scan", -2, 3, dt);
        time += dt * (0.6 + sm.speed);

        coreUniforms.uTime.value = time;
        coreUniforms.uEnergy.value = sm.energy + sm.lean * 0.4;
        coreUniforms.uFlash.value = sm.flash;
        coreUniforms.uTint.value.copy(st === "error" ? bad : ok);
        coreUniforms.uTintAmt.value = sm.tint;
        (shell.material as InstanceType<typeof THREE.ShaderMaterial>).uniforms.uScan!.value = sm.scan;
        const breathe = 1 + Math.sin(time * 1.4) * 0.03 * (0.5 + sm.energy) + sm.lean * 0.06 + sm.flash * 0.12;
        core.scale.setScalar(breathe);
        glow.scale.setScalar(3.1 + sm.energy * 0.9 + sm.flash * 1.4);
        (glow.material as InstanceType<typeof THREE.SpriteMaterial>).opacity = 0.35 + sm.energy * 0.25 + sm.flash * 0.3;
        shellGroup.rotation.y = time * 0.25;
        shellGroup.rotation.x = Math.sin(time * 0.3) * 0.25;
        shellGroup.scale.setScalar(1 + sm.spread * 0.08);

        for (let i = 0; i < RINGS; i++) {
          const grp = ringGroups[i]!;
          const bx = baseTilt[i]![0]!, by = baseTilt[i]![1]!;
          const px = planTilt[i]![0]!, py = planTilt[i]![1]!;
          // Planning swings the rings out onto new axes; testing locks them square and steps them round in quarter turns.
          const step = Math.floor(time * 0.8 + i) * (Math.PI / 2);
          const sx = bx + sm.spread * (i - 1) * 0.6;
          const sy = by + sm.spread * (1 - i) * 0.5;
          grp.rotation.x = sx * (1 - sm.lock) + px * sm.lock;
          grp.rotation.y = sy * (1 - sm.lock) + py * sm.lock;
          grp.rotation.z = (time * (0.35 + i * 0.12) * (i % 2 ? -1 : 1)) * (1 - sm.lock) + step * sm.lock;
          grp.scale.setScalar(1 + sm.spread * (0.06 + i * 0.05));
          ringMats[i]!.opacity = 0.32 + sm.energy * 0.35 + sm.flash * 0.3;
        }
        const tmp = new THREE.Vector3();
        nodes.forEach((n, i) => {
          const r = radii[n.ring]!;
          const a = n.phase + time * (0.5 + n.ring * 0.15) * (n.ring % 2 ? -1 : 1);
          n.mesh.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
          n.mesh.scale.setScalar(1 + sm.flash * 0.8 + sm.energy * 0.3);
          n.mesh.getWorldPosition(tmp);
          root.worldToLocal(tmp);
          linkPos.set([tmp.x, tmp.y, tmp.z, 0, 0, 0], i * 6);
        });
        linkGeo.attributes.position!.needsUpdate = true;
        linkMat.opacity = sm.links + sm.flash * 0.25;

        const speed = 0.08 + sm.flow * 0.55;
        for (let i = 0; i < PARTICLES; i++) {
          let t = pT[i]! - dt * speed * (0.6 + (i % 7) * 0.08);
          if (t < 0) t += 1;
          pT[i] = t;
          const r = 0.7 + t * 2.4;
          const sw = time * 0.6 + i;
          pPos[i * 3] = pDir[i * 3]! * r + Math.sin(sw) * 0.04;
          pPos[i * 3 + 1] = pDir[i * 3 + 1]! * r + Math.cos(sw) * 0.04;
          pPos[i * 3 + 2] = pDir[i * 3 + 2]! * r;
        }
        pGeo.attributes.position!.needsUpdate = true;
        pMat.opacity = 0.12 + sm.flow * 0.55;

        const jitter = sm.shake * 0.08;
        root.position.set((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, 0);
        root.rotation.y += ((pointer.x * 0.35) - root.rotation.y) * Math.min(1, dt * 3);
        root.rotation.x += ((pointer.y * 0.25) - root.rotation.x) * Math.min(1, dt * 3);
        renderer.render(scene, camera);
        el.dataset.state = st;
      };

      const loop = (now: number) => {
        frame = 0;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        draw(dt);
        if (!still && visible && !document.hidden) frame = requestAnimationFrame(loop);
      };
      const start = () => { if (!frame && !still && visible && !document.hidden) { last = performance.now(); frame = requestAnimationFrame(loop); } };
      // With reduced motion, settle each state change into a still frame (draw a short burst without showing motion).
      kick.current = () => { if (still) { for (let i = 0; i < 40; i++) draw(0.05); } else start(); };
      const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; start(); });
      io.observe(el);
      const onVis = () => start();
      document.addEventListener("visibilitychange", onVis);
      const onReduced = () => { still = reduced.matches; if (still) kick.current(); else start(); };
      reduced.addEventListener("change", onReduced);
      el.dataset.ready = "";
      if (still) kick.current(); else start();

      cleanup = () => {
        cancelAnimationFrame(frame);
        io.disconnect(); ro.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        reduced.removeEventListener("change", onReduced);
        window.removeEventListener("pointermove", onMove);
        scene.traverse((o) => {
          const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose()); else m.material?.dispose();
        });
        glowTex.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    });
    return () => { disposed = true; kick.current = () => {}; cleanup(); };
  }, []);

  return <div ref={host} className={`${s.core} ${className ?? ""}`} data-state={state} role="img" aria-label={LABEL[state]} />;
}

const LABEL: Record<SolarState, string> = {
  idle: "Solar is ready", typing: "Solar is ready", looking: "Solar is looking at your place", planning: "Solar is planning",
  thinking: "Solar is thinking", building: "Solar is making a change in Studio", testing: "Play test running",
  done: "Solar finished", error: "Solar stopped with a warning",
};
