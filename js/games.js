// Các trò chơi. Mỗi hàm trả về cleanup() để dọn timer/phím tắt khi rời màn chơi.
import { esc, shuffle } from './util.js';
import { recordAnswer } from './store.js';

export const MODES = {
  classic: {
    icon: '📝',
    name: 'Trắc nghiệm',
    desc: 'Trả lời lần lượt từng câu, xem giải thích sau mỗi câu.',
    min: 1,
  },
  time: {
    icon: '⏱️',
    name: 'Đua thời gian',
    desc: 'Có 60 giây, trả lời càng nhiều câu đúng càng tốt.',
    min: 1,
  },
  survival: {
    icon: '❤️',
    name: 'Sinh tồn',
    desc: 'Có 3 mạng, sai một câu mất một mạng. Đi được bao xa?',
    min: 1,
  },
  matching: {
    icon: '🧩',
    name: 'Ghép cặp',
    desc: 'Nối câu hỏi với đáp án đúng của nó.',
    min: 4,
  },
};

const CFG = {
  classic: {},
  review: {},
  time: { duration: 60 },
  survival: { lives: 3 },
};

const points = (streak) => 100 + Math.min(streak - 1, 5) * 10; // thưởng chuỗi đúng, tối đa +50

function uniqueById(list) {
  const seen = new Set();
  return list.filter((q) => (seen.has(q.id) ? false : seen.add(q.id)));
}

export function startGame(opts) {
  return opts.mode === 'matching' ? runMatching(opts) : runQuiz(opts);
}

// ================= Trắc nghiệm / Đua thời gian / Sinh tồn =================

function prep(q) {
  return {
    id: q.id,
    q: q.q,
    explanation: q.explanation,
    opts: shuffle(q.options.map((t, i) => ({ t, ok: i === q.answer }))),
  };
}

