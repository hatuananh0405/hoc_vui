import { $, esc, shuffle, uid, download } from './util.js';
import * as store from './store.js';
import { parseAny, docxToText, TEMPLATES } from './parser.js';
import { MODES, startGame } from './games.js';
import { SAMPLE_NAME, SAMPLE_TEXT } from './sample.js';

const app = $('#app');
const headerEl = $('#top');

let cleanup = () => {};
let lastRun = null; // { bankId, mode, count } để chơi lại
let ui = { listOpen: false };

const MODE_NAMES = { ...Object.fromEntries(Object.entries(MODES).map(([k, v]) => [k, v.name])), review: 'Ôn câu sai' };

// ---------- Điều hướng ----------

function go(view, params = {}) {
  cleanup();
  cleanup = () => {};
  renderHeader();
  VIEWS[view](params);
  window.scrollTo(0, 0);
}

function renderHeader() {
  const l = store.levelInfo();
  const streak = store.dayStreak();
  headerEl.innerHTML = `
    <button class="logo" data-act="home">🎓 HọcVui</button>
    <div class="me">
      <span class="chip" title="Số ngày học liên tiếp">🔥 ${streak} ngày</span>
      <span class="chip lvl">Cấp ${l.level}</span>
      <div class="xp" title="${l.xp} / ${l.to} XP"><i style="width:${l.pct}%"></i></div>
      <small>${l.xp} XP</small>
    </div>`;
}

// ---------- Trang chủ ----------

function homeView() {
  const banks = store.getBanks();
  const st = store.getStats();
  const acc = st.answered ? Math.round((st.correct / st.answered) * 100) : 0;
  app.innerHTML = `
    <section class="hero">
      <h1>Vừa chơi vừa học 🎮</h1>
      <p>Tải lên tài liệu hoặc bộ đề trắc nghiệm của bạn, chọn một trò chơi và bắt đầu.</p>
      <div class="row">
        <button class="btn primary big" data-act="import">＋ Thêm bộ đề</button>
        <button class="btn" data-act="sample">Thử bộ đề mẫu</button>
      </div>
    </section>

    <section>
      <h2>Bộ đề của bạn</h2>
      ${
        banks.length
          ? `<div class="grid">${banks
              .map((b) => {
                const w = store.getWrongIds(b.id).length;
                return `<button class="card bank" data-act="bank" data-id="${b.id}">
                  <div class="bank-title">📚 ${esc(b.name)}</div>
                  <div class="muted">${b.questions.length} câu hỏi</div>
                  ${w ? `<div class="tag">${w} câu cần ôn</div>` : ''}
                </button>`;
              })
              .join('')}</div>`
          : `<div class="card empty">Chưa có bộ đề nào. Hãy thêm bộ đề của bạn hoặc thử bộ đề mẫu.</div>`
      }
    </section>

    <section>
      <h2>Thống kê</h2>
      <div class="stats">
        <div class="card stat"><b>${st.games}</b><span>Ván đã chơi</span></div>
        <div class="card stat"><b>${st.answered}</b><span>Câu đã trả lời</span></div>
        <div class="card stat"><b>${acc}%</b><span>Tỉ lệ đúng</span></div>
        <div class="card stat"><b>${st.bestStreak}</b><span>Chuỗi đúng dài nhất</span></div>
      </div>
    </section>

    <section>
      <h2>Huy hiệu</h2>
      <div class="badges">${store.BADGES.map((b) => {
        const ok = b.ok(st);
        return `<div class="card badge ${ok ? '' : 'locked'}"><div class="ico">${b.icon}</div><b>${b.name}</b><span>${b.desc}</span></div>`;
      }).join('')}</div>
    </section>

    ${banks.length || st.games ? `<p class="footer-note"><button class="link danger" data-act="reset">Xóa toàn bộ dữ liệu</button></p>` : ''}
  `;
}

// ---------- Thêm bộ đề ----------

