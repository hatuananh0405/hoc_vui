// Phòng riêng nhìn chéo từ trên cao (isometric 2.5D), vẽ bằng canvas, không cần thư viện.
// Nhân vật đi lại bằng cách bấm vào sàn hoặc dùng phím mũi tên / WASD.
// - Bàn học: ngồi xuống, bật đèn, camera phóng vào bàn rồi mở menu.
// - Góc âm nhạc: ngả lưng trên ghế bãi biển, đeo tai nghe chụp và bịt mắt, lắc lư theo nhạc.
//   Khi ngồi, bảng nhạc hiện ra bên dưới để phát playlist Spotify / YouTube (xem music.js).
// - Góc xem phim: nằm nghiêng chống tay trên sofa song song với TV, ăn bỏng ngô.
// Trả về cleanup() để dọn vòng lặp vẽ, timer và phím tắt.
import { levelInfo } from './store.js';
import { createMusicPanel } from './music.js';

// ---------- Kích thước thế giới ----------
const HW = 32; // nửa chiều rộng một ô trên màn hình (px)
const HH = 16; // nửa chiều cao một ô trên màn hình (px)
const WALL = 130; // chiều cao tường (px)
const W = 10; // số ô theo trục x
const H = 9; // số ô theo trục y
const R = 0.22; // bán kính va chạm của nhân vật (ô)
const SPEED = 3.2; // ô / giây
const CS = 0.5; // kích thước ô lưới tìm đường
const GW = W / CS;
const GH = H / CS;

// Khung nhìn của cả phòng (toạ độ màn hình trước khi phóng to)
const VIEW = { minX: -H * HW - 12, maxX: W * HW + 12, minY: -WALL - 24, maxY: (W + H) * HH + 12 };

const COL = { shirt: '#5b5bf0', pants: '#34406b', skin: '#ffd7b5', hair: '#3b2a20', bag: '#f5a524', shoe: '#1f2340' };

const iso = (x, y, z = 0) => [(x - y) * HW, (x + y) * HH - z];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

// ---------- Đồ đạc ----------
const SOFA_TOP = 20; // độ cao mặt đệm sofa (px)
const LIE_Y = 2.42; // nhân vật nằm dọc sofa trên mặt phẳng y = LIE_Y
const CHAIR_X = 8.1; // ghế bãi biển: nhân vật ngả lưng trên mặt phẳng x = CHAIR_X

// Vùng bị chặn (nhân vật không đi xuyên qua)
const BLOCKS = [
  { x: 1, y: 0, w: 2.2, d: 1 }, // bàn học
  { x: 1.75, y: 1.2, w: 0.7, d: 0.7 }, // ghế
  { x: 0, y: 2.2, w: 0.6, d: 1.8 }, // kệ sách
  { x: 0, y: 5.9, w: 1.8, d: 3.1 }, // giường
  { x: 0.1, y: 0.1, w: 0.7, d: 0.7 }, // chậu cây
  { x: 7.5, y: 0, w: 2, d: 0.45 }, // kệ TV
  { x: 7.2, y: 2.0, w: 2.4, d: 1.1 }, // sofa (song song với TV)
  { x: 7.7, y: 6.2, w: 0.8, d: 1.3 }, // ghế bãi biển
  { x: 7.15, y: 6.65, w: 0.35, d: 0.35 }, // bàn nước dừa
  { x: 8.65, y: 7.1, w: 0.45, d: 0.3 }, // radio
  { x: 9.2, y: 5.75, w: 0.2, d: 0.2 }, // cột ô che nắng
];

// Những chỗ tương tác được
const DESK = { id: 'desk', label: '🪑 Ngồi học', x: 2.1, y: 1.5, near: 1.3, btn: [2.1, 0.5, 92], action: 'sit' };
const MUSIC = {
  id: 'music', label: '🎧 Nghe nhạc', action: 'lounge', pose: 'beach',
  zone: { x: 6.4, y: 5.6, w: 3.4, d: 3.2 },
  seat: { x: CHAIR_X, y: 6.9, fx: 0, fy: 1 }, exit: { x: CHAIR_X, y: 7.95 },
  btn: [CHAIR_X, 6.7, 62], standBtn: [CHAIR_X, 6.36, 122],
  msg: '🏖️ Chọn playlist bên dưới để phát nhạc nhé!',
};
const MOVIE = {
  id: 'movie', label: '🍿 Xem phim', action: 'lounge', pose: 'sofa',
  zone: { x: 6.6, y: 0.5, w: 3.2, d: 3.9 },
  seat: { x: 8.4, y: LIE_Y, fx: 0, fy: -1 }, exit: { x: 8.4, y: 1.45 },
  btn: [8.4, 2.5, 50], standBtn: [7.75, LIE_Y, 114],
  msg: '🍿 Nằm chống tay xem phim, nhâm nhi bỏng ngô...',
};
const SPOTS = [DESK, MUSIC, MOVIE];
const STAND = { id: 'stand', label: '⬆️ Đứng dậy', action: 'stand' };

// ---------- Hàm vẽ cơ bản ----------
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const t = f < 0 ? 0 : 255;
  const p = Math.abs(f);
  const ch = (v) => Math.round(v + (t - v) * p);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function poly(c, pts, fill, stroke, lw = 1) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}

function line(c, a, b) {
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.stroke();
}

function rr(c, x, y, w, h, r, fill) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
}

function ell(c, x, y, rx, ry, fill) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
}

function limb(c, a, b, w, col) {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineCap = 'round';
  line(c, a, b);
}

// Khối hộp isometric: (x, y) ô, z độ cao đáy (px), w/d kích thước ô, h chiều cao (px)
function box(c, x, y, z, w, d, h, color) {
  poly(c, [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)], shade(color, -0.12));
  poly(c, [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)], shade(color, -0.26));
  poly(c, [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)], shade(color, 0.08));
}

// Vẽ trên mặt phẳng x = x0 (tường trái). Gốc ở đầu bên trái màn hình (y lớn), trục ngang đi về phía y nhỏ.
function wallL(c, x0, yLeft, zTop, fn) {
  const [sx, sy] = iso(x0, yLeft, zTop);
  c.save();
  c.translate(sx, sy);
  c.transform(1, -0.5, 0, 1, 0, 0);
  fn();
  c.restore();
}

// Vẽ trên mặt phẳng y = y0 (tường phải hoặc mặt trước của đồ vật). Gốc ở đầu bên trái màn hình (x nhỏ).
function wallR(c, xLeft, y0, zTop, fn) {
  const [sx, sy] = iso(xLeft, y0, zTop);
  c.save();
  c.translate(sx, sy);
  c.transform(1, 0.5, 0, 1, 0, 0);
  fn();
  c.restore();
}

// Hình tròn nằm trên sàn (thảm tròn)
function floorCircle(cx, cy, r, z = 0) {
  const pts = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts.push(iso(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z));
  }
  return pts;
}

