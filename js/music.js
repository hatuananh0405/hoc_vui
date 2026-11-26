// Góc âm nhạc: lưu playlist, đặt tên, thêm link nhạc và phát bằng trình phát nhúng
// của Spotify hoặc YouTube / YouTube Music. Không cần đăng nhập vào app.
// - Spotify: ai đang đăng nhập Spotify trên trình duyệt nghe được cả bài, chưa đăng nhập thì nghe đoạn 30 giây.
// - YouTube / YouTube Music: phát bằng YouTube IFrame Player API, tự chuyển bài khi hết.
import { esc, uid } from './util.js';
import * as store from './store.js';

const SPOTIFY_TYPES = { track: 'Bài hát', album: 'Album', playlist: 'Playlist', episode: 'Tập podcast', show: 'Podcast', artist: 'Nghệ sĩ' };
const YT_HOSTS = new Set(['youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com']);
const SPOTIFY_URI = /^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,40})$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{10,40}$/;
const YT_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const YT_LIST = /^[A-Za-z0-9_-]{10,64}$/;
const YT_PATH = /^\/(?:embed|shorts|live)\/([^/?#]+)/;
// Mix của YouTube có ID dạng "RD" + ID video gốc (YouTube Music: "RDAMVM" + ID video).
// Trình phát nhúng không mở được Mix nếu thiếu video bắt đầu, nên tách video gốc ra.
const YT_MIX = /^RD(?:AMVM|AMPL)?([A-Za-z0-9_-]{11})$/;

// ---------- Nhận diện link ----------
// Trả về null nếu không phải link Spotify / YouTube hợp lệ. Chỉ giữ lại ID đã kiểm tra,
// URL phát nhạc luôn được dựng lại từ ID nên không chèn được nội dung lạ.
export function parseMusicLink(raw) {
  const s = String(raw ?? '').trim();
  const uri = SPOTIFY_URI.exec(s);
  if (uri) return spotify(uri[1], uri[2]);
  const u = toUrl(s);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  if (host === 'open.spotify.com') return parseSpotifyUrl(u);
  if (YT_HOSTS.has(host)) return parseYouTubeUrl(u, host);
  return null;
}

function toUrl(s) {
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
  } catch {
    return null;
  }
}

function parseSpotifyUrl(u) {
  const parts = u.pathname.split('/').filter((p) => p && !/^intl-/i.test(p) && p !== 'embed');
  const [type, id = ''] = parts;
  return SPOTIFY_TYPES[type] && SPOTIFY_ID.test(id) ? spotify(type, id) : null;
}

function youtubeVideoId(u, host) {
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0];
  if (u.pathname === '/watch') return u.searchParams.get('v');
  return YT_PATH.exec(u.pathname)?.[1] ?? null;
}

function parseYouTubeUrl(u, host) {
  const v = youtubeVideoId(u, host);
  const list = u.searchParams.get('list');
  const listId = list && YT_LIST.test(list) ? list : null;
  const seed = listId ? YT_MIX.exec(listId)?.[1] : undefined;
  const mix = Boolean(seed);
  const videoId = (v && YT_VIDEO.test(v) ? v : null) ?? seed ?? null;
  if (!videoId && !listId) return null;
  let label = videoId ? 'Video YouTube' : 'Playlist YouTube';
  if (mix) label = 'Mix YouTube';
  return { kind: 'youtube', videoId, listId, mix, label, url: youtubeUrl(videoId, listId) };
}

function youtubeUrl(videoId, listId) {
  if (!videoId) return `https://www.youtube.com/playlist?list=${listId}`;
  const list = listId ? '&list=' + listId : '';
  return `https://www.youtube.com/watch?v=${videoId}${list}`;
}

function youtubeEmbedSrc(link) {
  const opts = 'autoplay=1&playsinline=1';
  if (!link.videoId) return `https://www.youtube.com/embed/videoseries?list=${link.listId}&${opts}`;
  const list = link.listId ? '&list=' + link.listId : '';
  return `https://www.youtube.com/embed/${link.videoId}?${opts}${list}`;
}

function spotify(type, id) {
  return { kind: 'spotify', type, id, label: `${SPOTIFY_TYPES[type]} Spotify`, url: `https://open.spotify.com/${type}/${id}` };
}

