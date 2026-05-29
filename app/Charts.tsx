"use client";

export type ChartPoint = { x: number; y: number };

export function LineChart({
  points,
  unit,
}: {
  points: ChartPoint[];
  unit: string;
}) {
  if (points.length === 0) {
    return <p className="chart-empty">No data yet — log a workout to see this.</p>;
  }

  const W = 320;
  const H = 150;
  const padL = 30;
  const padR = 10;
  const padT = 12;
  const padB = 22;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  } else {
    const pad = (maxY - minY) * 0.15;
    minY -= pad;
    maxY += pad;
  }

  const sx = (x: number) =>
    padL + (maxX === minX ? 0.5 : (x - minX) / (maxX - minX)) * (W - padL - padR);
  const sy = (y: number) =>
    padT + (1 - (y - minY) / (maxY - minY)) * (H - padT - padB);

  const line = points
    .map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
    .join(" ");
  const area =
    `M${sx(points[0].x).toFixed(1)} ${(H - padB).toFixed(1)} ` +
    points.map((p) => `L${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ") +
    ` L${sx(points[points.length - 1].x).toFixed(1)} ${(H - padB).toFixed(1)} Z`;

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });

  const yTop = Math.round(maxY);
  const yBot = Math.round(minY);

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
    >
      <line className="chart-grid" x1={padL} y1={padT} x2={padL} y2={H - padB} />
      <line
        className="chart-grid"
        x1={padL}
        y1={H - padB}
        x2={W - padR}
        y2={H - padB}
      />
      <path className="chart-area" d={area} />
      <path className="chart-line" d={line} />
      {points.map((p, i) => (
        <circle key={i} className="chart-dot" cx={sx(p.x)} cy={sy(p.y)} r={2.6} />
      ))}
      <text className="chart-label" x={padL - 4} y={padT + 4} textAnchor="end">
        {yTop}
      </text>
      <text className="chart-label" x={padL - 4} y={H - padB} textAnchor="end">
        {yBot}
      </text>
      <text className="chart-label" x={padL} y={H - 6} textAnchor="start">
        {fmtDate(minX)}
      </text>
      <text className="chart-label" x={W - padR} y={H - 6} textAnchor="end">
        {fmtDate(maxX)}
      </text>
      <text
        className="chart-label"
        x={W - padR}
        y={padT + 4}
        textAnchor="end"
      >
        {unit}
      </text>
    </svg>
  );
}

export function Heatmap({ dates }: { dates: Set<string> }) {
  const weeks = 16;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // End on the Saturday of the current week, build back `weeks` columns.
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const cols: { date: Date; key: string; future: boolean; done: boolean }[][] =
    [];
  const cursor = new Date(start);
  for (let w = 0; w < weeks; w++) {
    const col: {
      date: Date;
      key: string;
      future: boolean;
      done: boolean;
    }[] = [];
    for (let d = 0; d < 7; d++) {
      const key = fmt(cursor);
      col.push({
        date: new Date(cursor),
        key,
        future: cursor.getTime() > today.getTime(),
        done: dates.has(key),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    cols.push(col);
  }

  return (
    <div className="heatmap">
      {cols.map((col, ci) => (
        <div className="heatmap-col" key={ci}>
          {col.map((cell) => (
            <div
              key={cell.key}
              className={`heatmap-cell ${cell.done ? "done" : ""} ${
                cell.future ? "future" : ""
              }`}
              title={`${cell.key}${cell.done ? " · trained" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