// ---------- Phòng ----------
function drawRoom(c, S) {
  // Sàn gỗ
  poly(c, [iso(0, 0), iso(W, 0), iso(W, H), iso(0, H)], '#dcab72');
  c.strokeStyle = 'rgba(120,70,30,.16)';
  c.lineWidth = 1;
  for (let r = 0, y = 0; y < H; r++, y += 0.75) {
    if (y > 0) line(c, iso(0, y), iso(W, y));
    for (let x = (r % 2) * 1.25 + 1.25; x < W; x += 2.5) line(c, iso(x, y), iso(x, Math.min(H, y + 0.75)));
  }

  // Tường và chân tường
  poly(c, [iso(0, 0, 0), iso(0, H, 0), iso(0, H, WALL), iso(0, 0, WALL)], '#f1d9bc');
  poly(c, [iso(0, 0, 0), iso(W, 0, 0), iso(W, 0, WALL), iso(0, 0, WALL)], '#fbe9d2');
  poly(c, [iso(0, 0, 0), iso(0, H, 0), iso(0, H, 9), iso(0, 0, 9)], '#c48b58');
  poly(c, [iso(0, 0, 0), iso(W, 0, 0), iso(W, 0, 9), iso(0, 0, 9)], '#cf9663');
  c.strokeStyle = '#e2c29b';
  c.lineWidth = 5;
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(...iso(0, H, WALL));
  c.lineTo(...iso(0, 0, WALL));
  c.lineTo(...iso(W, 0, WALL));
  c.stroke();

  // Cửa sổ trên tường phải: trời xanh, mây trôi
  box(c, 3.9, 0, 44, 2.6, 0.18, 5, '#e2c29b');
  wallR(c, 4, 0, 112, () => {
    const w = 2.4 * 32;
    const h = 60;
    rr(c, -4, -4, w + 8, h + 8, 4, '#ffffff');
    c.save();
    c.beginPath();
    c.rect(0, 0, w, h);
    c.clip();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8fd3ff');
    g.addColorStop(1, '#dff4ff');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    ell(c, w - 16, 14, 9 + Math.sin(S.t * 1.5) * 0.8, 9 + Math.sin(S.t * 1.5) * 0.8, '#ffd65a');
    for (const [speed, off, y, k] of [[6, 0, 18, 1], [4, 55, 38, 0.7]]) {
      const x = ((S.t * speed + off) % (w + 50)) - 25;
      c.globalAlpha = k === 1 ? 1 : 0.85;
      ell(c, x, y, 9 * k, 6 * k, '#fff');
      ell(c, x + 9 * k, y - 4 * k, 9 * k, 8 * k, '#fff');
      ell(c, x + 18 * k, y, 8 * k, 6 * k, '#fff');
      c.globalAlpha = 1;
    }
    ell(c, w * 0.55, h + 16, w * 0.75, 26, '#8ccf7e');
    c.restore();
    c.fillStyle = '#e2c29b';
    c.fillRect(w / 2 - 1.5, 0, 3, h);
    c.fillRect(0, h / 2 - 1.5, w, 3);
  });

  // Bảng nhỏ trên tường trái
  wallL(c, 0, 7.8, 114, () => {
    const w = 2.6 * 32;
    rr(c, 0, 0, w, 54, 4, '#8b5a2b');
    rr(c, 4, 4, w - 8, 46, 2, '#2f5d50');
    c.fillStyle = '#f4f1e8';
    c.textAlign = 'center';
    c.font = 'bold 17px "Comic Sans MS", "Segoe Print", cursive';
    c.fillText('HọcVui', w / 2, 27);
    c.font = '8px "Comic Sans MS", "Segoe Print", cursive';
    c.fillText('Vừa chơi vừa học', w / 2, 41);
  });

  // Đồng hồ treo tường, chạy theo giờ thật
  wallL(c, 0, 4.75, 100, () => {
    ell(c, 0, 0, 13, 13, '#fff');
    c.strokeStyle = COL.shirt;
    c.lineWidth = 3;
    c.stroke();
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const hr = (d.getHours() % 12) + m / 60;
    const hand = (frac, len, lw, col) => {
      const a = frac * Math.PI * 2 - Math.PI / 2;
      c.strokeStyle = col;
      c.lineWidth = lw;
      c.lineCap = 'round';
      line(c, [0, 0], [Math.cos(a) * len, Math.sin(a) * len]);
    };
    hand(hr / 12, 6, 2.2, '#1f2340');
    hand(m / 60, 9, 1.6, '#1f2340');
    hand(s / 60, 10, 0.8, '#e5484d');
    ell(c, 0, 0, 1.6, 1.6, '#1f2340');
  });

  drawTV(c, S);
}

// ---------- TV treo tường ----------
const TV = { x: 7.45, zTop: 106, w: 64, h: 38 };
const SHOW_GLOW = ['#7cc8ff', '#ff9a5a', '#8f7cff'];

function drawTV(c, S) {
  wallR(c, TV.x, 0, TV.zTop, () => {
    const { w, h } = TV;
    rr(c, -4, -4, w + 8, h + 8, 5, '#1f2340');
    c.save();
    c.beginPath();
    c.rect(0, 0, w, h);
    c.clip();
    if (S.tv) drawShow(c, w, h, S.t - S.tvT0);
    else {
      c.fillStyle = '#23263d';
      c.fillRect(0, 0, w, h);
      poly(c, [[w * 0.15, 0], [w * 0.42, 0], [w * 0.2, h], [-w * 0.07, h]], 'rgba(255,255,255,.07)');
    }
    c.restore();
    ell(c, w / 2, h + 2, 1.3, 1.3, S.tv ? '#1fa971' : '#e5484d');
  });
}

// Phim hoạt hình nhỏ chiếu trên TV: 3 cảnh luân phiên, mỗi cảnh 5 giây
function drawShow(c, w, h, tt) {
  const scene = Math.floor(tt / 5) % 3;
  const k = (tt % 5) / 5;
  if (scene === 0) {
    // Ban ngày: quả bóng nảy trên đồi
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#6cc4ff');
    g.addColorStop(1, '#cdeeff');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    ell(c, ((tt * 8) % (w + 30)) - 15, 9, 7, 3.5, '#fff');
    ell(c, w * 0.5, h + 8, w * 0.8, 16, '#7ccf6e');
    const bx = lerp(-6, w + 6, k);
    const by = h - 13 - Math.abs(Math.sin(tt * 5)) * 15;
    ell(c, bx, h - 9, 5, 1.6, 'rgba(0,0,0,.18)');
    ell(c, bx, by, 5, 5, '#e5484d');
    ell(c, bx - 1.5, by - 1.5, 1.5, 1.5, '#ff9a9a');
  } else if (scene === 1) {
    // Hoàng hôn: mặt trời lặn, chim bay
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5b3f8f');
    g.addColorStop(0.6, '#ff8a5a');
    g.addColorStop(1, '#ffd08a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    ell(c, w * 0.5, h * 0.55 + k * 10, 10, 10, '#ffe066');
    c.fillStyle = '#3b2a4a';
    c.fillRect(0, h - 7, w, 7);
    c.strokeStyle = '#2a1f3a';
    c.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const x = lerp(w + 8, -8, (k + i * 0.18) % 1);
      const y = 9 + i * 5 + Math.sin(tt * 3 + i) * 1.5;
      c.beginPath();
      c.moveTo(x - 3, y - 1.5);
      c.quadraticCurveTo(x - 1.5, y - 3, x, y);
      c.quadraticCurveTo(x + 1.5, y - 3, x + 3, y - 1.5);
      c.stroke();
    }
  } else {
    // Ban đêm: tên lửa bay giữa các vì sao
    c.fillStyle = '#141a3a';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      const sx = (i * 37) % w;
      const sy = (i * 23) % h;
      c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(tt * 2 + i));
      ell(c, sx, sy, 0.9, 0.9, '#fff');
    }
    c.globalAlpha = 1;
    ell(c, w - 12, 10, 6, 6, '#f1e6b8');
    const rx = lerp(-10, w + 10, k);
    const ry = h * 0.6 - k * 14;
    c.save();
    c.translate(rx, ry);
    c.rotate(-0.35);
    ell(c, -7, 0, 3 + Math.random() * 1.5, 1.8, '#ffb14a');
    rr(c, -5, -2.5, 10, 5, 2.5, '#f4f1e8');
    poly(c, [[5, -2.5], [8.5, 0], [5, 2.5]], '#e5484d');
    ell(c, 1, 0, 1.2, 1.2, '#5b9bff');
    c.restore();
  }
  // Hiệu ứng bật TV: vạch sáng mở rộng ra
  if (tt < 0.5) {
    const p = tt / 0.5;
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h * (1 - p) * 0.5);
    c.fillRect(0, h - h * (1 - p) * 0.5, w, h * (1 - p) * 0.5);
    c.fillStyle = `rgba(255,255,255,${1 - p})`;
    c.fillRect(0, h / 2 - 1, w, 2);
  }
  // Vạch quét mờ
  c.fillStyle = 'rgba(0,0,0,.06)';
  for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
}