// Lấy tên bài / playlist qua oEmbed. Lỗi mạng hoặc bị chặn thì bỏ qua, giữ tên mặc định.
async function fetchTitle(link) {
  const endpoint =
    link.kind === 'spotify'
      ? `https://open.spotify.com/oembed?url=${encodeURIComponent(link.url)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.url)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(endpoint, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.title === 'string' ? data.title.trim().slice(0, 150) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Tách Mix YouTube thành từng bài ----------
// Trình phát nhúng của YouTube chỉ cho đi vài bài trong Mix. Để nghe hết, app lấy danh sách
// bài của Mix từ máy chủ Invidious công cộng (bên thứ ba), rồi lưu từng bài thành một link riêng.
// Chỉ gửi ID của Mix, không gửi gì khác. Máy chủ công cộng có thể ngừng hoạt động bất cứ lúc nào,
// nên thử nhiều máy chủ và báo lỗi rõ ràng nếu không máy nào trả lời.
const INSTANCES_URL = 'https://api.invidious.io/instances.json?sort_by=type,health';
const FALLBACK_INSTANCES = ['yewtu.be', 'inv.nadeko.net', 'invidious.nerdvpn.de'];
const HOST_NAME = /^[a-z0-9.-]+$/i;
const MIX_ID = /^RD[A-Za-z0-9_-]{10,}$/;
const MAX_MIX_TRACKS = 50;
const MAX_INSTANCES_TRIED = 6;
const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function mixInstances() {
  try {
    const list = await fetchJson(INSTANCES_URL);
    const hosts = list
      .filter(([host, info]) => HOST_NAME.test(host) && info?.type === 'https' && info.api === true && info.cors === true)
      .map(([host]) => host);
    if (hosts.length) return hosts.slice(0, MAX_INSTANCES_TRIED);
  } catch {
    /* không lấy được danh sách máy chủ: dùng danh sách dự phòng */
  }
  return FALLBACK_INSTANCES;
}

// Giữ lại những bài có ID hợp lệ, bỏ trùng, giới hạn số bài
function normalizeTracks(videos) {
  const seen = new Set();
  const out = [];
  for (const v of Array.isArray(videos) ? videos : []) {
    const id = typeof v?.videoId === 'string' ? v.videoId : '';
    if (!YT_VIDEO.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ videoId: id, title: String(v.title ?? '').trim().slice(0, 150) || 'Video YouTube' });
    if (out.length >= MAX_MIX_TRACKS) break;
  }
  return out;
}

export async function fetchMixTracks(mixId) {
  if (!MIX_ID.test(mixId)) throw new Error('ID Mix không hợp lệ');
  let lastErr = null;
  for (const host of await mixInstances()) {
    try {
      const data = await fetchJson(`https://${host}/api/v1/mixes/${encodeURIComponent(mixId)}`);
      const tracks = normalizeTracks(data?.videos);
      if (tracks.length) return tracks;
      lastErr = new Error(host + ': danh sách rỗng');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('Không có máy chủ nào dùng được');
}

// ---------- Nạp thư viện trình phát (chỉ nạp một lần) ----------
// Promise này chỉ báo lỗi: 'blocked' khi trình duyệt / mạng chặn tải file,
// 'timeout' khi tải xong mà thư viện không báo sẵn sàng sau 15 giây.
// Thư viện báo sẵn sàng qua callback toàn cục riêng của nó.
function loadScript(src) {
  return new Promise((_, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onerror = () => reject(new Error('blocked'));
    s.onload = () => setTimeout(() => reject(new Error('timeout')), 15000);
    document.head.appendChild(s);
  });
}

// Giải thích vì sao phải dùng trình phát dự phòng
function fallbackReason(err, name) {
  if (err?.message === 'blocked') {
    return `Trình duyệt hoặc mạng đã chặn tải thư viện ${name}. Thường do tiện ích chặn quảng cáo, chế độ chống theo dõi nghiêm ngặt, hoặc mạng trường / công ty.`;
  }
  if (err?.message === 'timeout') return `Thư viện ${name} tải quá lâu không phản hồi.`;
  return `Trình phát ${name} gặp lỗi: ${err?.message || err}.`;
}

let ytPromise = null;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytPromise) {
    ytPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      loadScript('https://www.youtube.com/iframe_api').catch((e) => {
        if (!window.YT?.Player) {
          ytPromise = null;
          reject(e);
        }
      });
    });
  }
  return ytPromise;
}

let spPromise = null;
function loadSpotify() {
  if (!spPromise) {
    spPromise = new Promise((resolve, reject) => {
      window.onSpotifyIframeApiReady = (api) => resolve(api);
      loadScript('https://open.spotify.com/embed/iframe-api/v1').catch((e) => {
        spPromise = null;
        reject(e);
      });
    });
  }
  return spPromise;
}

