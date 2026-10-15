import { useEffect, useRef } from 'react';
import { NODES, EDGES, halfWidth, RB_OUTER, RB_ISLAND, PARKING, LANDMARKS, MAP_BOUNDS, ROAD } from '../game/map';

export interface MapCanvasProps {
  width: number; height: number; route?: string[] | null; routeIdx?: number; blocked?: string[]; dest?: string; start?: { x: number; z: number; heading: number } | null;
  player?: { x: number; z: number; heading: number } | null; picked?: string[]; onPick?: (node: string) => void; showLabels?: boolean; showLandmarks?: boolean;
  cars?: { x: number; z: number }[]; bay?: { x: number; z: number } | null; tick?: number; highlight?: string[];
}

export default function MapCanvas(p: MapCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bw = MAP_BOUNDS.maxX - MAP_BOUNDS.minX, bh = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ;
  const scale = Math.min(p.width / bw, p.height / bh);
  const ox = (p.width - bw * scale) / 2, oz = (p.height - bh * scale) / 2;
  const tx = (x: number) => ox + (x - MAP_BOUNDS.minX) * scale; const tz = (z: number) => oz + (z - MAP_BOUNDS.minZ) * scale;

  useEffect(() => {
    const c = ref.current; if (!c) return; const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = p.width * dpr; c.height = p.height * dpr; const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // board
    const grd = g.createLinearGradient(0, 0, p.width, p.height); grd.addColorStop(0, '#1f4d2b'); grd.addColorStop(1, '#173d22');
    g.fillStyle = grd; g.fillRect(0, 0, p.width, p.height);
    // parking lots
    for (const [k, lot] of Object.entries(PARKING)) {
      g.fillStyle = '#1e3a5f'; g.fillRect(tx(lot.x0), tz(lot.z0), (lot.x1 - lot.x0) * scale, (lot.z1 - lot.z0) * scale);
      g.fillStyle = '#93c5fd'; g.font = `bold ${Math.max(9, 18 * scale * 2)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(k.toUpperCase(), tx((lot.x0 + lot.x1) / 2), tz((lot.z0 + lot.z1) / 2));
    }
    // roads
    for (const e of Object.values(EDGES)) {
      const hw = halfWidth(e.type); g.strokeStyle = e.type === 'parking' ? '#475569' : '#3a3d42'; g.lineWidth = Math.max(2, hw * 2 * scale); g.lineCap = 'butt';
      g.beginPath(); g.moveTo(tx(e.ax), tz(e.az)); g.lineTo(tx(e.bx), tz(e.bz)); g.stroke();
      const r = ROAD[e.type];
      if (r.dual && scale > 0.2) { g.strokeStyle = '#4d7c3a'; g.lineWidth = Math.max(1, r.reserve * scale); g.beginPath(); g.moveTo(tx(e.ax), tz(e.az)); g.lineTo(tx(e.bx), tz(e.bz)); g.stroke(); }
      else if (e.type === 'two') { g.strokeStyle = '#facc15'; g.lineWidth = 1; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(tx(e.ax), tz(e.az)); g.lineTo(tx(e.bx), tz(e.bz)); g.stroke(); g.setLineDash([]); }
      if (e.oneway) { const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2; g.fillStyle = '#e2e8f0'; g.save(); g.translate(tx(mx), tz(mz)); g.rotate(Math.atan2(e.dz, e.dx)); g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-4, 4); g.fill(); g.restore(); }
    }
    for (const n of Object.values(NODES)) {
      if (n.kind === 'round') {
        g.fillStyle = '#3a3d42'; g.beginPath(); g.arc(tx(n.x), tz(n.z), RB_OUTER * scale, 0, 7); g.fill();
        g.fillStyle = '#4d9a3a'; g.beginPath(); g.arc(tx(n.x), tz(n.z), RB_ISLAND * scale, 0, 7); g.fill();
      } else { g.fillStyle = '#3a3d42'; g.fillRect(tx(n.x - n.hx), tz(n.z - n.hz), n.hx * 2 * scale, n.hz * 2 * scale); }
    }
    // zebra marks
    for (const e of Object.values(EDGES)) if (e.crossing !== undefined) { const x = e.ax + e.dx * e.len * e.crossing, z = e.az + e.dz * e.len * e.crossing; g.fillStyle = '#f8fafc'; g.fillRect(tx(x) - 2, tz(z) - 2, 4, 4); }
    // landmarks
    if (p.showLandmarks) for (const L of LANDMARKS) {
      g.fillStyle = 'rgba(15,23,42,0.55)'; g.fillRect(tx(L.x - L.w / 2), tz(L.z - L.d / 2), L.w * scale, L.d * scale);
      g.font = `${Math.max(10, 22 * scale)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.icon, tx(L.x), tz(L.z));
    }
    // blocked
    for (const id of p.blocked ?? []) {
      const e = EDGES[id]; const mx = tx((e.ax + e.bx) / 2), mz = tz((e.az + e.bz) / 2); const s = Math.max(6, 14 * scale * 2);
      g.strokeStyle = '#ef4444'; g.lineWidth = 3; g.beginPath(); g.moveTo(mx - s, mz - s); g.lineTo(mx + s, mz + s); g.moveTo(mx + s, mz - s); g.lineTo(mx - s, mz + s); g.stroke();
    }
    // route
    const drawPath = (nodes: string[], color: string, w: number, from = 0) => {
      if (nodes.length < 2) return; g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
      nodes.slice(from).forEach((id, i) => { const n = NODES[id]; if (i === 0) g.moveTo(tx(n.x), tz(n.z)); else g.lineTo(tx(n.x), tz(n.z)); }); g.stroke();
    };
    if (p.route) { drawPath(p.route, 'rgba(34,211,238,0.35)', Math.max(3, 8 * scale * 2)); drawPath(p.route, '#22d3ee', Math.max(2, 3 * scale * 2), p.routeIdx ?? 0); }
    if (p.highlight) drawPath(p.highlight, '#a3e635', Math.max(3, 5 * scale * 2));
    if (p.picked && p.picked.length) drawPath(p.picked, '#f472b6', Math.max(3, 5 * scale * 2));
    // nodes
    if (p.showLabels) for (const n of Object.values(NODES)) {
      const r = Math.max(7, 11 * scale * 2); const picked = p.picked?.includes(n.id);
      g.fillStyle = picked ? '#f472b6' : n.id === p.dest ? '#22c55e' : n.kind === 'round' ? '#1d4ed8' : n.id.startsWith('P') ? '#0369a1' : '#0f172a';
      g.strokeStyle = '#facc15'; g.lineWidth = 1.5; g.beginPath(); g.arc(tx(n.x), tz(n.z), r, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = `bold ${Math.max(8, r * 0.9)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.id.replace('P1a', 'P1ᵃ').replace('P1b', 'P1ᵇ').replace('P2a', 'P2ᵃ').replace('P2b', 'P2ᵇ'), tx(n.x), tz(n.z) + 0.5);
    }
    if (p.dest) { const n = NODES[p.dest]; g.fillStyle = '#22c55e'; g.beginPath(); g.arc(tx(n.x), tz(n.z) - 10, 6, 0, 7); g.fill(); g.beginPath(); g.moveTo(tx(n.x) - 5, tz(n.z) - 8); g.lineTo(tx(n.x), tz(n.z)); g.lineTo(tx(n.x) + 5, tz(n.z) - 8); g.fill(); }
    if (p.bay) { g.fillStyle = '#22d3ee'; g.beginPath(); g.arc(tx(p.bay.x), tz(p.bay.z), 4, 0, 7); g.fill(); }
    for (const car of p.cars ?? []) { g.fillStyle = '#e2e8f0'; g.fillRect(tx(car.x) - 1.5, tz(car.z) - 1.5, 3, 3); }
    const arrow = (s: { x: number; z: number; heading: number }, col: string) => {
      g.save(); g.translate(tx(s.x), tz(s.z)); g.rotate(-s.heading + Math.PI); g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
    };
    if (p.start) arrow(p.start, '#f97316');
    if (p.player) arrow(p.player, '#facc15');
  }, [p.width, p.height, p.route, p.routeIdx, p.blocked, p.dest, p.start, p.player, p.picked, p.showLabels, p.showLandmarks, p.cars, p.bay, p.tick, p.highlight, scale, ox, oz]);

  const onClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (!p.onPick) return; const rect = ref.current!.getBoundingClientRect();
    const mx = (ev.clientX - rect.left) * (p.width / rect.width), mz = (ev.clientY - rect.top) * (p.height / rect.height);
    let best = ''; let bd = 1e9;
    for (const n of Object.values(NODES)) { const d = Math.hypot(tx(n.x) - mx, tz(n.z) - mz); if (d < bd) { bd = d; best = n.id; } }
    if (bd < 30) p.onPick(best);
  };
  return <canvas ref={ref} style={{ width: p.width, height: p.height, cursor: p.onPick ? 'pointer' : 'default' }} onClick={onClick} className="rounded-lg block max-w-full" />;
}
