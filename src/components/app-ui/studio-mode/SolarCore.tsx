"use client";

import { useEffect, useRef } from "react";
import s from "./solar.module.css";

/**
 * The Solar core (three.js): a glowing intelligence core inside a faceted crystal of physically based glass (transmission,
 * refraction index, chromatic dispersion and iridescence, lit by a studio environment), circled by glass orbital rings with
 * nodes and three coloured lights. The crystal genuinely refracts the core and rings behind it.
 *
 * Every state comes from useStudioAgent, never a timer of fake work, and `pulse` changes only when a Studio step completes:
 *   idle      slow turn, the core breathes            typing    the core leans in with each keystroke
 *   looking   a scan line crosses the crystal         planning  the rings swing out onto new axes and the crystal opens
 *   thinking  a model call is in flight: the lights speed up and a few motes stream into the core
 *   building  a Studio step is running: the core burns brighter; each completed step sends a pulse through everything
 *   testing   the rings lock square and step round    done      everything converges, a brief green light, then calm
 *   error     a short shake, a red tint, then it settles
 *
 * Drag to turn it (with inertia). Transparent canvas, at most 2x pixel density, paused while hidden or off screen, one still
 * frame per state with reduced motion, and everything disposed on unmount.
 */
export type SolarState = "idle" | "typing" | "looking" | "planning" | "thinking" | "building" | "testing" | "done" | "error";