// ---------- Trình phát ----------
const YT_ERRORS = {
  2: 'Link không hợp lệ (lỗi 2).',
  5: 'Video không phát được trên trình duyệt này (lỗi 5).',
  100: 'Video đã bị xoá hoặc để riêng tư (lỗi 100).',
  101: 'Chủ video không cho phát trên trang web khác (lỗi 101).',
  150: 'Chủ video không cho phát trên trang web khác (lỗi 150).',
  152: 'YouTube từ chối trình phát nhúng (lỗi 152).',
  153: 'YouTube không xác định được trang đang phát (lỗi 153). Hãy mở app bằng link web thay vì mở file trên máy.',
};
const PRESS_PLAY = 'Nếu nhạc chưa chạy, bấm nút ▶ ngay trong khung trình phát (trình duyệt có thể chặn tự phát).';
const MAX_SKIPS = 8;
// Sau khi một bài trong playlist / Mix kết thúc, đợi chừng này để YouTube tự chuyển bài tiếp.
const END_GRACE_MS = 3000;
// Bấm Bài tiếp / Bài trước mà YouTube không đổi bài trong chừng này thì chuyển link của app.
const NAV_WAIT_MS = 2500;
const LIST_END =
  'YouTube không cho chuyển tiếp trong danh sách này (đã hết số bài mà trình phát nhúng cho phép). ' +
  'Để nghe liền mạch, bấm "Tách thành từng bài" ở link Mix trong danh sách bên dưới, hoặc "Mở trên YouTube ↗".';
const MIX_SINGLE =
  'YouTube từ chối mở danh sách này trong trình phát nhúng, nên chỉ phát được bài đầu. ' +
  'Hãy bấm "Tách thành từng bài" ở link Mix trong danh sách bên dưới, hoặc thêm từng bài vào playlist của app.';
const SPLIT_CONFIRM =
  'Để tách Mix, app sẽ gửi ID của Mix này (không gửi gì khác) tới một máy chủ Invidious công cộng của bên thứ ba để lấy danh sách bài. Tiếp tục?';
const SPLIT_WAIT = '⏳ Đang lấy danh sách bài trong Mix... (có thể mất vài giây)';
const SPLIT_FAIL =
  '⚠️ Không tách được Mix: các máy chủ công cộng đang không phản hồi hoặc không hỗ trợ Mix. Hãy thử lại sau, hoặc thêm từng bài vào playlist.';

// Chỉ gửi origin khi chạy trên web thật; mở file trên máy thì không có origin.
const pageOrigin = () => (/^https?:$/.test(location.protocol) ? location.origin : null);

function ytBaseVars() {
  const vars = { autoplay: 1, playsinline: 1, rel: 0 };
  const origin = pageOrigin();
  if (origin) {
    vars.origin = origin;
    vars.widget_referrer = location.href;
  }
  return vars;
}

// Các cách khởi tạo trình phát, thử lần lượt cho đến khi YouTube chấp nhận một cách.
// Link Mix có cả ID bài và ID danh sách: thử gửi cả hai, rồi chỉ danh sách, rồi chỉ bài.
function ytConfigs(link) {
  const withList = { ...ytBaseVars(), listType: 'playlist', list: link.listId };
  const configs = [];
  if (link.videoId && link.listId) configs.push({ videoId: link.videoId, playerVars: withList });
  if (link.listId) configs.push({ playerVars: withList });
  if (link.videoId) configs.push({ videoId: link.videoId, playerVars: ytBaseVars() });
  return configs;
}

// Gắn trình phát vào host. events:
//   onPlaying(true | false | null khi không biết), onEnded(), onError(msg), onStatus(text)
// Trả về hàm dừng / gỡ trình phát.
function mountPlayer(host, link, events) {
  const state = { dead: false, destroy: () => {}, timer: 0, endTimer: 0, navTimer: 0, nav: () => false };
  const newBox = () => {
    const box = document.createElement('div');
    host.replaceChildren(box);
    return box;
  };
  events.onStatus('Đang tải trình phát...');

  const fallback = (src, title, err, name) => {
    if (state.dead) return;
    console.warn('[HọcVui] Dùng trình phát dự phòng:', err);
    host.replaceChildren(frame(src, title));
    events.onPlaying(null);
    events.onStatus(`Đang dùng trình phát dự phòng. ${fallbackReason(err, name)} ${PRESS_PLAY}`);
    events.onFallback?.();
  };

  if (link.kind === 'youtube') {
    loadYouTube()
      .then((YT) => mountYouTube(YT, newBox, link, events, state))
      .catch((err) => fallback(youtubeEmbedSrc(link), 'Trình phát YouTube', err, 'YouTube'));
  } else {
    const height = link.type === 'track' || link.type === 'episode' ? 152 : 352;
    host.style.setProperty('--mp-h', height + 'px');
    loadSpotify()
      .then((api) => mountSpotify(api, newBox(), link, height, events, state))
      .catch((err) => fallback(`https://open.spotify.com/embed/${link.type}/${link.id}`, 'Trình phát Spotify', err, 'Spotify'));
  }

  const cleanup = () => {
    state.dead = true;
    clearTimeout(state.timer);
    clearTimeout(state.endTimer);
    clearTimeout(state.navTimer);
    try {
      state.destroy();
    } catch {
      /* trình phát đã bị gỡ */
    }
    host.replaceChildren();
    host.style.removeProperty('--mp-h');
  };
  // Chuyển bài ngay trong danh sách của trình phát. Trả về false nếu không làm được.
  cleanup.nav = (dir) => state.nav(dir);
  return cleanup;
}