function importView() {
  let parsed = { questions: [], errors: [] };
  let nameTouched = false;
  let fileHint = 'paste.txt';

  app.innerHTML = `
    <button class="link" data-act="home">← Quay lại</button>
    <h1>Thêm bộ đề</h1>
    <div class="card form">
      <label>Tên bộ đề<input id="name" type="text" placeholder="Ví dụ: Lịch sử lớp 9 - Chương 1" maxlength="80"></label>

      <div id="drop" class="drop">
        <p><b>Kéo thả file vào đây</b> hoặc</p>
        <label class="btn">Chọn file<input id="file" type="file" accept=".txt,.csv,.tsv,.json,.docx" hidden></label>
        <p class="muted">Hỗ trợ: .docx, .txt, .csv, .json</p>
      </div>

      <label>Hoặc dán nội dung trực tiếp
        <textarea id="text" rows="10" placeholder="1. Câu hỏi?&#10;A. Đáp án 1&#10;*B. Đáp án đúng (đánh dấu bằng dấu *)&#10;C. Đáp án 3&#10;Giải thích: ..."></textarea>
      </label>
      <div id="preview"></div>
      <div class="row">
        <button class="btn primary" id="save" disabled>Lưu bộ đề</button>
      </div>
    </div>

    <details class="card guide">
      <summary>Định dạng file và file mẫu</summary>
      <p>Mỗi câu hỏi cần có nội dung, từ 2 đến 8 đáp án và đáp án đúng. Phần giải thích là tùy chọn.</p>
      <p><b>Văn bản (.txt, .docx)</b>: đánh dấu đáp án đúng bằng <code>*</code> trước chữ cái, hoặc thêm dòng <code>Đáp án: B</code>. Dòng <code>Giải thích: ...</code> là tùy chọn. Các câu cách nhau bằng dòng trống hoặc đánh số.</p>
      <p><b>CSV</b>: dòng đầu là <code>question,A,B,C,D,answer,explanation</code>. Cột answer ghi chữ cái (A-H), thứ tự (bắt đầu từ 1) hoặc nội dung đáp án.</p>
      <p><b>JSON</b>: mảng các đối tượng có <code>question</code>, <code>options</code>, <code>answer</code>, <code>explanation</code>.</p>
      <div class="row">
        <button class="btn small" data-act="tpl" data-t="txt">Tải mẫu .txt</button>
        <button class="btn small" data-act="tpl" data-t="csv">Tải mẫu .csv</button>
        <button class="btn small" data-act="tpl" data-t="json">Tải mẫu .json</button>
      </div>
      <p class="muted">Lưu ý: app chỉ đọc được đề đã có sẵn câu hỏi và đáp án. Tài liệu dạng bài giảng thì chưa tự tạo câu hỏi được.</p>
    </details>
  `;

  const nameEl = $('#name');
  const textEl = $('#text');
  const prevEl = $('#preview');
  const saveEl = $('#save');
  const dropEl = $('#drop');

  const reparse = () => {
    parsed = textEl.value.trim() ? parseAny(textEl.value, fileHint) : { questions: [], errors: [] };
    const { questions: qs, errors } = parsed;
    prevEl.innerHTML = !textEl.value.trim()
      ? ''
      : `<div class="preview ${qs.length ? 'ok' : 'err'}">
          <b>${qs.length ? `✅ Đọc được ${qs.length} câu hỏi` : '⚠️ Chưa đọc được câu hỏi nào'}</b>
          ${errors.length ? `<ul>${errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}${errors.length > 8 ? `<li>... và ${errors.length - 8} lỗi khác</li>` : ''}</ul>` : ''}
          ${qs.length ? `<div class="muted">Ví dụ: ${esc(qs[0].q)}</div>` : ''}
        </div>`;
    saveEl.disabled = !qs.length;
  };

  async function loadFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'docx') {
        textEl.value = await docxToText(await file.arrayBuffer());
        fileHint = 'doc.txt';
      } else if (['txt', 'csv', 'tsv', 'json'].includes(ext)) {
        textEl.value = await file.text();
        fileHint = file.name;
      } else {
        throw new Error('Định dạng .' + ext + ' chưa được hỗ trợ. Hãy dùng .docx, .txt, .csv hoặc .json (PDF: copy nội dung rồi dán vào ô bên dưới).');
      }
    } catch (e) {
      alert(e.message);
      return;
    }
    if (!nameTouched) nameEl.value = file.name.replace(/\.[^.]+$/, '');
    reparse();
  }

  nameEl.addEventListener('input', () => (nameTouched = true));
  let t;
  textEl.addEventListener('input', () => {
    fileHint = 'paste.txt';
    clearTimeout(t);
    t = setTimeout(reparse, 250);
  });
  $('#file').addEventListener('change', (e) => loadFile(e.target.files[0]));
  dropEl.addEventListener('dragover', (e) => (e.preventDefault(), dropEl.classList.add('over')));
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('over'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('over');
    loadFile(e.dataTransfer.files[0]);
  });
  saveEl.addEventListener('click', () => {
    if (!parsed.questions.length) return;
    const bank = { id: uid(), name: nameEl.value.trim() || 'Bộ đề không tên', createdAt: Date.now(), questions: parsed.questions };
    store.addBank(bank);
    go('bank', { id: bank.id });
  });
}

