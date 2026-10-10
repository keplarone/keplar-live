import { color } from "@/lib/tokens";

/** Small static diagrams for /how-it-works. Same colour language as the 3D narrative. */
const S = color.streams;
// Theme-aware: the <svg> sets color to var(--c-ink); fills use currentColor / CSS vars.
const ink = "currentColor";
const paper = { fill: "var(--c-canvas)" } as const;

function Mark({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 398 398">
      <rect width="229" height="229" rx="70" fill={ink} />
      <path d="M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z" fill={ink} />
      <circle cx="281" cy="281" r="117" fill={ink} />
    </svg>
  );
}

function Dots({ d, stroke, opacity = 0.8, width = 1.6 }: { d: string; stroke: string; opacity?: number; width?: number }) {
  return <path className="kp-flow" d={d} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray="0.1 5" strokeLinecap="round" opacity={opacity} />;
}

export function StepDiagram({ step }: { step: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const ys = [30, 55, 80, 105, 130, 155];
  return (
    <svg viewBox="0 0 280 190" aria-hidden="true" style={{ width: "100%", height: "auto", overflow: "visible", color: "var(--c-ink)" }}>
      {step === 1 && (
        <g>
          <rect x="20" y="78" width="150" height="34" rx="17" style={paper} stroke="currentColor" strokeOpacity={0.18} />
          <circle cx="40" cy="95" r="4" fill={ink} />
          <rect x="52" y="92" width="92" height="6" rx="3" fill="currentColor" fillOpacity={0.12} />
          <Dots d="M170 95 L 262 95" stroke={ink} opacity={0.9} width={2} />
        </g>
      )}
      {step === 2 && (
        <g>
          <circle cx="30" cy="95" r="5" fill={ink} />
          {ys.map((y, i) => (
            <g key={y}>
              <Dots d={`M30 95 C 110 95, 130 ${y}, 220 ${y}`} stroke={S[i]} />
              <circle cx="228" cy={y} r="6" style={paper} stroke={S[i]} />
            </g>
          ))}
          {[12, 178].map((y) => (
            <g key={y}>
              <Dots d={`M30 95 C 90 95, 100 ${y}, 150 ${y}`} stroke="currentColor" opacity={0.18} />
              <circle cx="158" cy={y} r="4" fill="none" stroke="currentColor" strokeOpacity={0.18} strokeDasharray="2 2" />
            </g>
          ))}
        </g>
      )}
      {step === 3 && (
        <g>
          {ys.map((y, i) => (
            <g key={y}>
              <circle cx="24" cy={y} r="6" style={paper} stroke={S[i]} />
              <Dots d={`M34 ${y} C 90 ${y + (i % 2 ? 10 : -10)}, 170 ${y + (i % 2 ? -8 : 8)}, 256 ${y}`} stroke={S[i]} />
            </g>
          ))}
        </g>
      )}
      {step === 4 && (
        <g>
          {ys.slice(0, 5).map((y, i) => (
            <Dots key={y} d={`M20 ${y} C 110 ${y}, 150 92, 250 ${88 + i * 3}`} stroke={S[i]} />
          ))}
          <Dots d="M20 155 C 110 155, 170 175, 250 172" stroke={S[5]} opacity={1} width={2} />
          <circle cx="252" cy="172" r="5" fill={S[5]} />
        </g>
      )}
      {step === 5 && (
        <g>
          {[34, 56, 78].map((r, i) => (
            <ellipse key={r} cx="120" cy="95" rx={r * 1.3} ry={r * 0.55} fill="none" stroke={S[i * 2]} strokeWidth="1.4" strokeDasharray="0.1 5" strokeLinecap="round" transform={`rotate(${-12 + i * 10} 120 95)`} />
          ))}
          {[0, 1, 2, 3, 4].map((k) => (
            <circle key={k} cx={120 + Math.cos(k * 1.26) * 72} cy={95 + Math.sin(k * 1.26) * 32} r="3.5" fill={S[k]} />
          ))}
          <circle cx="245" cy="150" r="10" fill="none" stroke={S[5]} strokeDasharray="1 3" />
          <circle cx="245" cy="150" r="3" fill={S[5]} />
        </g>
      )}
      {step === 6 && (
        <g>
          {ys.map((y, i) => (
            <Dots key={y} d={`M10 ${y} C 90 ${y}, 120 95, 176 95`} stroke={S[i]} opacity={0.55} />
          ))}
          <Mark x={180} y={50} size={90} />
        </g>
      )}
    </svg>
  );
}
