// Đọc bộ đề từ JSON / CSV / TXT / DOCX và chuẩn hóa thành:
// { questions: [{ id, q, options: string[], answer: number (0-based), explanation }], errors: string[] }

import { uid } from './util.js';

const LETTERS = 'ABCDEFGH';

// ---------- Chuẩn hóa & kiểm tra ----------

function resolveAnswer(val, options) {
  if (val === null || val === undefined) return -1;
  const s = String(val).trim();
  if (!s) return -1;
  if (/^[A-Ha-h]$/.test(s)) return LETTERS.indexOf(s.toUpperCase());
  if (/^\d+$/.test(s)) return Number(s) - 1; // số được hiểu là thứ tự bắt đầu từ 1
  const norm = (x) => String(x).trim().toLowerCase().replace(/[.\s]+$/, '');
  return options.findIndex((o) => norm(o) === norm(s));
}

function finalize(raws) {
  const questions = [];
  const errors = [];
  raws.forEach((r, i) => {
    const label = `Câu ${i + 1}`;
    const q = String(r.q ?? '').trim();
    const options = (r.options || []).map((o) => String(o ?? '').trim()).filter(Boolean);
    if (!q) return errors.push(`${label}: thiếu nội dung câu hỏi`);
    if (options.length < 2) return errors.push(`${label}: cần ít nhất 2 đáp án`);
    if (options.length > 8) return errors.push(`${label}: tối đa 8 đáp án`);
    let answer = typeof r.answer === 'number' ? r.answer : resolveAnswer(r.answer, options);
    if (answer < 0 || answer >= options.length) {
      return errors.push(`${label}: không xác định được đáp án đúng ("${q.slice(0, 40)}")`);
    }
    questions.push({
      id: uid(),
      q,
      options,
      answer,
      explanation: String(r.explanation ?? '').trim(),
    });
  });
  return { questions, errors };
}

// ---------- JSON ----------

function parseJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { questions: [], errors: ['File JSON không hợp lệ: ' + e.message] };
  }
  const list = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(list)) return { questions: [], errors: ['JSON cần là một mảng câu hỏi hoặc { "questions": [...] }'] };
  return finalize(
    list.map((it) => ({
      q: it.question ?? it.q ?? it.cauHoi ?? it['câu hỏi'],
      options: it.options ?? it.choices ?? it.answers ?? it['đáp án'] ?? [],
      answer: it.answer ?? it.correct ?? it['đáp án đúng'],
      explanation: it.explanation ?? it.explain ?? it['giải thích'] ?? '',
    }))
  );
}

// ---------- CSV ----------

function parseCSVRows(text, delim) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function parseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const counts = { '\t': 0, ';': 0, ',': 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch]++;
  const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const rows = parseCSVRows(text, delim);
  if (rows.length < 2) return { questions: [], errors: ['CSV cần dòng tiêu đề và ít nhất một câu hỏi'] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const qCol = header.findIndex((h) => /^(question|câu hỏi|cau hoi|q)$/.test(h));
  const ansCol = header.findIndex((h) => /^(answer|đáp án|dap an|correct|ans|đáp án đúng|dap an dung)$/.test(h));
  const expCol = header.findIndex((h) => /^(explanation|giải thích|giai thich|explain|note)$/.test(h));
  const optCols = [];
  header.forEach((h, i) => {
    if (/^(?:option|opt|lựa chọn|lua chon|đáp án|dap an)?\s*([a-h]|[1-8])$/.test(h)) optCols.push(i);
  });
  if (qCol < 0 || ansCol < 0 || optCols.length < 2) {
    return {
      questions: [],
      errors: ['Dòng tiêu đề CSV cần có: question, A, B, C, D (các đáp án), answer, và tùy chọn explanation'],
    };
  }
  return finalize(
    rows.slice(1).map((r) => ({
      q: r[qCol],
      options: optCols.map((i) => r[i]),
      answer: r[ansCol],
      explanation: expCol >= 0 ? r[expCol] : '',
    }))
  );
}