// ---------- Trang bộ đề ----------

function bankView({ id }) {
  const bank = store.getBank(id);
  if (!bank) return go('home');
  const n = bank.questions.length;
  const wrongQs = bank.questions.filter((q) => store.getWrongIds(id).includes(q.id));
  const counts = [5, 10, 20, 50].filter((c) => c < n);

  app.innerHTML = `
    <button class="link" data-act="home">← Tất cả bộ đề</button>
    <div class="bank-head">
      <div><h1>📚 ${esc(bank.name)}</h1><div class="muted">${n} câu hỏi</div></div>
      <div class="row">
        <button class="btn small" data-act="export" data-id="${id}">Xuất JSON</button>
        <button class="btn small danger" data-act="delbank" data-id="${id}">Xóa bộ đề</button>
      </div>
    </div>

    ${
      wrongQs.length
        ? `<div class="card review"><div><b>📖 Ôn lại câu đã sai</b><div class="muted">${wrongQs.length} câu bạn từng trả lời sai. Trả lời đúng sẽ gỡ câu khỏi danh sách.</div></div>
           <button class="btn primary" data-act="play" data-id="${id}" data-mode="review">Ôn ngay</button></div>`
        : ''
    }

    <h2>Chọn trò chơi</h2>
    <div class="grid modes">${Object.entries(MODES)
      .map(([k, m]) => {
        const ok = n >= m.min;
        const best = store.getScores(id, k)[0];
        return `<div class="card mode ${ok ? '' : 'disabled'}">
          <div class="ico">${m.icon}</div>
          <b>${m.name}</b>
          <p class="muted">${m.desc}</p>
          ${best ? `<div class="tag">🏆 Kỷ lục: ${best.score}</div>` : ''}
          ${k === 'classic' ? `<label class="inline">Số câu <select id="count">${counts.map((c) => `<option value="${c}">${c}</option>`).join('')}<option value="all" selected>Tất cả (${n})</option></select></label>` : ''}
          <button class="btn primary" data-act="play" data-id="${id}" data-mode="${k}" ${ok ? '' : 'disabled'}>${ok ? 'Chơi' : `Cần ít nhất ${m.min} câu`}</button>
        </div>`;
      })
      .join('')}</div>

    <details class="card" id="qlist" ${ui.listOpen ? 'open' : ''}>
      <summary>Xem danh sách câu hỏi (${n})</summary>
      <ol class="qlist">${bank.questions
        .map(
          (q) => `<li><div class="qrow"><span>${esc(q.q)}<br><small class="muted">Đáp án: ${esc(q.options[q.answer])}</small></span>
          <button class="link danger" data-act="delq" data-id="${id}" data-q="${q.id}">Xóa</button></div></li>`
        )
        .join('')}</ol>
    </details>
  `;
  $('#qlist').addEventListener('toggle', (e) => (ui.listOpen = e.target.open));
}

function buildQuestions(bank, mode, count) {
  if (mode === 'review') {
    const ids = store.getWrongIds(bank.id);
    return bank.questions.filter((q) => ids.includes(q.id));
  }
  const all = bank.questions;
  if (mode === 'classic' && count && count !== 'all') return shuffle(all).slice(0, Number(count));
  return all;
}

// ---------- Màn chơi ----------

function playView({ bankId, mode, count }) {
  const bank = store.getBank(bankId);
  if (!bank) return go('home');
  const questions = buildQuestions(bank, mode, count);
  if (!questions.length) return go('bank', { id: bankId });
  lastRun = { bankId, mode, count };
  app.innerHTML = '<div id="stage"></div>';
  cleanup = startGame({
    root: $('#stage'),
    bank,
    mode,
    questions,
    onExit: () => go('bank', { id: bankId }),
    onFinish: (res) => {
      const fin = store.finishGame({ bankId, ...res });
      go('result', { bankId, res, fin });
    },
  });
}