// Tạo trình phát YouTube, thử từng cấu hình. Mỗi lần thử dùng một khung mới vì
// lần thử trước có thể đã làm hỏng khung cũ. Nếu tất cả đều bị từ chối thì ném lỗi
// kèm ID đã gửi để dễ tìm nguyên nhân.
function createYouTubePlayer(YT, newBox, link, handlers) {
  let lastErr = null;
  for (const cfg of ytConfigs(link)) {
    try {
      const player = new YT.Player(newBox(), { width: '100%', height: '100%', ...cfg, events: handlers });
      return { player, full: Boolean(cfg.playerVars.list) };
    } catch (err) {
      lastErr = err;
      console.warn('[HọcVui] YouTube từ chối cấu hình', cfg, err);
    }
  }
  const ids = `bài: ${link.videoId ?? 'không có'}, danh sách: ${link.listId ?? 'không có'}`;
  throw new Error(`${lastErr?.message ?? 'không rõ'} (${ids})`);
}

function mountYouTube(YT, newBox, link, events, state) {
  if (state.dead) return;
  const S = YT.PlayerState;
  let ended = false;
  let skips = 0;
  let full = false; // true khi YouTube nhận cấu hình có danh sách (Mix / playlist)
  const playlistPos = (player) => {
    const list = player.getPlaylist?.() || [];
    return { list, idx: player.getPlaylistIndex?.() ?? 0 };
  };
  const finishTrack = () => {
    if (ended) return;
    ended = true;
    events.onEnded();
  };
  const playingLabel = (player) => {
    const { list, idx } = playlistPos(player);
    const title = player.getVideoData?.()?.title;
    const pos = full && list.length > 1 ? ` (bài ${idx + 1}/${list.length} của danh sách YouTube)` : '';
    return `Đang phát${title ? ': ' + title : ''}${pos}`;
  };
  const onState = (player, e) => {
    clearTimeout(state.timer);
    clearTimeout(state.endTimer);
    if ([S.UNSTARTED, S.BUFFERING, S.PLAYING].includes(e.data)) clearTimeout(state.navTimer);
    if (e.data === S.PLAYING) {
      skips = 0;
      events.onPlaying(true);
      events.onStatus(playingLabel(player));
    } else if (e.data === S.BUFFERING) events.onStatus('Đang tải bài...');
    else if (e.data === S.PAUSED) {
      events.onPlaying(false);
      events.onStatus('Đã tạm dừng');
    } else if (e.data === S.ENDED) {
      events.onPlaying(false);
      if (!full) finishTrack();
      // Playlist / Mix: YouTube tự phát bài tiếp (trạng thái đổi trong chưa đầy 1 giây).
      // Chỉ khi trình phát đứng yên đủ lâu mới coi là hết danh sách. Không dựa vào
      // getPlaylist() vì Mix thường không trả về danh sách.
      else state.endTimer = setTimeout(finishTrack, END_GRACE_MS);
    } else if (e.data === S.CUED || e.data === S.UNSTARTED) {
      state.timer = setTimeout(() => events.onStatus(PRESS_PLAY), 2500);
    }
  };
  const onError = (player, e) => {
    const msg = YT_ERRORS[e.data] || `YouTube báo lỗi khi phát (lỗi ${e.data}).`;
    // Trong Mix / playlist: bỏ qua bài bị chặn và phát bài tiếp theo trong danh sách
    const { list, idx } = playlistPos(player);
    const hasNext = list.length === 0 || idx < list.length - 1; // Mix không cho biết độ dài: cứ thử bài tiếp
    if (full && hasNext && skips < MAX_SKIPS) {
      skips++;
      events.onStatus(`Bỏ qua 1 bài: ${msg} Đang chuyển bài tiếp trong danh sách...`);
      player.nextVideo();
      return;
    }
    events.onError(msg);
  };
  const created = createYouTubePlayer(YT, newBox, link, {
    onReady: () => {
      events.onStatus('Trình phát đã sẵn sàng.');
      state.timer = setTimeout(() => events.onStatus(PRESS_PLAY), 2500);
    },
    onStateChange: (e) => onState(player, e),
    onError: (e) => onError(player, e),
  });
  const player = created.player;
  full = created.full;
  if (link.listId && !full) events.onWarn(MIX_SINGLE);
  state.nav = (dir) => {
    if (!full) return false;
    clearTimeout(state.navTimer);
    state.navTimer = setTimeout(() => events.onNavFail(dir), NAV_WAIT_MS);
    if (dir > 0) player.nextVideo();
    else player.previousVideo();
    return true;
  };
  state.destroy = () => {
    player.destroy?.();
  };
}

