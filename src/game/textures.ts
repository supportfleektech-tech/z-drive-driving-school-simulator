import * as THREE from 'three';

function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; }
function tex(c: HTMLCanvasElement, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; return t;
}
function rnd(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export function asphaltTexture() {
  const [c, g] = canvas(512, 512); const r = rnd(7);
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) { const v = 40 + r() * 40; g.fillStyle = `rgba(${v},${v},${v + 4},${0.35 + r() * 0.4})`; g.fillRect(r() * 512, r() * 512, 1.5, 1.5); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,20,22,${0.05 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * 512, r() * 512, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, 7); g.fill(); }
  return tex(c);
}
export function asphaltRoughness() {
  const [c, g] = canvas(256, 256); const r = rnd(3);
  g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8000; i++) { const v = 150 + r() * 105; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 256, r() * 256, 1, 1); }
  return tex(c, true, false);
}
export function grassTexture() {
  const [c, g] = canvas(512, 512); const r = rnd(11);
  g.fillStyle = '#4c7a2e'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 30000; i++) { const h = 80 + r() * 40; g.fillStyle = `hsla(${h},${40 + r() * 30}%,${22 + r() * 22}%,0.6)`; g.fillRect(r() * 512, r() * 512, 1.5, 3); }
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(120,100,50,${0.05 + r() * 0.08})`; g.beginPath(); g.arc(r() * 512, r() * 512, 10 + r() * 40, 0, 7); g.fill(); }
  return tex(c);
}
export function pavementTexture() {
  const [c, g] = canvas(256, 256); const r = rnd(5);
  g.fillStyle = '#a9a59c'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = 150 + r() * 30; g.fillStyle = `rgb(${v},${v - 3},${v - 10})`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  }
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(60,60,60,${r() * 0.15})`; g.fillRect(r() * 256, r() * 256, 1, 1); }
  return tex(c);
}
export function kerbTexture() {
  const [c, g] = canvas(128, 16);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f5f5f5' : '#c81e1e'; g.fillRect(i * 32, 0, 32, 16); }
  return tex(c);
}
export function yellowKerbTexture() {
  const [c, g] = canvas(128, 16);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#111' : '#facc15'; g.fillRect(i * 32, 0, 32, 16); }
  return tex(c);
}

export function windowTexture(variant: number) {
  const [c, g] = canvas(256, 512); const r = rnd(20 + variant * 13);
  const palettes = [['#d6d3cd', '#27415e'], ['#e8e2d4', '#35516b'], ['#9aa4ad', '#1d2d3c'], ['#c9b89a', '#2f3e46'], ['#f1efe9', '#4a6a85'], ['#6b7280', '#0f1d2b']];
  const [wall, glass] = palettes[variant % palettes.length];
  g.fillStyle = wall; g.fillRect(0, 0, 256, 512);
  const cols = variant % 2 ? 4 : 6, rows = 10;
  const cw = 256 / cols, rh = 512 / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const lit = r() > 0.72;
    g.fillStyle = lit ? `rgba(255,${210 + r() * 40},${140 + r() * 60},1)` : glass;
    g.fillRect(x * cw + cw * 0.14, y * rh + rh * 0.18, cw * 0.72, rh * 0.62);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x * cw + cw * 0.14, y * rh + rh * 0.18, cw * 0.72, rh * 0.12);
  }
  return tex(c);
}
export function windowEmissive(variant: number) {
  const [c, g] = canvas(256, 512); const r = rnd(20 + variant * 13);
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512);
  const cols = variant % 2 ? 4 : 6, rows = 10; const cw = 256 / cols, rh = 512 / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const lit = r() > 0.72;
    if (lit) { g.fillStyle = '#ffcf8a'; g.fillRect(x * cw + cw * 0.14, y * rh + rh * 0.18, cw * 0.72, rh * 0.62); }
  }
  return tex(c);
}