function drawFloorDecor(c) {
  // Thảm hồng giữa phòng
  poly(c, [iso(3.6, 2.8), iso(6.6, 2.8), iso(6.6, 5.6), iso(3.6, 5.6)], '#f6c6d0');
  poly(c, [iso(3.85, 3.05), iso(6.35, 3.05), iso(6.35, 5.35), iso(3.85, 5.35)], null, '#fff', 2);
  const [cx, cy] = iso(5.1, 4.2);
  ell(c, cx, cy, 30, 15, '#fbdbe2');

  // Thảm góc xem phim, nằm giữa TV và sofa
  poly(c, [iso(6.8, 0.75), iso(9.85, 0.75), iso(9.85, 3.4), iso(6.8, 3.4)], '#3d4a8a');
  poly(c, [iso(7.0, 0.95), iso(9.65, 0.95), iso(9.65, 3.2), iso(7.0, 3.2)], null, '#7f8be0', 2);

  // Bãi cát nhỏ ở góc âm nhạc: viền sóng biển, sao biển và vỏ ốc
  poly(c, floorCircle(8.2, 7.1, 1.45), '#7fd3e6');
  poly(c, floorCircle(8.2, 7.1, 1.3), '#f6e2b3');
  poly(c, floorCircle(8.2, 7.1, 1.37), null, '#ffffff', 1.5);
  c.font = 'bold 12px system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillStyle = '#ff8a4a';
  c.fillText('★', ...iso(7.35, 7.75));
  const [sx, sy] = iso(9.0, 7.95);
  ell(c, sx, sy, 4, 2.6, '#ffd9e1');
  c.strokeStyle = '#e8a7b6';
  c.lineWidth = 0.8;
  for (const dx of [-2, 0, 2]) line(c, [sx, sy + 2.4], [sx + dx, sy - 2]);
}

function drawDesk(c, S) {
  const x = 1, y = 0, w = 2.2, d = 1;
  for (const [lx, ly] of [[x + 0.06, y + 0.06], [x + w - 0.18, y + 0.06], [x + 0.06, y + d - 0.18], [x + w - 0.18, y + d - 0.18]]) {
    box(c, lx, ly, 0, 0.12, 0.12, 34, '#8a5229');
  }
  box(c, x + 0.1, y + 0.1, 24, w - 0.2, d - 0.2, 10, '#9c5f31'); // ngăn kéo
  box(c, x, y, 34, w, d, 6, '#b5733f');
  // Sách xếp chồng
  box(c, 1.15, 0.15, 40, 0.55, 0.4, 5, '#e5484d');
  box(c, 1.18, 0.17, 45, 0.5, 0.36, 5, '#1fa971');
  box(c, 1.14, 0.16, 50, 0.54, 0.38, 5, '#5b5bf0');
  // Vở mở
  poly(c, [iso(1.9, 0.45, 40.5), iso(2.5, 0.45, 40.5), iso(2.5, 0.88, 40.5), iso(1.9, 0.88, 40.5)], '#fff', '#d6d9ee');
  c.strokeStyle = '#d6d9ee';
  line(c, iso(2.2, 0.45, 40.6), iso(2.2, 0.88, 40.6));
  // Ống bút
  box(c, 2.62, 0.15, 40, 0.18, 0.18, 12, '#f5a524');
  const [px, py] = iso(2.71, 0.24, 52);
  c.lineWidth = 2.5;
  c.lineCap = 'round';
  for (const [dx, h, col] of [[-3, 12, '#e5484d'], [0, 15, '#5b5bf0'], [3, 11, '#1fa971']]) {
    c.strokeStyle = col;
    line(c, [px + dx, py], [px + dx * 1.6, py - h]);
  }
  // Đèn bàn
  const [bx, by] = iso(2.95, 0.3, 40);
  ell(c, bx, by, 9, 3.5, '#3d4270');
  c.strokeStyle = '#3d4270';
  c.lineWidth = 3.5;
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(bx, by);
  c.lineTo(bx + 6, by - 28);
  c.lineTo(bx - 8, by - 40);
  c.stroke();
  poly(c, [[bx - 3, by - 47], [bx - 21, by - 40], [bx - 16, by - 29], [bx - 1, by - 36]], '#5b5bf0');
  ell(c, bx - 14, by - 33, 3.5, 2.5, S.lampOn ? '#fff6b0' : '#d9dbea');
}

function drawChairSeat(c) {
  for (const [lx, ly] of [[1.8, 1.25], [2.33, 1.25], [1.8, 1.78], [2.33, 1.78]]) box(c, lx, ly, 0, 0.07, 0.07, 16, '#8c5a33');
  box(c, 1.75, 1.2, 16, 0.7, 0.7, 4, '#d9824b');
}

function drawChairBack(c) {
  box(c, 1.8, 1.82, 20, 0.07, 0.07, 12, '#8c5a33');
  box(c, 2.33, 1.82, 20, 0.07, 0.07, 12, '#8c5a33');
  box(c, 1.75, 1.82, 30, 0.7, 0.08, 10, '#d9824b');
}

function drawShelf(c) {
  box(c, 0, 2.2, 0, 0.6, 1.8, 95, '#a8683a');
  wallL(c, 0.6, 4.0, 95, () => {
    const w = 1.8 * 32;
    rr(c, 3, 4, w - 6, 87, 2, '#7a4a26');
    const cols = ['#e5484d', '#5b5bf0', '#1fa971', '#f5a524', '#8e6bd8', '#2bb3c0'];
    [8, 36, 64].forEach((ry, r) => {
      let bx = 6;
      let k = r * 2;
      while (bx < w - 10) {
        const bw = 4 + ((k * 7) % 4);
        const bh = 16 + ((k * 5) % 7);
        c.fillStyle = cols[k % cols.length];
        c.fillRect(bx, ry + 24 - bh, bw, bh);
        bx += bw + 1;
        k++;
      }
      c.fillStyle = '#a8683a';
      c.fillRect(3, ry + 24, w - 6, 4);
    });
  });
}

function drawBed(c) {
  box(c, 0, 5.9, 0, 1.8, 0.15, 46, '#a8683a'); // đầu giường
  box(c, 0, 5.9, 0, 1.8, 3.1, 16, '#a8683a');
  box(c, 0.05, 6.05, 16, 1.7, 2.9, 8, '#f7f3ea');
  box(c, 0.25, 6.15, 24, 1.3, 0.55, 7, '#ffffff'); // gối
  box(c, 0.03, 7.0, 16, 1.74, 1.98, 11, '#8ec5ff'); // chăn
  const [sx, sy] = iso(0.9, 8, 27);
  ell(c, sx, sy, 10, 5, '#b5dcff');
}

function drawPlant(c, S) {
  box(c, 0.2, 0.2, 0, 0.5, 0.5, 20, '#e07a4f');
  const [px, py] = iso(0.45, 0.45, 20);
  ell(c, px, py, 11, 5, '#6b4a2b');
  c.save();
  c.translate(px, py);
  c.rotate(Math.sin(S.t * 1.2) * 0.05);
  for (const [a, l, col] of [[-0.7, 30, '#3fa266'], [0.7, 30, '#3fa266'], [-0.25, 40, '#4cb877'], [0.3, 38, '#4cb877'], [0, 46, '#5fcf8a']]) {
    c.save();
    c.rotate(a);
    ell(c, 0, -l / 2, 6, l / 2, col);
    c.restore();
  }
  c.restore();
}

// ---------- Đồ đạc góc xem phim ----------
function drawPopcorn(c, x, y, k = 1) {
  const h = 15 * k;
  const bw = 5.5 * k;
  const tw = 8 * k;
  const body = [[x - bw, y], [x + bw, y], [x + tw, y - h], [x - tw, y - h]];
  poly(c, body, '#ffffff');
  for (const t of [-0.62, 0, 0.62]) {
    poly(c, [[x + t * bw - 1.1 * k, y], [x + t * bw + 1.1 * k, y], [x + t * tw + 1.5 * k, y - h], [x + t * tw - 1.5 * k, y - h]], '#e5484d');
  }
  const puffs = [[-5.5, 0, 3.3], [0, -1.5, 3.8], [5.5, 0, 3.3], [-2.8, -4.5, 3.2], [3, -5, 3], [0, -7, 2.6]];
  puffs.forEach(([px, py, r], i) => ell(c, x + px * k, y - h + py * k, r * k, r * k, i % 2 ? '#ffe7a3' : '#fff7dc'));
}