function runQuiz({ root, bank, mode, questions, onFinish, onExit }) {
  const cfg = CFG[mode];
  let queue = shuffle(questions).map(prep);
  let i = 0;
  let score = 0;
  let streak = 0;
  let best = 0;
  let correct = 0;
  let answered = 0;
  let lives = cfg.lives;
  let locked = false;
  let finished = false;
  let deadline = 0;
  let timerId = null;
  let advanceId = null;
  const wrong = [];

  const hud = () => {
    const extra =
      mode === 'survival'
        ? `<div class="hud-item" id="lives">${'❤️'.repeat(Math.max(lives, 0))}${'🖤'.repeat(Math.max(cfg.lives - lives, 0))}</div>`
        : mode === 'time'
          ? `<div class="hud-item" id="clock">⏱️ ${cfg.duration}s</div>`
          : `<div class="hud-item">Câu ${Math.min(i + 1, queue.length)}/${queue.length}</div>`;
    return `<div class="hud">
      <button class="btn ghost small" data-act="quit">✕ Thoát</button>
      <div class="hud-item" id="score">⭐ ${score}</div>
      <div class="hud-item" id="streak">🔥 ${streak}</div>
      ${extra}
    </div>`;
  };

  const barPct = () => {
    if (mode === 'time') return 100;
    if (mode === 'survival') return (Math.max(lives, 0) / cfg.lives) * 100;
    return (i / queue.length) * 100;
  };

  function render() {
    const cur = queue[i];
    root.innerHTML = `<div class="game">
      ${hud()}
      <div class="bar"><div class="bar-fill" id="bar" style="width:${barPct()}%"></div></div>
      <div class="card question"><p class="qtext">${esc(cur.q)}</p></div>
      <div class="options">${cur.opts
        .map((o, k) => `<button class="opt" data-k="${k}"><span class="key">${k + 1}</span><span>${esc(o.t)}</span></button>`)
        .join('')}</div>
      <div id="fb"></div>
    </div>`;
    locked = false;
  }

  function updateHud() {
    root.querySelector('#score').textContent = `⭐ ${score}`;
    root.querySelector('#streak').textContent = `🔥 ${streak}`;
    const l = root.querySelector('#lives');
    if (l) l.textContent = '❤️'.repeat(Math.max(lives, 0)) + '🖤'.repeat(Math.max(cfg.lives - lives, 0));
  }

  function isOver() {
    if (mode === 'survival') return lives <= 0 || i + 1 >= queue.length;
    if (mode === 'time') return false;
    return i + 1 >= queue.length;
  }

  function answer(k) {
    if (locked || finished) return;
    const cur = queue[i];
    if (!cur.opts[k]) return;
    locked = true;
    const ok = cur.opts[k].ok;
    answered++;
    let gain = 0;
    if (ok) {
      correct++;
      streak++;
      best = Math.max(best, streak);
      gain = points(streak);
      score += gain;
    } else {
      streak = 0;
      if (lives !== undefined) lives--;
      wrong.push(cur);
    }
    recordAnswer(bank.id, cur.id, ok, streak);

    const btns = root.querySelectorAll('.opt');
    btns.forEach((b, idx) => {
      b.disabled = true;
      if (cur.opts[idx].ok) b.classList.add('correct');
      else if (idx === k) b.classList.add('wrong');
    });
    updateHud();

    const correctText = cur.opts.find((o) => o.ok).t;
    const last = isOver() || (mode === 'survival' && lives <= 0);
    root.querySelector('#fb').innerHTML = `<div class="feedback ${ok ? 'good' : 'bad'}">
        <strong>${ok ? `🎉 Chính xác! +${gain}` : '😅 Chưa đúng'}</strong>
        ${ok ? '' : `<div>Đáp án đúng: <b>${esc(correctText)}</b></div>`}
        ${cur.explanation ? `<div class="expl">💡 ${esc(cur.explanation)}</div>` : ''}
        ${mode === 'time' ? '' : `<button class="btn primary" data-act="next">${last ? 'Xem kết quả' : 'Tiếp tục ▶'}</button>`}
      </div>`;
    if (mode === 'time') advanceId = setTimeout(next, ok ? 600 : 1800);
    else root.querySelector('[data-act="next"]').focus();
  }

  function next() {
    if (finished) return;
    clearTimeout(advanceId);
    if (isOver() && mode !== 'time') return finish();
    i++;
    if (i >= queue.length) queue = queue.concat(shuffle(questions).map(prep)); // đua thời gian: lặp lại đề
    render();
  }

  function finish() {
    if (finished) return;
    finished = true;
    cleanup();
    onFinish({ mode, score, correct, total: answered, bestStreak: best, wrong: uniqueById(wrong) });
  }

  function onKey(e) {
    if (/^[1-8]$/.test(e.key)) answer(Number(e.key) - 1);
    else if ((e.key === 'Enter' || e.key === ' ') && locked && mode !== 'time') {
      e.preventDefault();
      next();
    }
  }

  function onClick(e) {
    const opt = e.target.closest('.opt');
    if (opt) return answer(Number(opt.dataset.k));
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') next();
    if (act === 'quit') {
      if (answered === 0 || confirm('Thoát ván chơi? Kết quả ván này sẽ không được lưu.')) {
        finished = true;
        cleanup();
        onExit();
      }
    }
  }

  function cleanup() {
    clearInterval(timerId);
    clearTimeout(advanceId);
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('click', onClick);
  }

  document.addEventListener('keydown', onKey);
  root.addEventListener('click', onClick);
  render();

  if (mode === 'time') {
    deadline = performance.now() + cfg.duration * 1000;
    timerId = setInterval(() => {
      const left = Math.max(0, deadline - performance.now());
      const clock = root.querySelector('#clock');
      const bar = root.querySelector('#bar');
      if (clock) clock.textContent = `⏱️ ${Math.ceil(left / 1000)}s`;
      if (bar) bar.style.width = (left / (cfg.duration * 1000)) * 100 + '%';
      if (left <= 0) finish();
    }, 100);
  }
  return cleanup;
}

// ================= Ghép cặp =================

