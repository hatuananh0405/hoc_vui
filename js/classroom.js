// Màn mở đầu: phòng học nhỏ có hoạt ảnh. Bấm vào bàn (hoặc nhấn Enter) thì bạn nhỏ
// đi tới, ngồi xuống, bật đèn, camera phóng vào bàn rồi mở menu.
// Trả về cleanup() để dọn timer và phím tắt.

const SVG = `
<svg class="room" viewBox="0 0 800 500" aria-hidden="true">
  <defs>
    <linearGradient id="r-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdf3e1"/><stop offset="1" stop-color="#f3dcb8"/>
    </linearGradient>
    <linearGradient id="r-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#dff4ff"/>
    </linearGradient>
    <radialGradient id="r-glow" cx="0.55" cy="0" r="1">
      <stop offset="0" stop-color="#fff3a8" stop-opacity=".95"/>
      <stop offset="1" stop-color="#fff3a8" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="r-win"><rect x="540" y="70" width="180" height="150"/></clipPath>
  </defs>

  <!-- Tường và sàn -->
  <rect width="800" height="500" fill="url(#r-wall)"/>
  <rect y="400" width="800" height="100" fill="#c98f5a"/>
  <g stroke="#b57b48" stroke-width="2">
    <line x1="0" y1="430" x2="800" y2="430"/><line x1="0" y1="462" x2="800" y2="462"/>
    <line x1="130" y1="400" x2="130" y2="430"/><line x1="420" y1="400" x2="420" y2="430"/><line x1="690" y1="400" x2="690" y2="430"/>
    <line x1="260" y1="430" x2="260" y2="462"/><line x1="580" y1="430" x2="580" y2="462"/>
    <line x1="80" y1="462" x2="80" y2="500"/><line x1="380" y1="462" x2="380" y2="500"/><line x1="660" y1="462" x2="660" y2="500"/>
  </g>
  <rect y="394" width="800" height="8" fill="#a86f3e"/>

  <!-- Cửa sổ: mây trôi, mặt trời -->
  <rect x="532" y="62" width="196" height="166" rx="8" fill="#fff" stroke="#d7b98f" stroke-width="4"/>
  <g clip-path="url(#r-win)">
    <rect x="540" y="70" width="180" height="150" fill="url(#r-sky)"/>
    <circle class="sun" cx="688" cy="104" r="18" fill="#ffd65a"/>
    <g class="cloud c1" fill="#fff">
      <circle cx="500" cy="120" r="14"/><circle cx="518" cy="112" r="18"/><circle cx="538" cy="122" r="13"/>
      <rect x="490" y="120" width="56" height="14" rx="7"/>
    </g>
    <g class="cloud c2" fill="#fff" opacity=".85">
      <circle cx="490" cy="178" r="10"/><circle cx="504" cy="172" r="13"/><circle cx="519" cy="180" r="9"/>
    </g>
    <path d="M540 220 q40 -30 90 -10 t90 -5 v15 z" fill="#8ccf7e"/>
  </g>
  <rect x="628" y="70" width="4" height="150" fill="#d7b98f"/>
  <rect x="540" y="143" width="180" height="4" fill="#d7b98f"/>
  <rect x="524" y="226" width="212" height="10" rx="3" fill="#d7b98f"/>

  <!-- Bảng đen -->
  <rect x="70" y="50" width="360" height="190" rx="6" fill="#8b5a2b"/>
  <rect x="80" y="60" width="340" height="170" rx="3" fill="#2f5d50"/>
  <text class="chalk big" x="250" y="132" text-anchor="middle">HọcVui</text>
  <text class="chalk small" x="250" y="176" text-anchor="middle">Vừa chơi vừa học</text>
  <text class="chalk tiny" x="104" y="215">1 + 1 = 2</text>
  <text class="chalk tiny" x="330" y="215">A B C</text>
  <rect x="90" y="238" width="320" height="7" rx="2" fill="#7a4d24"/>
  <rect x="120" y="233" width="16" height="5" rx="2" fill="#fff"/>
  <rect x="146" y="233" width="12" height="5" rx="2" fill="#ffd65a"/>

  <!-- Đồng hồ -->
  <circle cx="480" cy="110" r="30" fill="#fff" stroke="#5b5bf0" stroke-width="5"/>
  <g stroke="#9aa0c8" stroke-width="2">
    <line x1="480" y1="85" x2="480" y2="90"/><line x1="480" y1="130" x2="480" y2="135"/>
    <line x1="455" y1="110" x2="460" y2="110"/><line x1="500" y1="110" x2="505" y2="110"/>
  </g>
  <rect class="hand hour" x="478" y="96" width="4" height="14" rx="2" fill="#1f2340"/>
  <rect class="hand min" x="479" y="88" width="2.5" height="22" rx="1" fill="#1f2340"/>
  <rect class="hand sec" x="479.5" y="86" width="1" height="24" fill="#e5484d"/>
  <circle cx="480" cy="110" r="3" fill="#1f2340"/>

  <!-- Chậu cây -->
  <g class="plant">
    <ellipse cx="748" cy="372" rx="9" ry="26" fill="#3fa266" transform="rotate(-25 748 398)"/>
    <ellipse cx="772" cy="372" rx="9" ry="26" fill="#3fa266" transform="rotate(25 772 398)"/>
    <ellipse cx="760" cy="364" rx="9" ry="32" fill="#4cb877"/>
  </g>
  <path d="M740 440 h40 l-5 -42 h-30 z" fill="#e07a4f"/>
  <rect x="738" y="396" width="44" height="8" rx="3" fill="#c9653c"/>

  <!-- Ghế -->
  <g class="hit chair">
    <rect x="186" y="300" width="9" height="140" rx="3" fill="#8c5a33"/>
    <rect x="182" y="306" width="16" height="54" rx="5" fill="#d9824b"/>
    <rect x="240" y="390" width="7" height="50" rx="2" fill="#8c5a33"/>
    <rect x="184" y="382" width="66" height="10" rx="4" fill="#d9824b"/>
  </g>

  <!-- Bạn nhỏ (gốc toạ độ ở chân) -->
  <g transform="translate(0 440)">
    <g id="stu" class="hit">
      <rect class="hitbox" x="-34" y="-166" width="80" height="166" fill="transparent"/>
      <g class="stu-bob">
        <g class="legs-stand">
          <g class="leg leg-b"><rect x="-10" y="-58" width="10" height="58" rx="3" fill="#2a3459"/><rect x="-10" y="-7" width="16" height="7" rx="3" fill="#1f2340"/></g>
          <g class="leg leg-f"><rect x="0" y="-58" width="10" height="58" rx="3" fill="#34406b"/><rect x="0" y="-7" width="16" height="7" rx="3" fill="#1f2340"/></g>
        </g>
        <g class="legs-sit">
          <rect x="-12" y="-70" width="46" height="13" rx="5" fill="#34406b"/>
          <rect x="24" y="-62" width="11" height="62" rx="3" fill="#34406b"/>
          <rect x="24" y="-7" width="18" height="7" rx="3" fill="#1f2340"/>
        </g>
        <rect class="backpack" x="-31" y="-112" width="15" height="44" rx="5" fill="#f5a524"/>
        <rect x="-18" y="-116" width="36" height="60" rx="11" fill="#5b5bf0"/>
        <path d="M-6 -116 l6 9 l6 -9 z" fill="#fff"/>
        <rect x="-5" y="-124" width="10" height="10" fill="#f2c39d"/>
        <g class="head">
          <circle cx="0" cy="-142" r="21" fill="#ffd7b5"/>
          <path d="M-22 -140 a22 22 0 0 1 44 -6 q-16 -6 -28 -2 q-6 8 -16 8 z" fill="#3b2a20"/>
          <circle cx="-6" cy="-140" r="4" fill="#f2c39d"/>
          <ellipse class="eye" cx="10" cy="-142" rx="2.6" ry="3.2" fill="#1f2340"/>
          <circle cx="13" cy="-133" r="3.5" fill="#ff9e95" opacity=".6"/>
          <path d="M6 -131 q5 4 10 0" stroke="#1f2340" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        </g>
        <g class="arm"><rect x="-5" y="-110" width="11" height="48" rx="5" fill="#4a4ad8"/><circle cx="0.5" cy="-61" r="6" fill="#ffd7b5"/></g>
      </g>
    </g>
  </g>

  <!-- Bàn học -->
  <g class="hit desk">
    <rect class="hitbox" x="256" y="240" width="300" height="200" fill="transparent"/>
    <rect x="272" y="364" width="12" height="76" rx="3" fill="#8a5229"/>
    <rect x="526" y="364" width="12" height="76" rx="3" fill="#8a5229"/>
    <rect x="266" y="334" width="278" height="32" rx="3" fill="#9c5f31"/>
    <rect x="380" y="344" width="50" height="12" rx="3" fill="#b5733f"/>
    <rect x="398" y="348" width="14" height="4" rx="2" fill="#6e3f1d"/>
    <rect x="262" y="322" width="286" height="14" rx="4" fill="#b5733f"/>
    <!-- Sách xếp chồng -->
    <rect x="290" y="310" width="54" height="12" rx="2" fill="#e5484d"/>
    <rect x="294" y="299" width="48" height="11" rx="2" fill="#1fa971"/>
    <rect x="288" y="288" width="52" height="11" rx="2" fill="#5b5bf0"/>
    <!-- Vở mở -->
    <path class="notebook" d="M362 322 l4 -10 h30 l2 4 l2 -4 h30 l4 10 z" fill="#fff" stroke="#d6d9ee"/>
    <line x1="400" y1="314" x2="400" y2="322" stroke="#d6d9ee"/>
    <!-- Ống bút -->
    <rect x="446" y="302" width="18" height="20" rx="3" fill="#f5a524"/>
    <line x1="450" y1="302" x2="447" y2="286" stroke="#e5484d" stroke-width="3" stroke-linecap="round"/>
    <line x1="456" y1="302" x2="457" y2="283" stroke="#5b5bf0" stroke-width="3" stroke-linecap="round"/>
    <line x1="461" y1="302" x2="466" y2="288" stroke="#1fa971" stroke-width="3" stroke-linecap="round"/>
    <!-- Đèn bàn -->
    <ellipse cx="512" cy="320" rx="18" ry="4" fill="#3d4270"/>
    <polyline points="512,318 496,276 522,256" fill="none" stroke="#3d4270" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M510 250 l26 -6 l10 22 l-30 6 z" fill="#5b5bf0"/>
    <circle class="bulb" cx="532" cy="268" r="5" fill="#d9dbea"/>
  </g>

  <!-- Bóng tối khi bật đèn, rồi vùng sáng của đèn -->
  <rect class="dim" width="800" height="500" fill="#1b1440"/>
  <polygon class="lamp-light" points="520,266 546,262 560,322 360,322" fill="url(#r-glow)"/>

  <!-- Bong bóng gợi ý -->
  <g class="hit bubble">
    <rect x="296" y="248" width="208" height="30" rx="15" fill="#fff" stroke="#5b5bf0" stroke-width="2"/>
    <path d="M392 277 l8 9 l8 -9 z" fill="#fff" stroke="#5b5bf0" stroke-width="2" stroke-linejoin="round"/>
    <rect x="393" y="274" width="14" height="4" fill="#fff"/>
    <text x="400" y="268" text-anchor="middle" font-size="14" font-weight="700" fill="#1f2340">Bấm vào bàn để ngồi học</text>
  </g>
</svg>`;