// ---------- TXT ----------

const RE_OPTION = /^\s*(\*|✓|✔)?\s*([A-Ha-h])[.):]\s+(.*)$/;
const RE_ANSWER = /^\s*(?:đáp án|dap an|answer|ans|đ\/a)\s*[:：-]\s*(.+)$/i;
const RE_EXPL = /^\s*(?:giải thích|giai thich|explanation|explain)\s*[:：]\s*(.*)$/i;
const RE_QNUM = /^\s*(?:câu|cau|question|q)?\s*\d+\s*[.):-]\s*/i;

function parseText(text) {
  const raws = [];
  let cur = null;
  let inExpl = false;
  const start = (q) => {
    cur = { q, options: [], answer: null, explanation: '', closed: false };
    raws.push(cur);
    inExpl = false;
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      if (cur && (cur.answer !== null || inExpl)) cur.closed = true;
      continue;
    }
    let m;
    if ((m = line.match(RE_OPTION)) && cur && !cur.closed) {
      cur.options.push(m[3].trim());
      if (m[1]) cur.answer = cur.options.length - 1;
      inExpl = false;
    } else if ((m = line.match(RE_ANSWER)) && cur) {
      cur.answer = m[1].trim();
      inExpl = false;
    } else if ((m = line.match(RE_EXPL)) && cur) {
      cur.explanation = m[1].trim();
      inExpl = true;
    } else if (cur && RE_QNUM.test(line) && (cur.answer !== null || cur.options.length > 0)) {
      start(line.replace(RE_QNUM, '').trim()); // dòng đánh số mới => câu hỏi mới
    } else if (cur && inExpl && !cur.closed) {
      cur.explanation += ' ' + line.trim();
    } else if (cur && !cur.closed && cur.options.length === 0 && cur.answer === null) {
      cur.q += ' ' + line.trim(); // câu hỏi viết nhiều dòng
    } else {
      start(line.replace(RE_QNUM, '').trim());
    }
  }
  return finalize(raws);
}

// ---------- DOCX (không cần thư viện: đọc zip + giải nén bằng DecompressionStream) ----------

export async function docxToText(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Không phải file .docx hợp lệ');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (name === 'word/document.xml') {
      const dataStart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      let data = u8.subarray(dataStart, dataStart + csize);
      if (method === 8) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else if (method !== 0) throw new Error('Kiểu nén .docx không được hỗ trợ');
      return xmlToText(new TextDecoder().decode(data));
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('Không tìm thấy nội dung trong file .docx');
}

function xmlToText(xml) {
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<w:tab\s*\/?>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ---------- Điểm vào chính ----------

export function parseAny(text, filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const t = text.replace(/^\uFEFF/, '').trim();
  if (!t) return { questions: [], errors: ['Nội dung trống'] };
  if (ext === 'json' || (ext !== 'csv' && ext !== 'tsv' && /^[[{]/.test(t))) return parseJSON(t);
  if (ext === 'csv' || ext === 'tsv') return parseCSV(t);
  return parseText(t);
}

export const TEMPLATES = {
  txt: `1. Thủ đô của Việt Nam là gì?
A. Hồ Chí Minh
*B. Hà Nội
C. Đà Nẵng
D. Huế
Giải thích: Hà Nội là thủ đô của Việt Nam từ năm 1976.

2. 2 + 2 = ?
A. 3
B. 4
C. 5
Đáp án: B
`,
  csv: `question,A,B,C,D,answer,explanation
Thủ đô của Việt Nam là gì?,Hồ Chí Minh,Hà Nội,Đà Nẵng,Huế,B,Hà Nội là thủ đô từ năm 1976
2 + 2 = ?,3,4,5,6,B,
`,
  json: JSON.stringify(
    [
      {
        question: 'Thủ đô của Việt Nam là gì?',
        options: ['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Huế'],
        answer: 'B',
        explanation: 'Hà Nội là thủ đô từ năm 1976.',
      },
    ],
    null,
    2
  ),
};