// ---------- Kết quả ----------

function resultView({ bankId, res, fin }) {
  const acc = res.total ? Math.round((res.correct / res.total) * 100) : 0;
  const face = acc >= 90 ? '🏆' : acc >= 70 ? '🎉' : acc >= 40 ? '👍' : '💪';
  const canReview = res.wrong.length > 0;
  app.innerHTML = `
    <div class="result">
      <div class="big-emoji">${face}</div>
      <h1>${esc(MODE_NAMES[res.mode] || '')}: kết thúc!</h1>
      ${fin.record ? '<div class="banner gold">🏅 Kỷ lục mới!</div>' : ''}
      ${fin.leveledUp ? `<div class="banner">🎊 Lên cấp ${fin.newLevel}!</div>` : ''}
      <div class="stats">
        <div class="card stat"><b>${res.score}</b><span>Điểm</span></div>
        <div class="card stat"><b>${res.correct}/${res.total}</b><span>Đúng</span></div>
        <div class="card stat"><b>${acc}%</b><span>Chính xác</span></div>
        <div class="card stat"><b>${res.bestStreak}</b><span>Chuỗi đúng dài nhất</span></div>
        <div class="card stat"><b>+${fin.gained}</b><span>XP</span></div>
      </div>
      <div class="row center">
        <button class="btn primary" data-act="again">Chơi lại</button>
        ${canReview ? '<button class="btn" data-act="reviewnow">Ôn câu vừa sai</button>' : ''}
        <button class="btn" data-act="bank" data-id="${bankId}">Chọn trò khác</button>
      </div>
      ${
        canReview
          ? `<h2>Các câu cần xem lại (${res.wrong.length})</h2>
             <div class="wrong-list">${res.wrong
               .map((w) => {
                 const right = w.opts.find((o) => o.ok).t;
                 return `<div class="card"><p class="qtext">${esc(w.q)}</p><div class="good-line">✔ ${esc(right)}</div>${w.explanation ? `<div class="expl">💡 ${esc(w.explanation)}</div>` : ''}</div>`;
               })
               .join('')}</div>`
          : '<p class="muted">Không có câu nào sai. Tuyệt vời!</p>'
      }
    </div>`;
}

const VIEWS = {
  home: homeView,
  import: importView,
  bank: bankView,
  play: playView,
  result: resultView,
};

// ---------- Xử lý click chung ----------

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id, mode, q, t } = el.dataset;
  switch (act) {
    case 'home':
      return go('home');
    case 'import':
      return go('import');
    case 'sample': {
      const r = parseAny(SAMPLE_TEXT, 'sample.txt');
      const bank = { id: uid(), name: SAMPLE_NAME, createdAt: Date.now(), questions: r.questions };
      store.addBank(bank);
      return go('bank', { id: bank.id });
    }
    case 'bank':
      return go('bank', { id });
    case 'play': {
      const count = mode === 'classic' ? $('#count')?.value : undefined;
      return go('play', { bankId: id, mode, count });
    }
    case 'again':
      return go('play', lastRun);
    case 'reviewnow': {
      // ôn đúng những câu vừa sai: dùng danh sách sai đã lưu của bộ đề
      return go('play', { bankId: lastRun.bankId, mode: 'review' });
    }
    case 'export': {
      const b = store.getBank(id);
      const data = b.questions.map(({ q, options, answer, explanation }) => ({
        question: q,
        options,
        answer: 'ABCDEFGH'[answer],
        explanation,
      }));
      return download(`${b.name}.json`, JSON.stringify(data, null, 2), 'application/json');
    }
    case 'delbank':
      if (confirm('Xóa bộ đề này và toàn bộ tiến độ của nó?')) {
        store.deleteBank(id);
        go('home');
      }
      return;
    case 'delq':
      if (confirm('Xóa câu hỏi này?')) {
        store.deleteQuestion(id, q);
        go('bank', { id });
      }
      return;
    case 'tpl':
      return download(`mau.${t}`, TEMPLATES[t], t === 'json' ? 'application/json' : 'text/plain');
    case 'reset':
      if (confirm('Xóa TOÀN BỘ bộ đề, điểm và tiến độ? Không thể hoàn tác.')) {
        store.resetAll();
        go('home');
      }
      return;
  }
});

go('home');
