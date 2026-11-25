// Phòng riêng nhìn chéo từ trên cao (isometric 2.5D), vẽ bằng canvas, không cần thư viện.
// Nhân vật đi lại bằng cách bấm vào sàn hoặc dùng phím mũi tên / WASD.
// Đến gần bàn học và bấm "Ngồi học": nhân vật ngồi xuống, bật đèn, camera phóng vào bàn rồi mở menu.
// Góc xem phim và góc nghe nhạc hiện mới để sẵn chỗ, chưa có chức năng.
// Trả về cleanup() để dọn vòng lặp vẽ, timer và phím tắt.
import { levelInfo } from './store.js';

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

// ---------- Đồ đạc ----------
// Ô bị chặn (nhân vật không đi xuyên qua)
const BLOCKS = [
  { x: 1, y: 0, w: 2.2, d: 1 }, // bàn học
  { x: 1.75, y: 1.2, w: 0.7, d: 0.7 }, // ghế
  { x: 0, y: 2.2, w: 0.6, d: 1.8 }, // kệ sách
  { x: 0, y: 5.9, w: 1.8, d: 3.1 }, // giường
  { x: 0.1, y: 0.1, w: 0.7, d: 0.7 }, // chậu cây
];

// Những chỗ tương tác được
const SPOTS = [
  { id: 'desk', label: '🪑 Ngồi học', x: 2.1, y: 1.5, near: 1.3, btn: [2.1, 0.5, 92], action: 'sit' },
  {
    id: 'movie', label: '🎬 Góc xem phim', soon: true, zone: { x: 6.2, y: 5.4, w: 3.6, d: 3.4 },
    btn: [8, 7.1, 60], color: '#5b5bf0', icon: '🎬', title: 'Góc xem phim',
    msg: '🎬 Góc xem phim đang được xây. Sắp có!',
  },
  {
    id: 'music', label: '🎵 Góc nghe nhạc', soon: true, zone: { x: 7, y: 0.2, w: 2.8, d: 2.8 },
    btn: [8.4, 1.6, 60], color: '#1fa971', icon: '🎵', title: 'Góc nghe nhạc',
    msg: '🎵 Góc nghe nhạc đang được xây. Sắp có!',
  },
];
const DESK = SPOTS[0];

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

// Vẽ trên mặt phẳng y = y0 (tường phải). Gốc ở đầu bên trái màn hình (x nhỏ).
function wallR(c, xLeft, y0, zTop, fn) {
  const [sx, sy] = iso(xLeft, y0, zTop);
  c.save();
  c.translate(sx, sy);
  c.transform(1, 0.5, 0, 1, 0, 0);
  fn();
  c.restore();
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
}