function mountSpotify(api, box, link, height, events, state) {
  if (state.dead) return;
  api.createController(box, { uri: `spotify:${link.type}:${link.id}`, width: '100%', height }, (ctrl) => {
    if (state.dead) {
      ctrl.destroy?.();
      return;
    }
    let ended = false;
    const single = link.type === 'track' || link.type === 'episode';
    ctrl.addListener('ready', () => {
      events.onStatus('Trình phát đã sẵn sàng.');
      ctrl.play?.();
      state.timer = setTimeout(() => events.onStatus(PRESS_PLAY + ' Muốn nghe cả bài thì cần đăng nhập Spotify trên trình duyệt này.'), 3000);
    });
    ctrl.addListener('playback_update', (e) => {
      const d = e.data || {};
      if (!d.isPaused) clearTimeout(state.timer);
      events.onPlaying(!d.isPaused);
      events.onStatus(d.isPaused ? 'Đã tạm dừng' : 'Đang phát');
      // Bài lẻ: hết bài thì chuyển link tiếp theo. Album / playlist Spotify tự phát trong khung.
      if (single && !ended && d.duration > 0 && d.position > 0 && d.duration - d.position < 1200) {
        ended = true;
        events.onEnded();
      }
    });
    state.destroy = () => {
      ctrl.destroy?.();
    };
  });
}

function frame(src, title) {
  const f = document.createElement('iframe');
  f.src = src;
  f.title = title;
  f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  return f;
}


// ---------- Bảng điều khiển ----------
const SRC_TAG = { spotify: '<span class="mp-src sp">Spotify</span>', youtube: '<span class="mp-src yt">YouTube</span>' };
const srcTag = (link) => SRC_TAG[link?.kind] || '';

// Lấy giá trị chuỗi từ form (FormData.get có thể trả về File)
const field = (f, key) => {
  const v = f.get(key);
  return typeof v === 'string' ? v : '';
};

const BAD_LINK = 'Link chưa đúng. Hãy dán link bài hát, album hoặc playlist từ Spotify, YouTube hoặc YouTube Music.';