// Toạ độ vở trên bàn, dùng làm tâm phóng to camera.
const FOCUS = { x: 400, y: 318 };
const VIEW_WIDE = [0, 0, 800, 500];
const VIEW_NARROW = [50, 30, 520, 440]; // màn hình hẹp: cắt bớt hai bên cho nhân vật to hơn

export function renderClassroom(root, onSit) {
  root.innerHTML = `
    <div class="room-wrap">
      <div class="scene" id="scene" tabindex="0" role="button" aria-label="Ngồi vào bàn học để mở menu">
        ${SVG}
        <div class="scene-fade"></div>
      </div>
      <p class="room-hint">Bấm vào bàn học hoặc nhấn Enter để ngồi xuống. <button class="link" id="skip">Bỏ qua</button></p>
    </div>`;

  const scene = root.querySelector('#scene');
  const svg = scene.querySelector('svg');
  const [vx, vy, vw, vh] = window.matchMedia('(max-width: 600px)').matches ? VIEW_NARROW : VIEW_WIDE;
  svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  svg.style.transformOrigin = `${((FOCUS.x - vx) / vw) * 100}% ${((FOCUS.y - vy) / vh) * 100}%`;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  let started = false;

  function sit() {
    if (started) return;
    started = true;
    scene.classList.add('busy');
    if (reduceMotion) return onSit();
    scene.classList.add('walking'); // đi tới ghế
    at(1200, () => {
      scene.classList.remove('walking');
      scene.classList.add('seated'); // ngồi xuống, cất balo, đặt tay lên bàn
    });
    at(1650, () => scene.classList.add('lamp-on'));
    at(2250, () => scene.classList.add('zoom'));
    at(3000, () => scene.classList.add('fade'));
    at(3400, onSit);
  }

  function nudge() {
    if (started) return;
    scene.classList.remove('nudge');
    void scene.offsetWidth; // chạy lại animation
    scene.classList.add('nudge');
  }

  function onClick(e) {
    if (e.target.closest('#skip')) {
      started = true;
      return onSit();
    }
    if (!e.target.closest('#scene')) return;
    if (e.target.closest('.hit')) sit();
    else nudge();
  }

  function onKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target;
    if (t !== document.body && t !== scene) return; // đang focus nút khác thì để nút đó xử lý
    e.preventDefault();
    sit();
  }

  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  return () => {
    timers.forEach(clearTimeout);
    root.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
  };
}