function drawTVStand(c, S) {
  box(c, 7.5, 0, 0, 2, 0.45, 24, '#8a5a3b');
  // Hai cánh tủ nhìn từ mặt trước
  wallR(c, 7.5, 0.45, 24, () => {
    c.strokeStyle = 'rgba(0,0,0,.18)';
    c.lineWidth = 1;
    c.strokeRect(3, 4, 28, 16);
    c.strokeRect(33, 4, 28, 16);
    ell(c, 29, 12, 1.3, 1.3, '#f5d08a');
    ell(c, 35, 12, 1.3, 1.3, '#f5d08a');
  });
  // Loa thanh và xô bỏng ngô (khi chưa xem)
  box(c, 8.0, 0.08, 24, 1.0, 0.16, 5, '#2b2f4a');
  if (!S.tv) {
    const [px, py] = iso(9.2, 0.25, 24);
    drawPopcorn(c, px, py, 0.8);
  }
}

// Sofa nằm ngang, song song với TV: đệm ở phía TV, lưng tựa thấp ở phía người xem.
function drawSofaArmFar(c) {
  box(c, 7.2, 2.0, 0, 0.2, 1.1, 30, '#5b66c4');
}

function drawSofaSeat(c) {
  box(c, 7.4, 2.0, 0, 2.0, 0.85, 12, '#4a54a8'); // khung
  box(c, 7.4, 2.04, 12, 2.0, 0.81, SOFA_TOP - 12, '#6f7bd9'); // đệm ngồi
  box(c, 7.44, 2.55, SOFA_TOP, 0.42, 0.28, 8, '#ffd65a'); // gối nhỏ
}

function drawSofaBack(c) {
  box(c, 7.4, 2.85, 0, 2.0, 0.25, SOFA_TOP + 14, '#4a54a8');
  box(c, 7.4, 2.85, SOFA_TOP + 14, 2.0, 0.25, 3, '#5b66c4');
}

function drawSofaArmNear(c) {
  box(c, 9.4, 2.0, 0, 0.2, 1.1, 30, '#5b66c4');
}

// ---------- Đồ đạc góc âm nhạc (kiểu bãi biển) ----------
const CANVAS = ['#ff6b6b', '#fff7e6', '#4ecdc4', '#fff7e6', '#ff6b6b'];

// Đường cong tấm vải võng của ghế: từ đỉnh lưng ghế, võng xuống chỗ ngồi, lên thanh trước
function slingPoint(t) {
  const [y0, z0, y1, z1, y2, z2] = [6.28, 46, 6.98, 2, 7.42, 22];
  const u = 1 - t;
  return [u * u * y0 + 2 * u * t * y1 + t * t * y2, u * u * z0 + 2 * u * t * z1 + t * t * z2];
}

function drawBeachChair(c) {
  const wood = '#c98a4b';
  const frame = (x) => {
    limb(c, iso(x, 7.05, 0), iso(x, 6.26, 48), 3.2, wood); // khung lưng
    limb(c, iso(x, 6.45, 0), iso(x, 7.45, 23), 3.2, wood); // khung chân trước
    limb(c, iso(x, 6.7, 28), iso(x, 7.45, 23), 2.6, shade(wood, -0.1)); // tay vịn
  };
  frame(7.72);
  // Vải sọc
  const N = 12;
  const xs = [7.75, 7.89, 8.03, 8.17, 8.31, 8.45];
  for (let b = 0; b < xs.length - 1; b++) {
    const top = [];
    const bot = [];
    for (let i = 0; i <= N; i++) {
      const [y, z] = slingPoint(i / N);
      top.push(iso(xs[b], y, z));
      bot.unshift(iso(xs[b + 1], y, z));
    }
    poly(c, top.concat(bot), CANVAS[b]);
  }
  limb(c, iso(7.72, 7.45, 23), iso(8.48, 7.45, 23), 3, wood); // thanh trước
  limb(c, iso(7.72, 6.27, 47), iso(8.48, 6.27, 47), 3, wood); // thanh trên
  frame(8.48);
}

function drawDrinkTable(c) {
  box(c, 7.27, 6.77, 0, 0.1, 0.1, 16, '#c98a4b');
  box(c, 7.15, 6.65, 16, 0.35, 0.35, 3, '#e0a868');
  const [x, y] = iso(7.32, 6.82, 19);
  ell(c, x, y - 5, 6, 5.5, '#8b5a2b');
  ell(c, x - 1, y - 8.5, 3, 1.4, '#f4f1e8');
  c.strokeStyle = '#ff6b6b';
  c.lineWidth = 1.5;
  line(c, [x + 1, y - 9], [x + 5, y - 17]);
  poly(c, [[x + 2, y - 18], [x + 9, y - 16], [x + 5, y - 21]], '#ffd65a'); // ô nhỏ trang trí
}

function drawRadio(c, S) {
  box(c, 8.65, 7.1, 0, 0.45, 0.3, 15, '#4ecdc4');
  c.strokeStyle = '#2b2f4a';
  c.lineWidth = 2;
  c.beginPath();
  const [hx, hy] = iso(8.87, 7.25, 15);
  c.moveTo(hx - 8, hy);
  c.quadraticCurveTo(hx, hy - 10, hx + 8, hy);
  c.stroke();
  const pulse = musicOn(S) ? 1 + Math.abs(Math.sin(S.t * Math.PI * 1.8)) * 0.22 : 1;
  wallR(c, 8.65, 7.4, 15, () => {
    for (const cx of [3.6, 10.8]) {
      ell(c, cx, 7.5, 3.2 * pulse, 3.2 * pulse, '#2b2f4a');
      ell(c, cx, 7.5, 1.2, 1.2, '#8aa0b8');
    }
  });
}

function drawUmbrella(c) {
  const px = 9.3;
  const py = 5.85;
  limb(c, iso(px, py, 0), iso(px, py, 94), 2.6, '#f4f1e8');
  const top = iso(px, py, 100);
  const segs = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const r = 0.9;
    const p0 = iso(px + Math.cos(a0) * r, py + Math.sin(a0) * r, 82);
    const p1 = iso(px + Math.cos(a1) * r, py + Math.sin(a1) * r, 82);
    const am = (a0 + a1) / 2;
    segs.push({ pts: [top, p0, p1], col: i % 2 ? '#fff7e6' : '#ff6b6b', depth: Math.cos(am) + Math.sin(am) });
  }
  segs.sort((a, b) => a.depth - b.depth).forEach((s) => poly(c, s.pts, s.col, 'rgba(0,0,0,.08)'));
  ell(c, top[0], top[1], 2.5, 2.5, '#f4f1e8');
}