export function createMusicPanel(root, { onPlaying = () => {} } = {}) {
  root.hidden = false;
  root.innerHTML = `
    <div class="mp-head">
      <b>🎧 Góc âm nhạc</b>
      <span class="muted">Dán link Spotify, YouTube hoặc YouTube Music</span>
    </div>
    ${
      location.protocol === 'file:'
        ? `<div class="mp-err">Bạn đang mở app từ file trên máy. YouTube và Spotify thường chặn phát nhạc trong trường hợp này.
           Hãy mở app tại <a href="https://hatuananh0405.github.io/hoc_vui/" target="_blank" rel="noopener">hatuananh0405.github.io/hoc_vui</a>.</div>`
        : ''
    }
    <div class="mp-player" hidden>
      <div class="mp-now"></div>
      <div class="mp-frame"></div>
      <div class="mp-status muted" aria-live="polite"></div>
      <div class="mp-msg" hidden></div>
      <div class="row">
        <button class="btn small" data-mp="prev">⏮ Bài trước</button>
        <button class="btn small" data-mp="next">Bài tiếp ⏭</button>
        <button class="btn small" data-mp="stop">⏹ Dừng</button>
        <button class="btn small" data-mp="retry">🔄 Thử lại</button>
      </div>
    </div>
    <div class="mp-body"></div>`;

  const playerEl = root.querySelector('.mp-player');
  const frameEl = root.querySelector('.mp-frame');
  const nowEl = root.querySelector('.mp-now');
  const msgEl = root.querySelector('.mp-msg');
  const statusEl = root.querySelector('.mp-status');
  const body = root.querySelector('.mp-body');

  let mode = 'list'; // 'list' | 'new' | 'save'
  let openId = store.getPlaylists()[0]?.id || null; // playlist đang mở rộng
  let renaming = null;
  let current = null; // { pid, index }
  let unmount = null;
  let error = '';
  let draft = {}; // giữ lại chữ đã gõ khi form báo lỗi
  let note = null; // thông báo ở đầu danh sách: { text, bad }
  let splitting = false; // đang tách Mix
  let msgTimer = 0;
  let gone = false;

  const currentItem = () => {
    const p = current && store.getPlaylist(current.pid);
    return p ? { p, item: p.items[current.index] } : null;
  };

  function showMsg(text) {
    msgEl.textContent = text;
    msgEl.hidden = !text;
  }

  function updateNow() {
    const c = currentItem();
    if (!c?.item) return;
    const link = parseMusicLink(c.item.url);
    const where = link?.kind === 'spotify' ? 'Spotify' : 'YouTube';
    const open = link ? ` · <a href="${esc(link.url)}" target="_blank" rel="noopener">Mở trên ${where} ↗</a>` : '';
    nowEl.innerHTML = `${srcTag(link)} <b>${esc(c.item.title)}</b>
      <span class="muted">· ${current.index + 1}/${c.p.items.length} · ${esc(c.p.name)}${open}</span>`;
  }

  function stopPlayer() {
    clearTimeout(msgTimer);
    statusEl.textContent = '';
    unmount?.();
    unmount = null;
    onPlaying(false);
  }

  function play(pid, index) {
    const p = store.getPlaylist(pid);
    if (!p?.items.length) return;
    current = { pid, index: ((index % p.items.length) + p.items.length) % p.items.length };
    const item = p.items[current.index];
    const link = parseMusicLink(item.url);
    stopPlayer();
    showMsg('');
    playerEl.hidden = false;
    updateNow();
    renderBody();
    if (!link) {
      showMsg(BAD_LINK);
      return;
    }
    unmount = mountPlayer(frameEl, link, {
      onPlaying: (v) => {
        if (!gone) onPlaying(v);
      },
      onStatus: (text) => {
        if (!gone) statusEl.textContent = text;
      },
      onEnded: () => {
        if (!gone) advance();
      },
      onWarn: (text) => {
        if (!gone) showMsg(text);
      },
      onNavFail: (dir) => {
        if (!gone) go(dir, 'list');
      },
      onError: (msg) => {
        if (gone) return;
        const many = (store.getPlaylist(pid)?.items.length || 0) > 1;
        showMsg(msg + (many ? ' Đang chuyển sang link tiếp theo...' : ''));
        if (many) msgTimer = setTimeout(() => step(1), 2500);
      },
    });
  }

  // Hết bài tự động: sang link kế tiếp, hết link cuối thì dừng (không quay lại bài đầu).
  function advance() {
    const p = current && store.getPlaylist(current.pid);
    if (p && current.index < p.items.length - 1) {
      step(1);
      return;
    }
    note = p ? { text: `✅ Đã phát hết playlist "${p.name}". Bấm ▶ Phát để nghe lại từ đầu.` } : null;
    stop();
  }

  // Bài tiếp / Bài trước: ưu tiên chuyển bài ngay trong playlist YouTube đang phát,
  // không được thì mới sang link khác của app.
  function navOrStep(d) {
    if (unmount?.nav?.(d)) return;
    go(d, 'link');
  }

  // Chuyển sang link kế / trước của playlist trong app. Hết đường thì báo, không quay vòng:
  // quay vòng với playlist chỉ có một link sẽ nạp lại đúng bài đầu.
  function go(d, what) {
    const p = current && store.getPlaylist(current.pid);
    const target = current ? current.index + d : -1;
    if (p && target >= 0 && target < p.items.length) {
      step(d);
      return;
    }
    if (what === 'list') showMsg(d > 0 ? LIST_END : 'Đây là bài đầu của danh sách YouTube.');
    else showMsg(d > 0 ? 'Đã là link cuối của playlist.' : 'Đây là link đầu của playlist.');
  }

  function step(d) {
    if (current) play(current.pid, current.index + d);
  }

  function stop() {
    stopPlayer();
    current = null;
    playerEl.hidden = true;
    renderBody();
  }

  // Thêm link vào playlist, tự lấy tên bài nếu có mạng
  function addLink(pid, link) {
    const item = { id: uid(), url: link.url, title: link.label };
    store.addPlaylistItem(pid, item);
    void fetchTitle(link).then((t) => {
      if (!t || gone) return;
      store.setItemTitle(pid, item.id, t);
      renderBody();
      updateNow();
    });
    return item;
  }

  function renderBody() {
    if (gone) return;
    const lists = store.getPlaylists();
    const err = error ? `<div class="mp-err">${esc(error)}</div>` : '';
    const noteHtml = note ? `<div class="mp-note${note.bad ? ' bad' : ''}">${esc(note.text)}</div>` : '';
    if (mode === 'new') {
      body.innerHTML = `
        <form class="mp-form" data-form="new">
          <b>Tạo playlist mới</b>
          <label>Tên playlist<input name="name" maxlength="60" required placeholder="Ví dụ: Nhạc học bài" value="${esc(draft.name || '')}"></label>
          <label>Link nhạc (không bắt buộc, mỗi dòng một link)
            <textarea name="links" rows="3" placeholder="https://open.spotify.com/track/...&#10;https://music.youtube.com/watch?v=...">${esc(draft.links || '')}</textarea></label>
          ${err}
          <div class="row"><button class="btn primary small">Tạo playlist</button><button type="button" class="btn small" data-mp="cancel">Huỷ</button></div>
        </form>`;
      body.querySelector('input').focus();
      return;
    }
    if (mode === 'save') {
      body.innerHTML = `
        <form class="mp-form" data-form="save">
          <b>Lưu playlist có sẵn từ link</b>
          <label>Link playlist hoặc album<input name="url" required placeholder="https://open.spotify.com/playlist/... hoặc https://music.youtube.com/playlist?list=..." value="${esc(draft.url || '')}"></label>
          <label>Đặt tên (bỏ trống thì lấy tên gốc)<input name="name" maxlength="60" placeholder="Ví dụ: Lo-fi buổi tối" value="${esc(draft.name || '')}"></label>
          ${err}
          <div class="row"><button class="btn primary small">Lưu playlist</button><button type="button" class="btn small" data-mp="cancel">Huỷ</button></div>
        </form>`;
      body.querySelector('input').focus();
      return;
    }
    body.innerHTML = `
      ${noteHtml}
      <div class="row">
        <button class="btn small primary" data-mp="new">＋ Tạo playlist</button>
        <button class="btn small" data-mp="save">🔗 Lưu playlist từ link</button>
      </div>
      ${
        lists.length
          ? lists.map((p) => renderPlaylist(p, err)).join('')
          : '<p class="muted mp-empty">Chưa có playlist nào. Tạo playlist rồi thêm link bài hát, hoặc lưu luôn một playlist có sẵn trên Spotify / YouTube Music.</p>'
      }`;
    const focus = body.querySelector('.mp-rename input');
    if (focus) focus.select();
  }

  function renderPlaylistHead(p, open) {
    if (renaming === p.id) {
      return `<form class="mp-rename" data-form="rename" data-id="${p.id}">
          <input name="name" maxlength="60" required value="${esc(p.name)}">
          <button class="btn small primary">Lưu</button><button type="button" class="btn small" data-mp="cancel">Huỷ</button>
        </form>`;
    }
    const arrow = open ? '▾' : '▸';
    const disabled = p.items.length ? '' : 'disabled';
    return `<button class="mp-pl-name" data-mp="toggle" data-id="${p.id}" aria-expanded="${open}">${arrow} 📀 ${esc(p.name)}
        <small class="muted">${p.items.length} link</small></button>
      <div class="row">
        <button class="btn small primary" data-mp="play" data-id="${p.id}" ${disabled}>▶ Phát</button>
        <button class="btn small" data-mp="rename" data-id="${p.id}" title="Đổi tên">✏️</button>
        <button class="btn small danger" data-mp="del" data-id="${p.id}" title="Xoá playlist">🗑</button>
      </div>`;
  }

  function renderItem(p, it, i) {
    const on = current?.pid === p.id && current.index === i;
    const icon = on ? '🔊' : '▶';
    const link = parseMusicLink(it.url);
    const split = link?.mix ? `<button class="link" data-mp="split" data-id="${p.id}" data-item="${it.id}">Tách thành từng bài</button>` : '';
    return `<li class="${on ? 'on' : ''}">
        <button class="mp-item" data-mp="playItem" data-id="${p.id}" data-i="${i}">${icon} ${srcTag(link)} ${esc(it.title)}</button>
        <span class="mp-actions">${split}<button class="link danger" data-mp="delItem" data-id="${p.id}" data-item="${it.id}">Xoá</button></span>
      </li>`;
  }

  function renderPlaylist(p, err) {
    const open = p.id === openId;
    const head = `<div class="mp-pl-head">${renderPlaylistHead(p, open)}</div>`;
    if (!open) return `<div class="mp-pl">${head}</div>`;
    const items = p.items.map((it, i) => renderItem(p, it, i)).join('');
    return `<div class="mp-pl">${head}
        <ol class="mp-items">${items}</ol>
        <form class="mp-add" data-form="add" data-id="${p.id}">
          <input name="url" placeholder="Dán link bài hát, album hoặc playlist" aria-label="Link nhạc" value="${esc(draft.addUrl || '')}">
          <button class="btn small">＋ Thêm</button>
        </form>${err}</div>`;
  }

  const showMode = (m) => {
    mode = m;
    renaming = null;
    renderBody();
  };

  // Các nút bấm trong bảng nhạc (data-mp="...")
  const ACTIONS = {
    prev: () => navOrStep(-1),
    retry: () => step(0),
    next: () => navOrStep(1),
    stop: () => stop(),
    play: (d) => {
      openId = d.id;
      play(d.id, 0);
    },
    playItem: (d) => play(d.id, Number(d.i)),
    del: (d) => deleteList(d.id),
    delItem: (d) => deleteItem(d.id, d.item),
    split: (d) => {
      void splitMix(d.id, d.item);
    },
    new: () => showMode('new'),
    save: () => showMode('save'),
    cancel: () => showMode('list'),
    toggle: (d) => {
      openId = openId === d.id ? null : d.id;
      renderBody();
    },
    rename: (d) => {
      renaming = d.id;
      renderBody();
    },
  };
  const PLAYER_ACTIONS = new Set(['prev', 'next', 'stop', 'retry']);

  function onClick(e) {
    const el = e.target.closest('[data-mp]');
    const action = el && ACTIONS[el.dataset.mp];
    if (!action) return;
    error = '';
    note = null;
    if (!PLAYER_ACTIONS.has(el.dataset.mp)) draft = {};
    action(el.dataset);
  }

  // Thay link Mix bằng từng bài trong Mix. Bài nào bị chặn nhúng sẽ được bỏ qua khi phát.
  async function splitMix(pid, itemId) {
    const item = store.getPlaylist(pid)?.items.find((x) => x.id === itemId);
    const link = item && parseMusicLink(item.url);
    if (!link?.mix || splitting || !confirm(SPLIT_CONFIRM)) return;
    splitting = true;
    note = { text: SPLIT_WAIT };
    renderBody();
    try {
      const tracks = await fetchMixTracks(link.listId);
      if (gone) return;
      applySplit(pid, itemId, tracks);
    } catch (err) {
      if (gone) return;
      console.warn('[HọcVui] Không tách được Mix:', err);
      note = { text: SPLIT_FAIL, bad: true };
    } finally {
      splitting = false;
    }
    renderBody();
  }

  function applySplit(pid, itemId, tracks) {
    if (current?.pid === pid) stop();
    const items = tracks.map((t) => ({ id: uid(), url: `https://www.youtube.com/watch?v=${t.videoId}`, title: t.title }));
    store.replacePlaylistItem(pid, itemId, items);
    openId = pid;
    note = { text: `✅ Đã tách Mix thành ${items.length} bài. Bấm ▶ Phát để nghe lần lượt.` };
  }

  function deleteList(id) {
    const p = store.getPlaylist(id);
    if (!p || !confirm(`Xoá playlist "${p.name}"?`)) return;
    if (current?.pid === id) stop();
    store.deletePlaylist(id);
    renderBody();
  }

  function deleteItem(id, itemId) {
    const p = store.getPlaylist(id);
    const idx = p ? p.items.findIndex((x) => x.id === itemId) : -1;
    if (idx < 0) return;
    store.removePlaylistItem(id, itemId);
    if (current?.pid === id) {
      if (idx === current.index) stop();
      else if (idx < current.index) current.index--;
      updateNow();
    }
    renderBody();
  }

  // Báo link sai nhưng giữ nguyên chữ đã gõ trong form
  function failLink() {
    error = BAD_LINK;
    renderBody();
  }

  function done(pid) {
    if (pid) openId = pid;
    mode = 'list';
    renaming = null;
    draft = {};
    renderBody();
  }

  function submitNew(f) {
    const name = field(f, 'name').trim();
    if (!name) return;
    const links = field(f, 'links').split(/\s+/).filter(Boolean).map(parseMusicLink);
    if (links.some((l) => !l)) {
      failLink();
      return;
    }
    const p = { id: uid(), name, createdAt: Date.now(), items: [] };
    store.addPlaylist(p);
    links.forEach((l) => addLink(p.id, l));
    done(p.id);
  }

  function submitSave(f) {
    const name = field(f, 'name').trim();
    const link = parseMusicLink(field(f, 'url'));
    if (!link) {
      failLink();
      return;
    }
    const p = { id: uid(), name: name || link.label, createdAt: Date.now(), items: [] };
    store.addPlaylist(p);
    addLink(p.id, link);
    if (!name) {
      // Không đặt tên thì lấy tên gốc của playlist
      void fetchTitle(link).then((t) => {
        if (!t || gone) return;
        store.renamePlaylist(p.id, t.slice(0, 60));
        renderBody();
        updateNow();
      });
    }
    done(p.id);
  }

  function submitRename(f, form) {
    const name = field(f, 'name').trim();
    if (name) store.renamePlaylist(form.dataset.id, name);
    done();
    updateNow();
  }

  function submitAdd(f, form) {
    const link = parseMusicLink(field(f, 'url'));
    if (link) {
      addLink(form.dataset.id, link);
      draft = {};
    } else error = BAD_LINK;
    renderBody();
    body.querySelector('.mp-add input')?.focus();
  }

  const SUBMITS = { new: submitNew, save: submitSave, rename: submitRename, add: submitAdd };

  function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    const handler = form && SUBMITS[form.dataset.form];
    if (!handler) return;
    e.preventDefault();
    const f = new FormData(form);
    error = '';
    draft = {
      name: field(f, 'name'),
      links: field(f, 'links'),
      url: field(f, 'url'),
      addUrl: form.dataset.form === 'add' ? field(f, 'url') : '',
    };
    handler(f, form);
  }

  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  renderBody();

  return {
    destroy() {
      gone = true;
      stopPlayer();
      root.removeEventListener('click', onClick);
      root.removeEventListener('submit', onSubmit);
      root.innerHTML = '';
      root.hidden = true;
    },
  };
}