export function arrowTexture(kind: 'left' | 'straight' | 'right' | 'uturn' | 'leftstraight') {
  const [c, g] = canvas(128, 256);
  g.clearRect(0, 0, 128, 256); g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.lineCap = 'butt';
  const head = (x: number, y: number, ang: number) => {
    g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(0, -28); g.lineTo(24, 8); g.lineTo(-24, 8); g.closePath(); g.fill(); g.restore();
  };
  g.beginPath();
  if (kind === 'straight') { g.moveTo(64, 250); g.lineTo(64, 40); g.stroke(); head(64, 30, 0); }
  if (kind === 'left') { g.moveTo(80, 250); g.lineTo(80, 110); g.quadraticCurveTo(80, 80, 50, 80); g.lineTo(34, 80); g.stroke(); head(26, 80, -Math.PI / 2); }
  if (kind === 'right') { g.moveTo(48, 250); g.lineTo(48, 110); g.quadraticCurveTo(48, 80, 78, 80); g.lineTo(94, 80); g.stroke(); head(102, 80, Math.PI / 2); }
  if (kind === 'uturn') { g.moveTo(34, 250); g.lineTo(34, 90); g.arc(64, 90, 30, Math.PI, 0); g.lineTo(94, 150); g.stroke(); head(94, 160, Math.PI); }
  if (kind === 'leftstraight') { g.moveTo(80, 250); g.lineTo(80, 40); g.stroke(); head(80, 30, 0); g.beginPath(); g.moveTo(80, 140); g.quadraticCurveTo(80, 110, 50, 110); g.lineTo(34, 110); g.stroke(); head(26, 110, -Math.PI / 2); }
  return tex(c, false);
}

export function textTexture(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string; border?: string; sub?: string } = {}) {
  const w = opts.w ?? 512, h = opts.h ?? 128; const [c, g] = canvas(w, h);
  g.fillStyle = opts.bg ?? '#0b3d91'; g.fillRect(0, 0, w, h);
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = h * 0.06; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
  g.fillStyle = opts.fg ?? '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = opts.font ?? `bold ${Math.floor(h * (opts.sub ? 0.36 : 0.48))}px "Segoe UI", Arial, sans-serif`;
  g.fillText(text, w / 2, opts.sub ? h * 0.38 : h / 2, w * 0.92);
  if (opts.sub) { g.font = `600 ${Math.floor(h * 0.2)}px "Segoe UI", Arial`; g.globalAlpha = 0.85; g.fillText(opts.sub, w / 2, h * 0.74, w * 0.9); }
  return tex(c, false);
}