// ---------- Nhân vật chibi ----------
// Đầu vẽ quanh tâm (0, -46). o: độ lệch mặt theo hướng nhìn (3/4).
function drawHead(c, front, o, S, opts = {}) {
  ell(c, 0, -46, 17, 16, COL.skin);
  if (front) {
    c.fillStyle = COL.hair;
    c.beginPath();
    c.ellipse(0, -48, 18, 15, 0, Math.PI, Math.PI * 2);
    c.quadraticCurveTo(14, -42, 9, -44);
    c.quadraticCurveTo(4, -40, 0, -44);
    c.quadraticCurveTo(-6, -40, -10, -44);
    c.quadraticCurveTo(-15, -41, -18, -48);
    c.fill();
    if (opts.mask) {
      // Bịt mắt có vẽ hai mắt nhắm cười
      c.fillStyle = '#4b3f8a';
      c.fillRect(-17, -45, 34, 3);
      rr(c, -14 + o, -47, 28, 10, 5, '#b9a4ff');
      c.strokeStyle = '#5a47b0';
      c.lineWidth = 1.3;
      c.lineCap = 'round';
      for (const ex of [-6 + o, 6 + o]) {
        c.beginPath();
        c.arc(ex, -43.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI);
        c.stroke();
      }
    } else if (S.t % 4.2 < 0.13) {
      c.strokeStyle = '#1f2340';
      c.lineWidth = 1.6;
      line(c, [-8 + o, -42], [-3 + o, -42]);
      line(c, [3 + o, -42], [8 + o, -42]);
    } else {
      ell(c, -5.5 + o, -42, 2.4, 3.2, '#1f2340');
      ell(c, 5.5 + o, -42, 2.4, 3.2, '#1f2340');
      ell(c, -4.8 + o, -43.3, 0.9, 0.9, '#fff');
      ell(c, 6.2 + o, -43.3, 0.9, 0.9, '#fff');
    }
    ell(c, -10 + o, -36.5, 3, 1.8, 'rgba(255,120,120,.45)');
    ell(c, 10 + o, -36.5, 3, 1.8, 'rgba(255,120,120,.45)');
    c.strokeStyle = '#1f2340';
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(o, -38.5, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  } else if (opts.cheek) {
    // Nhìn từ phía sau, đầu hơi quay sang phải: thấy má và tai bên phải
    ell(c, -3, -47.5, 16.5, 16.5, COL.hair);
    ell(c, 2, -34.5, 8, 3.5, COL.hair);
    ell(c, 12.5, -43, 3.2, 4.2, shade(COL.skin, -0.06));
    ell(c, 13, -37, 2.6, 1.6, 'rgba(255,120,120,.45)');
  } else {
    ell(c, 0, -47, 18, 16.5, COL.hair);
    ell(c, 0, -34, 9, 4, COL.hair);
  }
  if (opts.phones) {
    // Tai nghe chụp tai
    c.strokeStyle = '#2b2f4a';
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, -46, 20, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    for (const sx of [-1, 1]) {
      rr(c, sx * 19 - 5, -53, 10, 16, 5, '#e5484d');
      rr(c, sx > 0 ? 14 : -18, -50, 4, 10, 2, '#ff9a9e'); // đệm tai
    }
  }
}

function drawTag(c, x, y, level) {
  const text = `Cấp ${level}`;
  c.font = 'bold 10px system-ui, sans-serif';
  c.textAlign = 'center';
  const tw = c.measureText(text).width + 14;
  rr(c, x - tw / 2, y - 11, tw, 15, 7.5, 'rgba(31,35,64,.78)');
  c.fillStyle = '#fff';
  c.fillText(text, x, y);
}

function drawHero(c, hero, S, level) {
  if (hero.pose === 'sofa') return drawLying(c, S, level);
  if (hero.pose === 'beach') return drawReclined(c, S, level);
  const [sx, sy] = iso(hero.x, hero.y);
  const dx = hero.fx - hero.fy; // hướng nhìn trên màn hình
  const dy = hero.fx + hero.fy;
  const front = dy > 0.01 || (Math.abs(dy) <= 0.01 && dx >= 0);
  const flip = dx < -0.01;
  const sitting = hero.pose === 'desk';
  const lift = sitting ? 20 : 0;
  const bob = hero.moving ? -Math.abs(Math.sin(hero.phase)) * 2.5 : Math.sin(S.t * 2.2) * 0.8;
  const step = hero.moving ? Math.sin(hero.phase) : 0;

  c.save();
  c.translate(sx, sy);
  if (!sitting) ell(c, 0, 0, 13, 5, 'rgba(60,30,0,.18)');
  if (flip) c.scale(-1, 1);
  c.translate(0, bob - lift);

  // Chân
  if (sitting) {
    rr(c, -7, -7, 6, 7, 2, COL.pants);
    rr(c, 1, -7, 6, 7, 2, COL.pants);
  } else {
    const l1 = Math.max(0, step) * 2.5;
    const l2 = Math.max(0, -step) * 2.5;
    rr(c, -7, -13 - l1, 6, 12, 3, COL.pants);
    rr(c, 1, -13 - l2, 6, 12, 3, COL.pants);
    rr(c, -8 + (front ? 1 : 0), -4 - l1, 8, 4, 2, COL.shoe);
    rr(c, 0 + (front ? 1 : 0), -4 - l2, 8, 4, 2, COL.shoe);
  }

  // Thân
  rr(c, -11, -31, 22, 20, 8, COL.shirt);
  if (front) {
    poly(c, [[-4, -31], [0, -26], [4, -31]], '#fff');
    c.strokeStyle = COL.bag;
    c.lineWidth = 2;
    line(c, [-8, -30], [-8, -21]);
    line(c, [8, -30], [8, -21]);
  } else if (!sitting) {
    rr(c, -8, -30, 16, 16, 5, COL.bag);
    rr(c, -5, -21, 10, 5, 2, shade(COL.bag, -0.15));
  }

  // Tay
  const armCol = shade(COL.shirt, -0.12);
  if (sitting) {
    rr(c, -15, -32, 6, 9, 3, armCol);
    rr(c, 9, -32, 6, 9, 3, armCol);
  } else {
    const a = step * 3;
    rr(c, -15, -29 + a, 6, 12, 3, armCol);
    rr(c, 9, -29 - a, 6, 12, 3, armCol);
    ell(c, -12, -16 + a, 3, 3, COL.skin);
    ell(c, 12, -16 - a, 3, 3, COL.skin);
  }

  drawHead(c, front, 1.8, S);
  c.restore();

  drawTag(c, sx, sy + bob - lift - 72, level);
}

// Có nhạc đang phát không. playing = null: trình phát không báo trạng thái, coi như đang phát.
const musicOn = (S) => S.music && S.playing !== false;

// Đầu nghe nhạc trên ghế bãi biển (dùng cho nốt nhạc bay lên)
const beachHead = (S) => iso(CHAIR_X, 6.36, 49 - Math.abs(Math.sin(S.t * Math.PI * 1.8)) * 1.2);

// Ngả lưng trên ghế bãi biển, hai tay gối sau đầu, đeo tai nghe và bịt mắt, lắc lư theo nhạc.
function drawReclined(c, S, level) {
  const Q = (dx, y, z) => iso(CHAIR_X + dx, y, z);
  const beat = Math.abs(Math.sin(S.t * Math.PI * 1.8));
  const head = beachHead(S);
  const hip = Q(0, 6.92, 15);
  const chest = Q(0, 6.58, 31 - beat);
  const armCol = shade(COL.shirt, -0.12);

  // Hai tay vòng ra sau gáy, khuỷu tay chĩa sang hai bên
  for (const s of [-1, 1]) {
    const sh = Q(s * 0.28, 6.58, 34);
    const el = Q(s * 0.52, 6.46, 54);
    const hd = Q(s * 0.1, 6.3, 50);
    limb(c, sh, el, 7, armCol);
    limb(c, el, hd, 6, armCol);
    ell(c, hd[0], hd[1], 3.4, 3.4, COL.skin);
  }

  // Thân
  limb(c, chest, hip, 22, COL.shirt);
  poly(c, [[chest[0] - 5, chest[1] - 9], [chest[0] - 1, chest[1] - 3], [chest[0] + 3, chest[1] - 9]], '#fff');

  // Chân: đùi trên mặt ghế, cẳng chân thả xuống cát, chân phải nhịp theo nhạc
  for (const s of [1, -1]) {
    const knee = Q(s * 0.12, 7.32, 23);
    const foot = Q(s * 0.12, 7.72, s < 0 ? 3 + beat * 3 : 3);
    const hp = Q(s * 0.12, 6.92, 15);
    const col = s > 0 ? shade(COL.pants, -0.12) : COL.pants;
    limb(c, hp, knee, 9, col);
    limb(c, knee, foot, 8, col);
    rr(c, foot[0] - 5, foot[1] - 3, 9, 5, 2, COL.shoe);
  }

  // Đầu lắc lư theo nhịp
  c.save();
  c.translate(head[0], head[1] + 46);
  c.translate(0, -30);
  c.rotate(Math.sin(S.t * Math.PI * 0.9) * 0.1);
  c.translate(0, 30);
  drawHead(c, true, -2.5, S, { mask: true, phones: true });
  c.restore();

  drawTag(c, head[0], head[1] - 32, level);
}

// Nằm nghiêng dọc sofa, khuỷu tay chống trên đệm, bàn tay đỡ đầu, quay mặt về TV.
// Tay còn lại bốc bỏng ngô trong xô đặt trước ngực.
function drawLying(c, S, level) {
  const P = (x, z, dy = 0) => iso(x, LIE_Y + dy, SOFA_TOP + z);
  const elbow = P(7.62, 3);
  const palm = P(7.66, 22);
  const head = P(7.74, 31);
  const shoulder = P(7.98, 15);
  const hip = P(8.72, 10);
  const bucket = P(8.2, 0, -0.32);

  // Chu kỳ ăn bỏng ngô: tay bốc trong xô rồi đưa lên miệng (phía trước mặt, khuất sau đầu)
  const p = (S.t % 2.8) / 2.8;
  const toMouth = p < 0.25 ? p / 0.25 : p < 0.45 ? 1 : p < 0.7 ? 1 - (p - 0.45) / 0.25 : 0;
  const ease = toMouth * toMouth * (3 - 2 * toMouth);
  const handFrom = [bucket[0] - 1, bucket[1] - 17];
  const handTo = P(7.84, 27, -0.22);
  const hand = [lerp(handFrom[0], handTo[0], ease), lerp(handFrom[1], handTo[1], ease)];

  // Xô bỏng ngô trước ngực (xa người xem hơn nên vẽ trước)
  drawPopcorn(c, bucket[0], bucket[1]);
  const pop = (S.t % 3.7) / 0.7;
  if (pop < 1) ell(c, bucket[0] + pop * 9, bucket[1] - 20 - Math.sin(pop * Math.PI) * 13, 2.3, 2.3, '#fff7dc');

  // Chân: chân dưới duỗi thẳng, chân trên hơi co
  limb(c, hip, P(9.06, 6), 9, shade(COL.pants, -0.15));
  limb(c, P(9.06, 6), P(9.32, 4), 8, shade(COL.pants, -0.15));
  rr(c, P(9.32, 4)[0] - 1, P(9.32, 4)[1] - 5, 8, 6, 2.5, COL.shoe);
  limb(c, hip, P(9.0, 13, -0.1), 9, COL.pants);
  limb(c, P(9.0, 13, -0.1), P(9.33, 9), 8, COL.pants);
  rr(c, P(9.33, 9)[0] - 1, P(9.33, 9)[1] - 5, 8, 6, 2.5, COL.shoe);

  // Thân nằm nghiêng (nhìn thấy lưng)
  limb(c, shoulder, hip, 21, COL.shirt);
  limb(c, P(8.1, 19), P(8.55, 15), 2, shade(COL.shirt, -0.18)); // nếp áo

  // Tay chống đầu: khuỷu tay trên đệm, cẳng tay dựng lên đỡ má
  limb(c, shoulder, elbow, 7, shade(COL.shirt, -0.12));
  limb(c, elbow, palm, 6, shade(COL.shirt, -0.12));
  ell(c, palm[0], palm[1], 3.6, 3.6, COL.skin);

  // Tay trên bốc bỏng ngô
  limb(c, P(8.05, 18), hand, 6, shade(COL.shirt, -0.05));
  ell(c, hand[0], hand[1], 3.3, 3.3, COL.skin);
  if (ease > 0.05 && p < 0.45) ell(c, hand[0] + 1, hand[1] - 3, 2.2, 2.2, '#fff7dc');

  // Đầu tựa trên bàn tay, nghiêng theo tay
  c.save();
  c.translate(head[0], head[1] + 46);
  c.translate(0, -36);
  c.rotate(0.22);
  c.translate(0, 36);
  drawHead(c, false, 0, S, { cheek: true });
  c.restore();

  drawTag(c, head[0] - 2, head[1] - 28, level);
}

// Nốt nhạc bay lên từ tai nghe
function drawNotes(c, S) {
  const [sx, headY] = beachHead(S);
  const cols = ['#5b5bf0', '#e5484d', '#1fa971', '#f5a524'];
  c.textAlign = 'center';
  for (let i = 0; i < 4; i++) {
    const k = (S.t * 0.45 + i / 4) % 1;
    const side = i % 2 ? 1 : -1;
    c.globalAlpha = Math.min(1, (1 - k) * 1.6, k * 6);
    c.fillStyle = cols[i];
    c.font = `bold ${12 + k * 6}px system-ui, sans-serif`;
    c.fillText(i % 2 ? '♫' : '♪', sx + side * (26 + k * 12) + Math.sin(k * 7 + i) * 4, headY - 4 - k * 48);
  }
  c.globalAlpha = 1;
}

// Vật nào nằm sau (vẽ trước). a, b có dạng {x, y, w, d, bias}
// Hai vật nằm chéo nhau (a trước theo trục này, b trước theo trục kia) thì so theo tâm,
// để kết quả luôn nhất quán khi đổi chỗ a và b.
function depthOrder(a, b) {
  const e = 1e-6;
  const aFirst = a.x + a.w <= b.x + e || a.y + a.d <= b.y + e;
  const bFirst = b.x + b.w <= a.x + e || b.y + b.d <= a.y + e;
  if (aFirst && !bFirst) return -1;
  if (bFirst && !aFirst) return 1;
  return a.x + a.w / 2 + a.y + a.d / 2 + (a.bias || 0) - (b.x + b.w / 2 + b.y + b.d / 2 + (b.bias || 0));
}

const OBJECTS = [
  { x: 1, y: 0, w: 2.2, d: 1, draw: drawDesk },
  { x: 1.75, y: 1.2, w: 0.7, d: 0.62, bias: -1, draw: drawChairSeat },
  { x: 1.75, y: 1.82, w: 0.7, d: 0.08, draw: drawChairBack },
  { x: 0, y: 2.2, w: 0.6, d: 1.8, draw: drawShelf },
  { x: 0, y: 5.9, w: 1.8, d: 3.1, draw: drawBed },
  { x: 0.1, y: 0.1, w: 0.7, d: 0.7, draw: drawPlant },
  { x: 7.5, y: 0, w: 2, d: 0.45, draw: drawTVStand },
  { x: 7.2, y: 2.0, w: 0.2, d: 1.1, draw: drawSofaArmFar },
  { x: 7.4, y: 2.0, w: 2.0, d: 0.85, bias: -1, draw: drawSofaSeat },
  { x: 7.4, y: 2.85, w: 2.0, d: 0.25, draw: drawSofaBack },
  { x: 9.4, y: 2.0, w: 0.2, d: 1.1, draw: drawSofaArmNear },
  { x: 7.7, y: 6.2, w: 0.8, d: 1.3, bias: -1, draw: drawBeachChair },
  { x: 7.15, y: 6.65, w: 0.35, d: 0.35, draw: drawDrinkTable },
  { x: 8.65, y: 7.1, w: 0.45, d: 0.3, draw: drawRadio },
  { x: 9.2, y: 5.75, w: 0.2, d: 0.2, draw: drawUmbrella },
];

// Hộp dùng để xếp thứ tự vẽ nhân vật theo từng tư thế
function heroBox(hero) {
  if (hero.pose === 'sofa') return { x: 7.4, y: 2.0, w: 2.0, d: 0.85 };
  if (hero.pose === 'beach') return { x: 7.75, y: 6.25, w: 0.7, d: 1.25 };
  return { x: hero.x - 0.2, y: hero.y - 0.2, w: 0.4, d: 0.4 };
}

// ---------- Va chạm và tìm đường ----------
function blockedAt(x, y) {
  if (x < R || y < R || x > W - R || y > H - R) return true;
  return BLOCKS.some((b) => x > b.x - R && x < b.x + b.w + R && y > b.y - R && y < b.y + b.d + R);
}

const GRID = (() => {
  const g = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) g[j * GW + i] = blockedAt((i + 0.5) * CS, (j + 0.5) * CS) ? 1 : 0;
  return g;
})();

