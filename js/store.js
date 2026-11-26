// Lưu toàn bộ dữ liệu trong localStorage của trình duyệt.
import { today } from './util.js';

const KEY = 'hocvui.v1';

const fresh = () => ({
  banks: [], // { id, name, createdAt, questions: [...] }
  stats: { xp: 0, answered: 0, correct: 0, bestStreak: 0, games: 0, perfect: 0, days: [] },
  wrong: {}, // bankId -> [questionId]
  scores: {}, // `${bankId}:${mode}` -> [{ score, date }]
  playlists: [], // { id, name, createdAt, items: [{ id, url, title }] }
});

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.banks)) return { ...fresh(), ...s, stats: { ...fresh().stats, ...s.stats } };
  } catch {
    /* dữ liệu hỏng hoặc chưa có */
  }
  return fresh();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert('Không lưu được dữ liệu (bộ nhớ trình duyệt đầy?): ' + e.message);
  }
}

// ----- Bộ đề -----
export const getBanks = () => state.banks;
export const getBank = (id) => state.banks.find((b) => b.id === id);

export function addBank(bank) {
  state.banks.push(bank);
  save();
}

export function deleteBank(id) {
  state.banks = state.banks.filter((b) => b.id !== id);
  delete state.wrong[id];
  for (const k of Object.keys(state.scores)) if (k.startsWith(id + ':')) delete state.scores[k];
  save();
}

export function deleteQuestion(bankId, qid) {
  const b = getBank(bankId);
  if (!b) return;
  b.questions = b.questions.filter((q) => q.id !== qid);
  state.wrong[bankId] = (state.wrong[bankId] || []).filter((x) => x !== qid);
  save();
}

// ----- Tiến độ -----
export const getStats = () => state.stats;

export function recordAnswer(bankId, qid, ok, streak) {
  const s = state.stats;
  s.answered++;
  if (ok) s.correct++;
  s.bestStreak = Math.max(s.bestStreak, streak);
  const list = state.wrong[bankId] || (state.wrong[bankId] = []);
  const i = list.indexOf(qid);
  if (!ok && i < 0) list.push(qid);
  if (ok && i >= 0) list.splice(i, 1); // trả lời đúng thì khỏi cần ôn nữa
  save();
}

export const getWrongIds = (bankId) => state.wrong[bankId] || [];

// XP và cấp độ: cần 50 * (cấp - 1)^2 XP để đạt một cấp.
const xpFor = (level) => 50 * (level - 1) ** 2;
export function levelInfo(xp = state.stats.xp) {
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const from = xpFor(level);
  const to = xpFor(level + 1);
  return { level, xp, from, to, pct: Math.round(((xp - from) / (to - from)) * 100) };
}

// Trả về { gained, leveledUp, newLevel, record }
export function finishGame({ bankId, mode, score, correct, total, bestStreak }) {
  const before = levelInfo().level;
  const s = state.stats;
  const isPerfect = total >= 5 && correct === total; // ván quá ngắn không tính "hoàn hảo"
  const gained = correct * 10 + bestStreak * 2 + (isPerfect ? 20 : 0);
  s.xp += gained;
  s.games++;
  if (isPerfect) s.perfect++;
  const d = today();
  if (!s.days.includes(d)) s.days = [...s.days, d].slice(-400);

  const key = `${bankId}:${mode}`;
  const list = state.scores[key] || (state.scores[key] = []);
  const prevBest = list.length ? Math.max(...list.map((x) => x.score)) : 0;
  list.push({ score, date: d });
  list.sort((a, b) => b.score - a.score);
  state.scores[key] = list.slice(0, 5);
  save();

  const after = levelInfo().level;
  return { gained, leveledUp: after > before, newLevel: after, record: score > prevBest && score > 0 };
}

export const getScores = (bankId, mode) => state.scores[`${bankId}:${mode}`] || [];

// Số ngày liên tiếp có học (tính đến hôm nay hoặc hôm qua)
export function dayStreak() {
  const days = new Set(state.stats.days);
  const d = new Date();
  const fmt = (x) => x.toISOString().slice(0, 10);
  if (!days.has(fmt(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(fmt(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export const BADGES = [
  { id: 'first', icon: '🎮', name: 'Khởi đầu', desc: 'Hoàn thành 1 ván chơi', ok: (s) => s.games >= 1 },
  { id: 'c100', icon: '🎯', name: 'Chăm chỉ', desc: 'Trả lời đúng 100 câu', ok: (s) => s.correct >= 100 },
  { id: 'st10', icon: '🔥', name: 'Chuỗi lửa', desc: 'Đúng liên tiếp 10 câu', ok: (s) => s.bestStreak >= 10 },
  { id: 'perf', icon: '💯', name: 'Hoàn hảo', desc: 'Một ván đúng toàn bộ', ok: (s) => s.perfect >= 1 },
  { id: 'lv5', icon: '⭐', name: 'Cấp 5', desc: 'Đạt cấp độ 5', ok: (s) => levelInfo(s.xp).level >= 5 },
  { id: 'day3', icon: '📅', name: 'Bền bỉ', desc: 'Học 3 ngày liên tiếp', ok: () => dayStreak() >= 3 },
];

// ----- Playlist nhạc -----
export const getPlaylists = () => state.playlists;
export const getPlaylist = (id) => state.playlists.find((p) => p.id === id);

export function addPlaylist(playlist) {
  state.playlists.push(playlist);
  save();
}

export function renamePlaylist(id, name) {
  const p = getPlaylist(id);
  if (!p) return;
  p.name = name;
  save();
}

export function deletePlaylist(id) {
  state.playlists = state.playlists.filter((p) => p.id !== id);
  save();
}

export function addPlaylistItem(id, item) {
  const p = getPlaylist(id);
  if (!p) return;
  p.items.push(item);
  save();
}

export function removePlaylistItem(id, itemId) {
  const p = getPlaylist(id);
  if (!p) return;
  p.items = p.items.filter((it) => it.id !== itemId);
  save();
}

// Thay một link bằng nhiều link (dùng khi tách Mix thành từng bài), giữ nguyên thứ tự.
export function replacePlaylistItem(id, itemId, items) {
  const p = getPlaylist(id);
  const i = p ? p.items.findIndex((x) => x.id === itemId) : -1;
  if (i < 0) return;
  p.items.splice(i, 1, ...items);
  save();
}

export function setItemTitle(id, itemId, title) {
  const it = getPlaylist(id)?.items.find((x) => x.id === itemId);
  if (!it || !title) return;
  it.title = title;
  save();
}

export function resetAll() {
  state = fresh();
  save();
}