export function roundSign(kind: 'stop' | 'giveway' | 'limit' | 'noentry' | 'roundabout' | 'parking' | 'closed', value?: number) {
  const [c, g] = canvas(256, 256); g.clearRect(0, 0, 256, 256);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'stop') {
    g.fillStyle = '#fff'; octa(g, 128, 128, 124); g.fill(); g.fillStyle = '#c81e1e'; octa(g, 128, 128, 112); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 76px Arial'; g.fillText('STOP', 128, 132);
  } else if (kind === 'giveway') {
    g.fillStyle = '#c81e1e'; tri(g, 128, 128, 126, true); g.fill(); g.fillStyle = '#fff'; tri(g, 128, 118, 84, true); g.fill();
    g.fillStyle = '#111'; g.font = 'bold 30px Arial'; g.fillText('GIVE', 128, 80); g.fillText('WAY', 128, 110);
  } else if (kind === 'limit') {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.lineWidth = 26; g.strokeStyle = '#c81e1e'; g.beginPath(); g.arc(128, 128, 108, 0, 7); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 104px Arial'; g.fillText(String(value ?? 50), 128, 136);
  } else if (kind === 'noentry') {
    g.fillStyle = '#c81e1e'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(40, 108, 176, 40);
  } else if (kind === 'roundabout') {
    g.fillStyle = '#1d4ed8'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 18;
    for (let i = 0; i < 3; i++) { const a = i * 2.094; g.beginPath(); g.arc(128, 128, 62, a + 0.3, a + 1.7); g.stroke(); const hx = 128 + Math.cos(a + 1.8) * 62, hy = 128 + Math.sin(a + 1.8) * 62; g.save(); g.translate(hx, hy); g.rotate(a + 1.8 + Math.PI); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -22); g.lineTo(20, 12); g.lineTo(-20, 12); g.fill(); g.restore(); }
  } else if (kind === 'parking') {
    g.fillStyle = '#1d4ed8'; g.fillRect(8, 8, 240, 240); g.fillStyle = '#fff'; g.font = 'bold 180px Arial'; g.fillText('P', 128, 140);
  } else if (kind === 'closed') {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.lineWidth = 26; g.strokeStyle = '#c81e1e'; g.beginPath(); g.arc(128, 128, 108, 0, 7); g.stroke();
    g.fillStyle = '#111'; g.font = 'bold 40px Arial'; g.fillText('ROAD', 128, 108); g.fillText('CLOSED', 128, 152);
  }
  return tex(c, false);
}
function octa(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); }
function tri(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, down: boolean) { g.beginPath(); for (let i = 0; i < 3; i++) { const a = (down ? Math.PI / 2 : -Math.PI / 2) + i * 2.094; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95); } g.closePath(); }

export function kenyaFlag() {
  const [c, g] = canvas(300, 200);
  g.fillStyle = '#000'; g.fillRect(0, 0, 300, 66); g.fillStyle = '#fff'; g.fillRect(0, 60, 300, 80);
  g.fillStyle = '#bb0000'; g.fillRect(0, 72, 300, 56); g.fillStyle = '#006600'; g.fillRect(0, 140, 300, 60); g.fillStyle = '#fff'; g.fillRect(0, 128, 300, 12);
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(150, 100, 30, 62, 0, 0, 7); g.fill();
  g.fillStyle = '#bb0000'; g.beginPath(); g.ellipse(150, 100, 24, 56, 0, 0, 7); g.fill();
  g.fillStyle = '#000'; g.beginPath(); g.ellipse(150, 70, 14, 22, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(150, 130, 14, 22, 0, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(150, 100, 5, 12, 0, 0, 7); g.fill();
  return tex(c, false);
}

export function learnerPlate() {
  const [c, g] = canvas(128, 128); g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#d10000'; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('L', 64, 70);
  return tex(c, false);
}
export function numberPlate(text: string, yellow = false) {
  const [c, g] = canvas(256, 64); g.fillStyle = yellow ? '#facc15' : '#fff'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 60);
  g.fillStyle = '#111'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34);
  return tex(c, false);
}
export function matatuLivery(seed: number) {
  const [c, g] = canvas(512, 128); const r = rnd(seed + 3);
  const cols = ['#e11d48', '#7c3aed', '#0ea5e9', '#f59e0b', '#10b981', '#111827'];
  g.fillStyle = cols[seed % cols.length]; g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 12; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(r() * 512, 128); g.lineTo(r() * 512, 0); g.lineTo(r() * 512 + 40, 0); g.lineTo(r() * 512 + 20, 128); g.fill(); }
  g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = 'italic bold 44px Arial'; g.textAlign = 'center'; g.fillText(['NGANYA', 'ROUTE 46', 'KIFARU', 'MOTO MOTO'][seed % 4], 256, 80);
  return tex(c, false);
}
export function skyGradient() {
  const [c, g] = canvas(4, 256); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2d6fb8'); gr.addColorStop(0.5, '#8fbde6'); gr.addColorStop(1, '#e8eef2'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); return tex(c, false);
}
export function zebraTexture() {
  const [c, g] = canvas(64, 64); g.clearRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(0, 0, 32, 64); return tex(c);
}