const cellOf = (x, y) => [clamp(Math.floor(x / CS), 0, GW - 1), clamp(Math.floor(y / CS), 0, GH - 1)];
const center = (i, j) => ({ x: (i + 0.5) * CS, y: (j + 0.5) * CS });

function clearLine(a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1);
  for (let k = 1; k <= n; k++) if (blockedAt(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n)) return false;
  return true;
}

// A* trên lưới 0,5 ô, đi được 8 hướng, không cắt góc. allowBlockedGoal: cho phép đích nằm trong đồ (ví dụ ghế).
function findPath(from, to, allowBlockedGoal) {
  let [gi, gj] = cellOf(to.x, to.y);
  let goal = { x: to.x, y: to.y };
  if (!allowBlockedGoal && (GRID[gj * GW + gi] || blockedAt(to.x, to.y))) {
    let best = Infinity;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      if (GRID[j * GW + i]) continue;
      const p = center(i, j);
      const d = Math.hypot(p.x - to.x, p.y - to.y);
      if (d < best) { best = d; gi = i; gj = j; goal = p; }
    }
  }
  const [si, sj] = cellOf(from.x, from.y);
  const start = sj * GW + si;
  const target = gj * GW + gi;
  const g = new Float32Array(GW * GH).fill(Infinity);
  const prev = new Int32Array(GW * GH).fill(-1);
  const closed = new Uint8Array(GW * GH);
  const open = [start];
  g[start] = 0;
  const h = (k) => Math.hypot((k % GW) - gi, Math.floor(k / GW) - gj);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === target) break;
    closed[cur] = 1;
    const ci = cur % GW;
    const cj = Math.floor(cur / GW);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const nk = nj * GW + ni;
      if (closed[nk] || (GRID[nk] && nk !== target)) continue;
      if (di && dj && (GRID[cj * GW + ni] || GRID[nj * GW + ci])) continue; // không cắt góc
      const ng = g[cur] + (di && dj ? Math.SQRT2 : 1);
      if (ng < g[nk]) {
        g[nk] = ng;
        prev[nk] = cur;
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  if (target !== start && prev[target] < 0) return null; // không tới được
  const cells = [];
  for (let k = target; k !== start && k >= 0; k = prev[k]) cells.unshift(center(k % GW, Math.floor(k / GW)));
  if (cells.length) cells[cells.length - 1] = goal;
  else cells.push(goal);
  // Làm mượt: bỏ các điểm trung gian nếu đi thẳng được
  const out = [];
  let cur = from;
  for (let i = 0; i < cells.length; ) {
    let j = cells.length - 1;
    while (j > i && !clearLine(cur, cells[j])) j--;
    out.push(cells[j]);
    cur = cells[j];
    i = j + 1;
  }
  return out;
}