function drawFloorDecor(c, S) {
  // Thảm
  poly(c, [iso(3.6, 2.8), iso(6.6, 2.8), iso(6.6, 5.6), iso(3.6, 5.6)], '#f6c6d0');
  poly(c, [iso(3.85, 3.05), iso(6.35, 3.05), iso(6.35, 5.35), iso(3.85, 5.35)], null, '#fff', 2);
  const [cx, cy] = iso(5.1, 4.2);
  ell(c, cx, cy, 30, 15, '#fbdbe2');

  // Các góc để sẵn (chưa có chức năng)
  for (const s of SPOTS) {
    if (!s.zone) continue;
    const z = s.zone;
    const pts = [iso(z.x, z.y), iso(z.x + z.w, z.y), iso(z.x + z.w, z.y + z.d), iso(z.x, z.y + z.d)];
    c.globalAlpha = 0.09;
    poly(c, pts, s.color);
    c.globalAlpha = 1;
    c.setLineDash([7, 6]);
    c.lineDashOffset = -S.t * 8;
    poly(c, pts, null, s.color, 2);
    c.setLineDash([]);
    const [lx, ly] = iso(z.x + z.w / 2, z.y + z.d / 2);
    c.textAlign = 'center';
    c.font = '24px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    c.fillText(s.icon, lx, ly - 10 + Math.sin(S.t * 2 + lx) * 2);
    c.font = 'bold 10px system-ui, sans-serif';
    const text = `${s.title} · Sắp có`;
    const tw = c.measureText(text).width + 14;
    rr(c, lx - tw / 2, ly + 2, tw, 17, 8.5, 'rgba(255,255,255,.92)');
    c.fillStyle = s.color;
    c.fillText(text, lx, ly + 14);
  }
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

// ---------- Nhân vật chibi ----------
function drawHero(c, hero, S, level) {
  const [sx, sy] = iso(hero.x, hero.y);
  const dx = hero.fx - hero.fy; // hướng nhìn trên màn hình
  const dy = hero.fx + hero.fy;
  const front = dy > 0.01 || (Math.abs(dy) <= 0.01 && dx >= 0);
  const flip = dx < -0.01;
  const lift = hero.sitting ? 20 : 0;
  const bob = hero.moving ? -Math.abs(Math.sin(hero.phase)) * 2.5 : Math.sin(S.t * 2.2) * 0.8;
  const step = hero.moving ? Math.sin(hero.phase) : 0;

  c.save();
  c.translate(sx, sy);
  ell(c, 0, 0, 13, 5, 'rgba(60,30,0,.18)');
  if (flip) c.scale(-1, 1);
  c.translate(0, bob - lift);

  // Chân
  if (hero.sitting) {
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
  } else if (!hero.sitting) {
    rr(c, -8, -30, 16, 16, 5, COL.bag);
    rr(c, -5, -21, 10, 5, 2, shade(COL.bag, -0.15));
  }

  // Tay
  const armCol = shade(COL.shirt, -0.12);
  if (hero.sitting) {
    rr(c, -15, -32, 6, 9, 3, armCol);
    rr(c, 9, -32, 6, 9, 3, armCol);
  } else {
    const a = step * 3;
    rr(c, -15, -29 + a, 6, 12, 3, armCol);
    rr(c, 9, -29 - a, 6, 12, 3, armCol);
    ell(c, -12, -16 + a, 3, 3, COL.skin);
    ell(c, 12, -16 - a, 3, 3, COL.skin);
  }

  // Đầu
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
    const o = 1.8; // nghiêng mặt 3/4 về hướng đang nhìn
    const blink = S.t % 4.2 < 0.13;
    if (blink) {
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
    ell(c, -10 + o, -37, 3, 1.8, 'rgba(255,120,120,.45)');
    ell(c, 10 + o, -37, 3, 1.8, 'rgba(255,120,120,.45)');
    c.strokeStyle = '#1f2340';
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(o, -38.5, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  } else {
    ell(c, 0, -47, 18, 16.5, COL.hair);
    ell(c, 0, -34, 9, 4, COL.hair);
  }
  c.restore();

  // Bảng tên trên đầu
  const ty = sy + bob - lift - 72;
  const text = `Cấp ${level}`;
  c.font = 'bold 10px system-ui, sans-serif';
  c.textAlign = 'center';
  const tw = c.measureText(text).width + 14;
  rr(c, sx - tw / 2, ty - 11, tw, 15, 7.5, 'rgba(31,35,64,.78)');
  c.fillStyle = '#fff';
  c.fillText(text, sx, ty);
}

// Vật nào nằm sau (vẽ trước). a, b có dạng {x, y, w, d, bias}
function depthOrder(a, b) {
  const e = 1e-6;
  if (a.x + a.w <= b.x + e || a.y + a.d <= b.y + e) return -1;
  if (b.x + b.w <= a.x + e || b.y + b.d <= a.y + e) return 1;
  return a.x + a.w / 2 + a.y + a.d / 2 + (a.bias || 0) - (b.x + b.w / 2 + b.y + b.d / 2 + (b.bias || 0));
}

const OBJECTS = [
  { x: 1, y: 0, w: 2.2, d: 1, draw: drawDesk },
  { x: 1.75, y: 1.2, w: 0.7, d: 0.62, bias: -1, draw: drawChairSeat },
  { x: 1.75, y: 1.82, w: 0.7, d: 0.08, draw: drawChairBack },
  { x: 0, y: 2.2, w: 0.6, d: 1.8, draw: drawShelf },
  { x: 0, y: 5.9, w: 1.8, d: 3.1, draw: drawBed },
  { x: 0.1, y: 0.1, w: 0.7, d: 0.7, draw: drawPlant },
];

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

const DESK_HULL = hullOf(1, 0, 2.2, 1.9, 80); // bàn + ghế + đèn
const inRect = (x, y, z) => x >= z.x && y >= z.y && x <= z.x + z.w && y <= z.y + z.d;

// ---------- Màn phòng ----------
export function renderClassroom(root, onSit) {
  root.innerHTML = `
    <div class="room-wrap">
      <div class="scene" id="scene">
        <canvas aria-label="Phòng học của bạn. Bấm vào sàn để đi lại, đến bàn học để mở menu."></canvas>
        <div class="room-intro" id="intro">👋 Bấm vào sàn để đi lại, rồi đến bàn học để bắt đầu</div>
        <button class="act-btn" id="act" hidden></button>
        <div class="room-toast hide" id="toast"></div>
        <div class="scene-fade"></div>
      </div>
      <p class="room-hint">Di chuyển: bấm vào sàn, hoặc phím mũi tên / WASD. Lại gần bàn học rồi bấm <b>🪑 Ngồi học</b> (hoặc phím E / Enter).
        <button class="link" id="skip">Bỏ qua</button></p>
    </div>`;

  const scene = root.querySelector('#scene');
  const canvas = scene.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const actBtn = scene.querySelector('#act');
  const toastEl = scene.querySelector('#toast');
  const introEl = scene.querySelector('#intro');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const level = levelInfo().level;

  const hero = { x: 5.2, y: 4.3, fx: 1, fy: 1, moving: false, phase: 0, sitting: false };
  const S = { t: 0, lampOn: false };
  const cam = { zoom: 1, fx: 0, fy: 0, ready: false };
  const keys = new Set();
  const timers = [];
  let path = null;
  let pending = null;
  let marker = null;
  let shownSpot = undefined;
  let seated = false;
  let zoomAnim = null;
  let vw = 0;
  let vh = 0;
  let base = 1;
  let dpr = 1;
  let raf = 0;
  let last = performance.now();
  let toastTimer = 0;

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
    toastTimer = setTimeout(() => toastEl.classList.add('hide'), 2000);
  }

  function walkTo(x, y, spot) {
    const p = findPath(hero, { x, y }, !!spot);
    pending = spot || null;
    path = p && p.length ? p : null;
    if (!path && pending) doAction(pending);
  }

  function doAction(spot) {
    if (spot.action === 'sit') sit();
    else toast(spot.msg);
  }

  function act(spot) {
    if (seated || !spot) return;
    if (spot.action === 'sit') walkTo(spot.x, spot.y, spot);
    else toast(spot.msg);
  }

  function nearSpot() {
    if (seated) return null;
    for (const s of SPOTS) {
      if (s.zone ? inRect(hero.x, hero.y, s.zone) : Math.hypot(hero.x - s.x, hero.y - s.y) < s.near) return s;
    }
    return null;
  }

  function sit() {
    if (seated) return;
    seated = true;
    path = null;
    pending = null;
    keys.clear();
    Object.assign(hero, { x: DESK.x, y: DESK.y, fx: 0, fy: -1, sitting: true, moving: false });
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
        actBtn.classList.toggle('soon', !!spot.soon);
      }
    }
    if (spot) {
      const [sx, sy] = toScreen(...iso(...spot.btn));
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
    drawFloorDecor(ctx, S);

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
    items.push({ x: hero.x - 0.2, y: hero.y - 0.2, w: 0.4, d: 0.4, draw: (c) => drawHero(c, hero, S, level) });
    items.sort(depthOrder).forEach((it) => it.draw(ctx, S));

    if (S.lampOn) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(27,20,64,.3)';
      ctx.fillRect(0, 0, vw, vh);
      ctx.restore();
      const [gx, gy] = iso(2.2, 0.6, 40);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 95);
      g.addColorStop(0, 'rgba(255,220,120,.55)');
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.globalCompositeOperation = 'lighter';
      ell(ctx, gx, gy, 95, 95, g);
      ctx.globalCompositeOperation = 'source-over';
    }
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
    if (inPoly(wx, wy, DESK_HULL)) return walkTo(DESK.x, DESK.y, DESK);
    const gx = (wx / HW + wy / HH) / 2;
    const gy = (wy / HH - wx / HW) / 2;
    if (gx < 0 || gy < 0 || gx > W || gy > H) return;
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

  // Dùng cho kiểm thử tự động: đổi toạ độ ô sang toạ độ màn hình và đọc vị trí nhân vật.
  scene._room = { hero, toScreen: (x, y, z = 0) => toScreen(...iso(x, y, z)) };

  layout();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    clearTimeout(toastTimer);
    ro.disconnect();
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