const RINGS = 3;
const NODES = 6;
const MOTES = 120;

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
    void Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js")]).then(([THREE, { RoomEnvironment }]) => {
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power", premultipliedAlpha: true });
      } catch {
        el.dataset.fallback = "";
        return;
      }
      renderer.setClearColor(0x000000, 0);
      // Budget: the crystal's transmission pass (the refraction) renders at half resolution, density is capped at 1.5x, and
      // the quality steps down by itself when frames stay slow (see `budget` in the loop).
      renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
      (renderer as unknown as { transmissionResolutionScale: number }).transmissionResolutionScale = 0.5;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
      camera.position.set(0, 0, 6.4);
      const root = new THREE.Group();
      scene.add(root);

      const hues = [new THREE.Color("#b77cff"), new THREE.Color("#45d8ec"), new THREE.Color("#ff6fb2")];
      const ok = new THREE.Color("#5ef2a6");
      const bad = new THREE.Color("#ff5d5d");
      const white = new THREE.Color("#ffffff");

      // ── The intelligence core: a displaced, glowing sphere whose colour flows between the three hues. ──
      const coreUniforms = {
        uTime: { value: 0 }, uEnergy: { value: 0.3 }, uFlash: { value: 0 }, uTint: { value: new THREE.Color(0, 0, 0) }, uTintAmt: { value: 0 },
        uA: { value: hues[0]!.clone() }, uB: { value: hues[1]!.clone() }, uC: { value: hues[2]!.clone() },
      };
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.42, 6),
        new THREE.ShaderMaterial({
          uniforms: coreUniforms,
          vertexShader: `
            uniform float uTime; uniform float uEnergy; varying vec3 vN; varying vec3 vP; varying float vW;
            float w(vec3 p){ return sin(p.x*5.1+uTime*1.6)*sin(p.y*4.3-uTime*1.3)*sin(p.z*4.7+uTime*1.1); }
            void main(){ float d = w(position) * (0.03 + 0.06*uEnergy); vW = d; vec3 p = position + normal*d;
              vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(p,1.0); vP = mv.xyz; gl_Position = projectionMatrix*mv; }`,
          fragmentShader: `
            uniform float uTime; uniform float uEnergy; uniform float uFlash; uniform vec3 uTint; uniform float uTintAmt;
            uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; varying vec3 vN; varying vec3 vP; varying float vW;
            void main(){ vec3 v = normalize(-vP); float f = pow(1.0 - max(dot(vN, v), 0.0), 2.0);
              float t = 0.5 + 0.5*sin(uTime*0.7 + vW*24.0 + vN.y*2.4);
              vec3 c = mix(mix(uA, uB, t), uC, 0.5 + 0.5*sin(uTime*0.45 + vN.x*3.0));
              vec3 body = c*(0.9 + 1.4*uEnergy) + vec3(1.0)*f*(1.2 + uEnergy);
              body = mix(body, uTint*2.2, uTintAmt); body += vec3(1.0)*uFlash*1.6;
              gl_FragColor = vec4(body, 1.0); }`,
        }),
      );
      root.add(core);
      const coreLight = new THREE.PointLight(0xffffff, 6, 6, 1.6);
      root.add(coreLight);

      // ── The crystal: faceted physical glass around the core (it refracts the core and rings through its facets). ──
      const crystalMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.9, ior: 1.52, dispersion: 4,
        iridescence: 0.45, iridescenceIOR: 1.35, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3,
        specularIntensity: 1, attenuationColor: new THREE.Color("#e6dcff"), attenuationDistance: 3.5, flatShading: true,
      });
      const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), crystalMat);
      root.add(crystal);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
      crystal.add(new THREE.LineSegments(new THREE.EdgesGeometry(crystal.geometry, 1), edgeMat));

      // ── Orbital rings: glass tubes on tilted axes, each with nodes. ──
      const ringGroups: InstanceType<typeof THREE.Group>[] = [];
      const radii = [1.45, 1.72, 1.98];
      const baseTilt = [[1.2, 0.2], [0.5, -0.9], [-0.35, 0.7]];
      const planTilt = [[0, 0], [Math.PI / 2, 0], [0, Math.PI / 2]];
      const ringMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.15, roughness: 0.12, transmission: 0.7, thickness: 0.15, ior: 1.4, clearcoat: 1, envMapIntensity: 1.6 });
      const nodeMats: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];
      const nodes: { mesh: InstanceType<typeof THREE.Mesh>; ring: number; phase: number }[] = [];
      for (let i = 0; i < RINGS; i++) {
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(new THREE.TorusGeometry(radii[i]!, 0.018, 12, 220), ringMat));
        grp.rotation.set(baseTilt[i]![0]!, baseTilt[i]![1]!, 0);
        ringGroups.push(grp);
        root.add(grp);
        nodeMats.push(new THREE.MeshStandardMaterial({ color: hues[i], emissive: hues[i], emissiveIntensity: 2.2, roughness: 0.3 }));
      }
      const nodeGeo = new THREE.SphereGeometry(0.05, 16, 16);
      for (let i = 0; i < NODES; i++) {
        const ring = i % RINGS;
        const mesh = new THREE.Mesh(nodeGeo, nodeMats[ring]);
        ringGroups[ring]!.add(mesh);
        nodes.push({ mesh, ring, phase: (i / NODES) * Math.PI * 2 * 1.618 });
      }

      // ── Lights: three coloured lights orbit the crystal; their speed and strength follow the work. ──
      const lights = hues.map((h) => { const l = new THREE.PointLight(h, 10, 9, 1.4); root.add(l); return l; });
      scene.add(new THREE.AmbientLight(0xffffff, 0.15));

      // ── Motes: a few points that stream into the core only while a model call or a Studio step is running. ──
      const mPos = new Float32Array(MOTES * 3), mDir = new Float32Array(MOTES * 3), mT = new Float32Array(MOTES);
      for (let i = 0; i < MOTES; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        mDir.set([r * Math.cos(a), u, r * Math.sin(a)], i * 3);
        mT[i] = Math.random();
      }
      const mGeo = new THREE.BufferGeometry();
      mGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
      const mMat = new THREE.PointsMaterial({ size: 0.04, color: 0xe8ecff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      root.add(new THREE.Points(mGeo, mMat));

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      let still = reduced.matches;
      let visible = true;
      let frame = 0;
      let last = performance.now();
      let time = 0;

      // ── Pointer: parallax from anywhere over the page; drag on the core to turn it (with inertia). ──
      const pointer = { x: 0, y: 0 };
      const spin = { x: 0, y: 0, vx: 0, vy: 0, dragging: false, lx: 0, ly: 0 };
      const start = () => { if (!frame && !still && visible && !document.hidden) { last = performance.now(); frame = requestAnimationFrame(loop); } };
      const onMove = (e: PointerEvent) => {
        pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = (e.clientY / innerHeight) * 2 - 1;
        if (spin.dragging) { spin.vy = (e.clientX - spin.lx) * 0.008; spin.vx = (e.clientY - spin.ly) * 0.008; spin.lx = e.clientX; spin.ly = e.clientY; start(); }
      };
      const onDown = (e: PointerEvent) => { spin.dragging = true; spin.lx = e.clientX; spin.ly = e.clientY; start(); };
      const onUp = () => { spin.dragging = false; };
      window.addEventListener("pointermove", onMove, { passive: true });
      el.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);

      const resize = () => {
        const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.position.z = w / h > 2.2 ? 7.6 : 6.4;
        camera.updateProjectionMatrix();
      };
      const sm = { energy: 0.3, speed: 0.25, flow: 0, spread: 0, lock: 0, flash: 0, tint: 0, shake: 0, scan: -2, lean: 0, open: 0 };
      let lastPulse = live.current.pulse, lastState = live.current.state, lastTyping = live.current.typing;
      const chase = (k: keyof typeof sm, target: number, rate: number, dt: number) => { sm[k] += (target - sm[k]) * (1 - Math.exp(-rate * dt)); };
      const T = {
        idle: { energy: 0.3, speed: 0.22, flow: 0, spread: 0, lock: 0, open: 0 },
        typing: { energy: 0.45, speed: 0.3, flow: 0, spread: 0, lock: 0, open: 0 },
        looking: { energy: 0.55, speed: 0.34, flow: 0.15, spread: 0.2, lock: 0, open: 0.2 },
        planning: { energy: 0.65, speed: 0.42, flow: 0.25, spread: 1, lock: 0, open: 1 },
        thinking: { energy: 0.8, speed: 0.55, flow: 0.8, spread: 0.35, lock: 0, open: 0.4 },
        building: { energy: 1, speed: 0.7, flow: 1, spread: 0.15, lock: 0, open: 0.25 },
        testing: { energy: 0.6, speed: 0.5, flow: 0.2, spread: 0, lock: 1, open: 0 },
        done: { energy: 0.55, speed: 0.18, flow: 0, spread: -0.3, lock: 0, open: -0.15 },
        error: { energy: 0.35, speed: 0.15, flow: 0, spread: 0.1, lock: 0, open: 0 },
      } as const;

      const draw = (dt: number) => {
        const { state: st, pulse: pu, typing: ty } = live.current;
        if (pu !== lastPulse) { lastPulse = pu; sm.flash = Math.max(sm.flash, 0.6); }
        if (st !== lastState) { if (st === "done") sm.flash = 1; if (st === "error") sm.shake = 1; lastState = st; }
        if (ty !== lastTyping) { lastTyping = ty; sm.lean = Math.min(1, sm.lean + 0.35); }
        const t = T[st];
        for (const k of ["energy", "speed", "flow", "spread", "lock", "open"] as const) chase(k, t[k], k === "spread" || k === "lock" || k === "open" ? 2.2 : 3, dt);
        chase("tint", st === "error" ? 0.5 : st === "done" ? 0.3 : 0, 2.5, dt);
        sm.flash *= Math.exp(-2.6 * dt); sm.shake *= Math.exp(-3.2 * dt); sm.lean *= Math.exp(-4 * dt);
        if (st === "looking") { sm.scan += dt * 1.8; if (sm.scan > 1.3) sm.scan = -1.3; } else chase("scan", -2, 3, dt);
        time += dt * (0.6 + sm.speed);

        // Core
        coreUniforms.uTime.value = time;
        coreUniforms.uEnergy.value = sm.energy + sm.lean * 0.4;
        coreUniforms.uFlash.value = sm.flash;
        coreUniforms.uTint.value.copy(st === "error" ? bad : ok);
        coreUniforms.uTintAmt.value = sm.tint;
        core.scale.setScalar(1 + Math.sin(time * 1.5) * 0.03 * (0.5 + sm.energy) + sm.lean * 0.07 + sm.flash * 0.15);
        coreLight.color.copy(st === "error" ? bad : st === "done" ? ok : hues[((Math.floor(time * 0.2) % 3) + 3) % 3]!);
        coreLight.intensity = 3 + sm.energy * 7 + sm.flash * 10;

        // Crystal: turns; opens (grows, its edges brighten) while planning; a scan brightens the edges while looking.
        crystal.rotation.y += dt * (0.18 + sm.speed * 0.4);
        crystal.rotation.x = Math.sin(time * 0.3) * 0.3;
        crystal.scale.setScalar(1 + sm.open * 0.14 + sm.flash * 0.05);
        crystalMat.iridescence = 0.35 + sm.energy * 0.35;
        crystalMat.attenuationColor.copy(st === "error" ? bad : st === "done" ? ok : hues[0]!).lerp(white, 0.75);
        edgeMat.opacity = 0.12 + Math.max(0, sm.open) * 0.18 + (st === "looking" ? 0.25 * Math.max(0, 1 - Math.abs(sm.scan)) : 0);

        // Rings
        for (let i = 0; i < RINGS; i++) {
          const grp = ringGroups[i]!;
          const step = Math.floor(time * 0.8 + i) * (Math.PI / 2);
          const sx = baseTilt[i]![0]! + sm.spread * (i - 1) * 0.6, sy = baseTilt[i]![1]! + sm.spread * (1 - i) * 0.5;
          grp.rotation.x = sx * (1 - sm.lock) + planTilt[i]![0]! * sm.lock;
          grp.rotation.y = sy * (1 - sm.lock) + planTilt[i]![1]! * sm.lock;
          grp.rotation.z = (time * (0.32 + i * 0.12) * (i % 2 ? -1 : 1)) * (1 - sm.lock) + step * sm.lock;
          grp.scale.setScalar(1 + sm.spread * (0.05 + i * 0.05));
        }
        nodes.forEach((n) => {
          const a = n.phase + time * (0.5 + n.ring * 0.15) * (n.ring % 2 ? -1 : 1), r = radii[n.ring]!;
          n.mesh.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
          n.mesh.scale.setScalar(1 + sm.flash * 0.9 + sm.energy * 0.3);
        });
        nodeMats.forEach((m) => { m.emissiveIntensity = 1.4 + sm.energy * 1.6 + sm.flash * 2; });

        // Lights orbit; faster and brighter with the work.
        lights.forEach((l, i) => {
          const a = time * (0.7 + sm.speed) + (i * Math.PI * 2) / 3;
          l.position.set(Math.cos(a) * 2.6, Math.sin(a * 0.7 + i) * 1.4, Math.sin(a) * 2.6);
          l.intensity = 6 + sm.energy * 10 + sm.flash * 8;
        });

        // Motes
        const speed = 0.1 + sm.flow * 0.6;
        for (let i = 0; i < MOTES; i++) {
          let m = mT[i]! - dt * speed * (0.6 + (i % 7) * 0.08);
          if (m < 0) m += 1;
          mT[i] = m;
          const r = 0.5 + m * 2.4;
          mPos[i * 3] = mDir[i * 3]! * r; mPos[i * 3 + 1] = mDir[i * 3 + 1]! * r; mPos[i * 3 + 2] = mDir[i * 3 + 2]! * r;
        }
        mGeo.attributes.position!.needsUpdate = true;
        mMat.opacity = sm.flow * 0.7;

        // Turn: drag inertia + pointer parallax + the error shake.
        if (!spin.dragging) { spin.vx *= Math.exp(-2.4 * dt); spin.vy *= Math.exp(-2.4 * dt); }
        spin.x = Math.max(-1.2, Math.min(1.2, spin.x + spin.vx)); spin.y += spin.vy;
        const jitter = sm.shake * 0.08;
        root.position.set((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, 0);
        root.rotation.y += ((pointer.x * 0.3 + spin.y) - root.rotation.y) * Math.min(1, dt * 4);
        root.rotation.x += ((pointer.y * 0.22 + spin.x) - root.rotation.x) * Math.min(1, dt * 4);
        renderer.render(scene, camera);
        el.dataset.state = st;
      };

      // Quality steps: 0 = full; 1 = 1x density, no dispersion; 2 = also draw every other frame.
      const budget = { level: 0, slow: 0, skip: false, acc: 0 };
      function loop(now: number) {
        frame = 0;
        const raw = (now - last) / 1000;
        // The first frame's timestamp can precede the moment the loop was started: never step backwards.
        const dt = Math.max(0, Math.min(0.05, raw));
        last = now;
        if (raw > 0.034) budget.slow += raw; else budget.slow = Math.max(0, budget.slow - raw * 0.5);
        if (budget.slow > 1.5 && budget.level < 2) {
          budget.level++; budget.slow = 0;
          if (budget.level === 1) { renderer.setPixelRatio(1); resize(); crystalMat.dispersion = 0; }
          host.current?.setAttribute("data-quality", String(budget.level));
        }
        budget.skip = budget.level >= 2 ? !budget.skip : false;
        budget.acc += dt;
        if (!budget.skip) { draw(budget.acc); budget.acc = 0; }
        if (!still && visible && !document.hidden) frame = requestAnimationFrame(loop);
      }
      kick.current = () => { if (still) { for (let i = 0; i < 40; i++) draw(0.05); } else start(); };
      const ro = new ResizeObserver(() => { resize(); if (still) draw(0); });
      ro.observe(el);
      resize();
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
        window.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointerdown", onDown);
        scene.traverse((o) => {
          const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose()); else m.material?.dispose();
        });
        envTex.dispose();
        pmrem.dispose();
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