// Đường bao (convex hull) của một khối trên màn hình, dùng để bấm trúng đồ vật
function hullOf(x, y, w, d, h) {
  const pts = [];
  for (const z of [0, h]) for (const [px, py] of [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]) pts.push(iso(px, py, z));
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Bấm vào đồ vật nào thì đi tới chỗ tương ứng
const HITS = [
  { hull: hullOf(1, 0, 2.2, 1.9, 80), spot: DESK }, // bàn + ghế + đèn
  { hull: hullOf(7.1, 5.75, 2.3, 1.75, 50), spot: MUSIC }, // ghế bãi biển, bàn dừa, radio
  { hull: hullOf(7.2, 2.0, 2.4, 1.1, 34), spot: MOVIE }, // sofa
  { hull: hullOf(7.45, 0, 2.05, 0.45, TV.zTop + 4), spot: MOVIE }, // TV + kệ
];
const inRect = (x, y, z) => x >= z.x && y >= z.y && x <= z.x + z.w && y <= z.y + z.d;

// ---------- Màn phòng ----------
export function renderClassroom(root, onSit) {
  root.innerHTML = `
    <div class="room-wrap">
      <div class="scene" id="scene">
        <canvas aria-label="Phòng của bạn. Bấm vào sàn để đi lại. Có bàn học, góc âm nhạc và góc xem phim."></canvas>
        <div class="room-intro" id="intro">👋 Bấm vào sàn để đi lại. Ghé bàn học, góc âm nhạc hoặc sofa xem phim nhé!</div>
        <button class="act-btn" id="act" hidden></button>
        <div class="room-toast hide" id="toast"></div>
        <div class="scene-fade"></div>
      </div>
      <div class="music-panel card" id="music" hidden></div>
      <p class="room-hint">Di chuyển: bấm vào sàn, hoặc phím mũi tên / WASD. Lại gần đồ vật rồi bấm nút hiện ra (hoặc phím E).
        Bàn học mở menu. <button class="link" id="skip">Bỏ qua</button></p>
    </div>`;

  const scene = root.querySelector('#scene');
  const canvas = scene.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const actBtn = scene.querySelector('#act');
  const toastEl = scene.querySelector('#toast');
  const introEl = scene.querySelector('#intro');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const level = levelInfo().level;

  // pose: 'stand' | 'desk' (ngồi học) | 'bench' (nghe nhạc) | 'sofa' (xem phim)
  const hero = { x: 5.2, y: 4.3, fx: 1, fy: 1, moving: false, phase: 0, pose: 'stand' };
  const S = { t: 0, lampOn: false, music: false, playing: false, tv: false, tvT0: 0 };
  const cam = { zoom: 1, fx: 0, fy: 0, ready: false };
  const keys = new Set();
  const timers = [];
  let path = null;
  let pending = null;
  let marker = null;
  let shownSpot = undefined;
  let lounge = null; // chỗ đang ngồi / nằm (MUSIC hoặc MOVIE)
  let seated = false; // đã ngồi vào bàn học, đang chuyển sang menu
  let zoomAnim = null;
  let vw = 0;
  let vh = 0;
  let base = 1;
  let dpr = 1;
  let raf = 0;
  let last = performance.now();
  let toastTimer = 0;
  let musicPanel = null;
  const musicEl = root.querySelector('#music');

  const at = (ms, fn) => timers.push(setTimeout(fn, ms));

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = scene.clientWidth;
    const narrow = vw < 600;
    vh = Math.round(Math.min(vw * (narrow ? 1.1 : 0.66), Math.max(300, window.innerHeight - 190)));
    canvas.style.height = vh + 'px';
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    const fit = Math.min(vw / (VIEW.maxX - VIEW.minX), vh / (VIEW.maxY - VIEW.minY));
    base = narrow ? fit * 1.5 : fit;
  }

  const scale = () => base * cam.zoom;
  const toScreen = (wx, wy) => [(wx - cam.fx) * scale() + vw / 2, (wy - cam.fy) * scale() + vh / 2];
  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return [(clientX - r.left - vw / 2) / scale() + cam.fx, (clientY - r.top - vh / 2) / scale() + cam.fy];
  }

  function hideIntro() {
    introEl.classList.add('hide');
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hide');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hide'), 2400);
  }

  function walkTo(x, y, spot) {
    const p = findPath(hero, { x, y }, spot === DESK);
    pending = spot || null;
    path = p && p.length ? p : null;
    if (!path && pending) doAction(pending);
  }

  function doAction(spot) {
    if (spot.action === 'sit') sit();
    else if (spot.action === 'lounge') enterLounge(spot);
  }

  function act(spot) {
    if (seated || !spot) return;
    if (spot.action === 'stand') return standUp();
    if (lounge) standUp();
    if (spot.action === 'sit') walkTo(spot.x, spot.y, spot);
    else walkTo(spot.exit.x, spot.exit.y, spot); // tới trước ghế rồi mới ngồi / nằm
  }

  function nearSpot() {
    if (seated) return null;
    if (lounge) return STAND;
    for (const s of SPOTS) {
      if (s.zone ? inRect(hero.x, hero.y, s.zone) : Math.hypot(hero.x - s.x, hero.y - s.y) < s.near) return s;
    }
    return null;
  }

  function enterLounge(spot) {
    lounge = spot;
    path = null;
    pending = null;
    Object.assign(hero, { x: spot.seat.x, y: spot.seat.y, fx: spot.seat.fx, fy: spot.seat.fy, pose: spot.pose, moving: false });
    if (spot === MUSIC) {
      S.music = true;
      S.playing = false;
      musicPanel = createMusicPanel(musicEl, { onPlaying: (v) => (S.playing = v) });
      musicEl.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    }
    if (spot === MOVIE) {
      S.tv = true;
      S.tvT0 = S.t;
    }
    toast(spot.msg);
  }

  function standUp() {
    if (!lounge) return;
    const spot = lounge;
    lounge = null;
    closeMusic();
    S.music = false;
    S.tv = false;
    Object.assign(hero, { x: spot.exit.x, y: spot.exit.y, fx: 1, fy: 1, pose: 'stand' });
  }

  function closeMusic() {
    musicPanel?.destroy();
    musicPanel = null;
    S.playing = false;
  }

  function sit() {
    if (seated) return;
    seated = true;
    path = null;
    pending = null;
    keys.clear();
    Object.assign(hero, { x: DESK.x, y: DESK.y, fx: 0, fy: -1, pose: 'desk', moving: false });
    hideIntro();
    if (reduceMotion) return at(300, onSit);
    at(450, () => (S.lampOn = true));
    at(1000, () => {
      const [fx, fy] = iso(2.2, 0.6, 40);
      zoomAnim = { t0: performance.now(), dur: 1000, from: { z: cam.zoom, fx: cam.fx, fy: cam.fy }, to: { z: 2.4, fx, fy } };
    });
    at(1900, () => scene.classList.add('fade'));
    at(2300, onSit);
  }

  // ----- Cập nhật mỗi khung hình -----
  function update(dt) {
    S.t += dt;
    if (seated) return;
    let kx = 0;
    let ky = 0;
    if (keys.has('up')) { kx -= 1; ky -= 1; }
    if (keys.has('down')) { kx += 1; ky += 1; }
    if (keys.has('left')) { kx -= 1; ky += 1; }
    if (keys.has('right')) { kx += 1; ky -= 1; }
    if (kx || ky) {
      if (lounge) standUp();
      path = null;
      pending = null;
      const l = Math.hypot(kx, ky);
      kx /= l;
      ky /= l;
      const nx = hero.x + kx * SPEED * dt;
      const ny = hero.y + ky * SPEED * dt;
      if (!blockedAt(nx, hero.y)) hero.x = nx;
      if (!blockedAt(hero.x, ny)) hero.y = ny;
      hero.fx = kx;
      hero.fy = ky;
      hero.moving = true;
    } else if (path) {
      const p = path[0];
      const dx = p.x - hero.x;
      const dy = p.y - hero.y;
      const d = Math.hypot(dx, dy);
      const stepLen = SPEED * dt;
      if (d > 0.001) { hero.fx = dx / d; hero.fy = dy / d; }
      if (d <= stepLen) {
        hero.x = p.x;
        hero.y = p.y;
        path.shift();
        if (!path.length) {
          path = null;
          if (pending) {
            const s = pending;
            pending = null;
            doAction(s);
          }
        }
      } else {
        hero.x += (dx / d) * stepLen;
        hero.y += (dy / d) * stepLen;
      }
      hero.moving = true;
    } else hero.moving = false;
    if (hero.moving) hero.phase += dt * 13;
  }

  function updateCamera(dt, now) {
    if (zoomAnim) {
      const k = clamp((now - zoomAnim.t0) / zoomAnim.dur, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      cam.zoom = zoomAnim.from.z + (zoomAnim.to.z - zoomAnim.from.z) * e;
      cam.fx = zoomAnim.from.fx + (zoomAnim.to.fx - zoomAnim.from.fx) * e;
      cam.fy = zoomAnim.from.fy + (zoomAnim.to.fy - zoomAnim.from.fy) * e;
      return;
    }
    const s = scale();
    const halfW = vw / (2 * s);
    const halfH = vh / (2 * s);
    const [px, py] = iso(hero.x, hero.y, 35);
    const axis = (p, lo, hi, half) => (hi - lo <= 2 * half ? (lo + hi) / 2 : clamp(p, lo + half, hi - half));
    const tx = axis(px, VIEW.minX, VIEW.maxX, halfW);
    const ty = axis(py, VIEW.minY, VIEW.maxY, halfH);
    if (!cam.ready) {
      cam.fx = tx;
      cam.fy = ty;
      cam.ready = true;
    } else {
      const k = Math.min(1, dt * 5);
      cam.fx += (tx - cam.fx) * k;
      cam.fy += (ty - cam.fy) * k;
    }
  }

  function updateActButton() {
    const spot = nearSpot();
    if (spot !== shownSpot) {
      shownSpot = spot;
      actBtn.hidden = !spot;
      if (spot) {
        actBtn.textContent = spot.label;
        actBtn.classList.toggle('stand', spot === STAND);
      }
    }
    if (spot) {
      const [sx, sy] = toScreen(...iso(...(spot === STAND ? lounge.standBtn : spot.btn)));
      actBtn.style.left = sx + 'px';
      actBtn.style.top = sy + 'px';
    }
  }

  function render() {
    const s = scale();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#efe4d6';
    ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (vw / 2 - cam.fx * s), dpr * (vh / 2 - cam.fy * s));

    drawRoom(ctx, S);
    drawFloorDecor(ctx);

    if (marker) {
      const k = (S.t - marker.t0) / 0.7;
      if (k >= 1) marker = null;
      else {
        const [mx, my] = iso(marker.x, marker.y);
        ctx.globalAlpha = 1 - k;
        ell(ctx, mx, my, 6 + k * 12, 3 + k * 6, null);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    const items = OBJECTS.slice();
    items.push({ ...heroBox(hero), draw: (c) => drawHero(c, hero, S, level) });
    items.sort(depthOrder).forEach((it) => it.draw(ctx, S));

    const dim = (alpha) => {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(20,16,56,${alpha})`;
      ctx.fillRect(0, 0, vw, vh);
      ctx.restore();
    };
    const glow = (x, y, r, rgb, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.globalCompositeOperation = 'lighter';
      ell(ctx, x, y, r, r, g);
      ctx.globalCompositeOperation = 'source-over';
    };

    if (S.lampOn) {
      dim(0.3);
      const [gx, gy] = iso(2.2, 0.6, 40);
      glow(gx, gy, 95, '255,220,120', 0.55);
    }

    if (S.tv) {
      // Tắt bớt đèn phòng, ánh sáng TV đổi màu theo cảnh phim
      dim(0.38);
      const hex = SHOW_GLOW[Math.floor((S.t - S.tvT0) / 5) % 3];
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
      const flick = 0.42 + Math.sin(S.t * 9) * 0.04;
      const [tx, ty] = iso(TV.x + 1, 0, TV.zTop - 20);
      glow(tx, ty + 20, 120, rgb, flick);
      glow(...iso(8.3, LIE_Y, 36), 75, rgb, flick * 0.6);
      drawTV(ctx, S); // vẽ lại màn hình cho sáng rõ
    }

    if (musicOn(S)) drawNotes(ctx, S);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    updateCamera(dt, now);
    render();
    updateActButton();
    raf = requestAnimationFrame(frame);
  }

  // ----- Điều khiển -----
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };

  function onKeyDown(e) {
    if (seated || e.target.closest?.('input, textarea, select')) return;
    const k = KEYMAP[e.code];
    if (k) {
      e.preventDefault();
      keys.add(k);
      hideIntro();
      return;
    }
    if (e.code === 'KeyE' || e.key === 'Enter' || e.key === ' ') {
      if (e.target !== document.body && e.target !== canvas) return; // đang focus nút khác thì để nút đó xử lý
      e.preventDefault();
      hideIntro();
      const spot = nearSpot();
      if (spot) act(spot);
      else if (e.key === 'Enter') act(DESK); // Enter ở xa: tự đi tới bàn học
    }
  }

  function onKeyUp(e) {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  }

  function onCanvasClick(e) {
    if (seated) return;
    hideIntro();
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    const hit = HITS.find((h) => inPoly(wx, wy, h.hull));
    if (hit) {
      if (hit.spot !== lounge) act(hit.spot); // bấm lại đúng chỗ đang ngồi thì không làm gì
      return;
    }
    const gx = (wx / HW + wy / HH) / 2;
    const gy = (wy / HH - wx / HW) / 2;
    if (gx < 0 || gy < 0 || gx > W || gy > H) return;
    if (lounge) standUp();
    marker = { x: gx, y: gy, t0: S.t };
    walkTo(gx, gy, null);
  }

  const onBlur = () => keys.clear();
  const onActClick = () => act(shownSpot);
  const onSkip = () => {
    seated = true;
    onSit();
  };

  canvas.addEventListener('click', onCanvasClick);
  actBtn.addEventListener('click', onActClick);
  root.querySelector('#skip').addEventListener('click', onSkip);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  const ro = new ResizeObserver(layout);
  ro.observe(scene);

  // Dùng cho kiểm thử tự động: đổi toạ độ ô sang toạ độ màn hình, đọc trạng thái nhân vật.
  scene._room = { hero, S, cam, toScreen: (x, y, z = 0) => toScreen(...iso(x, y, z)) };

  layout();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    closeMusic();
    timers.forEach(clearTimeout);
    clearTimeout(toastTimer);
    ro.disconnect();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