function runMatching({ root, bank, questions, onFinish, onExit }) {
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const seenRight = new Set();
  const pool = shuffle(questions)
    .map((q) => ({ id: q.id, left: clip(q.q, 110), right: clip(q.options[q.answer], 70), explanation: q.explanation }))
    .filter((p) => (seenRight.has(p.right) ? false : seenRight.add(p.right)))
    .slice(0, 15);

  // Chia vòng, mỗi vòng 5 cặp; phần dư quá nhỏ thì gộp vào vòng trước.
  const rounds = [];
  for (let n = 0; n < pool.length; n += 5) rounds.push(pool.slice(n, n + 5));
  if (rounds.length > 1 && rounds[rounds.length - 1].length < 3) {
    rounds[rounds.length - 2].push(...rounds.pop());
  }

  let r = 0;
  let score = 0;
  let streak = 0;
  let best = 0;
  let mistakes = 0;
  let matched = 0;
  let done = 0; // số cặp đã nối trong vòng hiện tại
  let selected = null;
  let busy = false;
  let finished = false;
  let timeoutId = null;
  const missed = new Map(); // id -> câu hỏi đã nối sai

  function render() {
    const cur = rounds[r];
    const L = shuffle(cur);
    const R = shuffle(cur);
    root.innerHTML = `<div class="game">
      <div class="hud">
        <button class="btn ghost small" data-act="quit">✕ Thoát</button>
        <div class="hud-item" id="score">⭐ ${score}</div>
        <div class="hud-item" id="streak">🔥 ${streak}</div>
        <div class="hud-item">Vòng ${r + 1}/${rounds.length}</div>
        <div class="hud-item">❌ ${mistakes}</div>
      </div>
      <div class="bar"><div class="bar-fill" style="width:${(matched / pool.length) * 100}%"></div></div>
      <p class="hint">Chọn một câu hỏi bên trái, rồi chọn đáp án đúng bên phải.</p>
      <div class="match">
        <div class="col">${L.map((p) => `<button class="tile" data-side="l" data-id="${p.id}">${esc(p.left)}</button>`).join('')}</div>
        <div class="col">${R.map((p) => `<button class="tile" data-side="r" data-id="${p.id}">${esc(p.right)}</button>`).join('')}</div>
      </div>
    </div>`;
    done = 0;
    selected = null;
    busy = false;
  }

  function refreshHud() {
    root.querySelector('#score').textContent = `⭐ ${score}`;
    root.querySelector('#streak').textContent = `🔥 ${streak}`;
    root.querySelector('.hud').lastElementChild.textContent = `❌ ${mistakes}`;
    root.querySelector('.bar-fill').style.width = (matched / pool.length) * 100 + '%';
  }

  function pick(tile) {
    if (busy || tile.classList.contains('done')) return;
    const side = tile.dataset.side;
    if (side === 'l') {
      root.querySelectorAll('.tile[data-side="l"]').forEach((t) => t.classList.remove('selected'));
      if (selected === tile) selected = null;
      else {
        selected = tile;
        tile.classList.add('selected');
      }
      return;
    }
    if (!selected) {
      const hint = root.querySelector('.hint');
      hint.classList.add('pulse');
      setTimeout(() => hint.classList.remove('pulse'), 600);
      return;
    }
    const id = selected.dataset.id;
    if (id === tile.dataset.id) {
      tile.classList.add('done');
      selected.classList.remove('selected');
      selected.classList.add('done');
      streak++;
      best = Math.max(best, streak);
      score += points(streak);
      matched++;
      done++;
      if (!missed.has(id)) recordAnswer(bank.id, id, true, streak);
      selected = null;
      refreshHud();
      if (done === rounds[r].length) {
        busy = true;
        timeoutId = setTimeout(() => {
          if (r + 1 >= rounds.length) return finish();
          r++;
          render();
        }, 700);
      }
    } else {
      const left = selected;
      streak = 0;
      mistakes++;
      if (!missed.has(id)) {
        const p = pool.find((x) => x.id === id);
        missed.set(id, p);
        recordAnswer(bank.id, id, false, 0);
      }
      busy = true;
      [left, tile].forEach((t) => t.classList.add('shake'));
      timeoutId = setTimeout(() => {
        [left, tile].forEach((t) => t.classList.remove('shake', 'selected'));
        selected = null;
        busy = false;
      }, 450);
      refreshHud();
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    cleanup();
    const wrong = questions.filter((q) => missed.has(q.id)).map((q) => ({ id: q.id, q: q.q, explanation: q.explanation, opts: q.options.map((t, i) => ({ t, ok: i === q.answer })) }));
    onFinish({ mode: 'matching', score, correct: matched, total: matched + mistakes, bestStreak: best, wrong });
  }

  function onClick(e) {
    const tile = e.target.closest('.tile');
    if (tile) return pick(tile);
    if (e.target.closest('[data-act="quit"]')) {
      if (matched === 0 || confirm('Thoát ván chơi? Kết quả ván này sẽ không được lưu.')) {
        finished = true;
        cleanup();
        onExit();
      }
    }
  }

  function cleanup() {
    clearTimeout(timeoutId);
    root.removeEventListener('click', onClick);
  }

  root.addEventListener('click', onClick);
  render();
  return cleanup;
}
