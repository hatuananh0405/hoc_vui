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

// ---------- Nạp thư viện trình phát (chỉ nạp một lần) ----------
// Promise này chỉ báo lỗi (mạng hỏng hoặc thư viện không báo sẵn sàng sau 8 giây).
// Thư viện báo sẵn sàng qua callback toàn cục riêng của nó.
function loadScript(src) {
  return new Promise((_, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onerror = () => reject(new Error('Không tải được ' + src));
    document.head.appendChild(s);
    s.onload = () => setTimeout(() => reject(new Error('timeout')), 8000);
  });
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
// Gắn trình phát vào host. events: onPlaying(true | false | null khi không biết), onEnded(), onError(msg).
// Trả về hàm dừng / gỡ trình phát.
function mountPlayer(host, link, events) {
  let dead = false;
  let destroy = () => {};
  const box = document.createElement('div');
  host.replaceChildren(box);

  if (link.kind === 'youtube') {
    loadYouTube()
      .then((YT) => {
        if (dead) return;
        let ended = false;
        const player = new YT.Player(box, {
          width: '100%',
          height: '100%',
          videoId: link.videoId || undefined,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, ...(link.listId ? { listType: 'playlist', list: link.listId } : {}) },
          events: {
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.PLAYING) events.onPlaying(true);
              else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) events.onPlaying(false);
              if (e.data !== YT.PlayerState.ENDED || ended) return;
              // Playlist YouTube tự phát bài tiếp; chỉ chuyển link khi đã hết bài cuối.
              const list = link.listId ? player.getPlaylist?.() : null;
              const idx = link.listId ? player.getPlaylistIndex?.() : 0;
              if (!list || idx >= list.length - 1) {
                ended = true;
                events.onEnded();
              }
            },
            onError: (e) => {
              const msg = { 2: 'Link không hợp lệ.', 5: 'Video không phát được trên trình duyệt này.', 100: 'Video đã bị xoá hoặc để riêng tư.', 101: 'Chủ video không cho phát nhúng.', 150: 'Chủ video không cho phát nhúng.' }[e.data];
              // Một số playlist tự động của YouTube (Mix) không phát nhúng được khi thiếu video bắt đầu
              const mixHint = link.listId?.startsWith('RD') && !link.videoId ? ' Đây là Mix tự động của YouTube, hãy mở một bài trong Mix rồi dán link bài đó.' : '';
              events.onError((msg || 'YouTube báo lỗi khi phát.') + mixHint);
            },
          },
        });
        destroy = () => {
          player.destroy?.();
        };
      })
      .catch(() => {
        if (dead) return;
        // Không tải được thư viện: dùng iframe thường, vẫn nghe được nhưng không tự chuyển bài.
        box.replaceWith(frame(youtubeEmbedSrc(link), 'Trình phát YouTube'));
        events.onPlaying(null);
      });
  } else {
    const height = link.type === 'track' || link.type === 'episode' ? 152 : 352;
    host.style.setProperty('--mp-h', height + 'px');
    loadSpotify()
      .then((api) => {
        if (dead) return;
        api.createController(box, { uri: `spotify:${link.type}:${link.id}`, width: '100%', height }, (ctrl) => {
          if (dead) {
            ctrl.destroy?.();
            return;
          }
          let ended = false;
          ctrl.addListener('playback_update', (e) => {
            const d = e.data || {};
            events.onPlaying(!d.isPaused);
            // Bài lẻ: hết bài thì chuyển link tiếp theo. Album / playlist Spotify tự phát trong khung.
            const single = link.type === 'track' || link.type === 'episode';
            if (single && !ended && d.duration > 0 && d.position > 0 && d.duration - d.position < 1200) {
              ended = true;
              events.onEnded();
            }
          });
          ctrl.addListener('ready', () => {
            ctrl.play?.();
          });
          destroy = () => {
            ctrl.destroy?.();
          };
        });
      })
      .catch(() => {
        if (dead) return;
        box.replaceWith(frame(`https://open.spotify.com/embed/${link.type}/${link.id}`, 'Trình phát Spotify'));
        events.onPlaying(null);
      });
  }

  return () => {
    dead = true;
    try {
      destroy();
    } catch {
      /* trình phát đã bị gỡ */
    }
    host.replaceChildren();
    host.style.removeProperty('--mp-h');
  };
}

function frame(src, title) {
  const f = document.createElement('iframe');
  f.src = src;
  f.title = title;
  f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  f.loading = 'lazy';
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
    <div class="mp-player" hidden>
      <div class="mp-now"></div>
      <div class="mp-frame"></div>
      <div class="mp-msg" hidden></div>
      <div class="row">
        <button class="btn small" data-mp="prev">⏮ Bài trước</button>
        <button class="btn small" data-mp="next">Bài tiếp ⏭</button>
        <button class="btn small" data-mp="stop">⏹ Dừng</button>
      </div>
    </div>
    <div class="mp-body"></div>`;

  const playerEl = root.querySelector('.mp-player');
  const frameEl = root.querySelector('.mp-frame');
  const nowEl = root.querySelector('.mp-now');
  const msgEl = root.querySelector('.mp-msg');
  const body = root.querySelector('.mp-body');

  let mode = 'list'; // 'list' | 'new' | 'save'
  let openId = store.getPlaylists()[0]?.id || null; // playlist đang mở rộng
  let renaming = null;
  let current = null; // { pid, index }
  let unmount = null;
  let error = '';
  let draft = {}; // giữ lại chữ đã gõ khi form báo lỗi
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
    nowEl.innerHTML = `${srcTag(parseMusicLink(c.item.url))} <b>${esc(c.item.title)}</b>
      <span class="muted">· ${current.index + 1}/${c.p.items.length} · ${esc(c.p.name)}</span>`;
  }

  function stopPlayer() {
    clearTimeout(msgTimer);
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
      onEnded: () => {
        if (!gone) step(1);
      },
      onError: (msg) => {
        if (gone) return;
        const many = (store.getPlaylist(pid)?.items.length || 0) > 1;
        showMsg(msg + (many ? ' Đang chuyển sang link tiếp theo...' : ''));
        if (many) msgTimer = setTimeout(() => step(1), 2500);
      },
    });
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
    return `<li class="${on ? 'on' : ''}">
        <button class="mp-item" data-mp="playItem" data-id="${p.id}" data-i="${i}">${icon} ${srcTag(parseMusicLink(it.url))} ${esc(it.title)}</button>
        <button class="link danger" data-mp="delItem" data-id="${p.id}" data-item="${it.id}">Xoá</button>
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
    prev: () => step(-1),
    next: () => step(1),
    stop: () => stop(),
    play: (d) => {
      openId = d.id;
      play(d.id, 0);
    },
    playItem: (d) => play(d.id, Number(d.i)),
    del: (d) => deleteList(d.id),
    delItem: (d) => deleteItem(d.id, d.item),
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
  const PLAYER_ACTIONS = new Set(['prev', 'next', 'stop']);

  function onClick(e) {
    const el = e.target.closest('[data-mp]');
    const action = el && ACTIONS[el.dataset.mp];
    if (!action) return;
    error = '';
    if (!PLAYER_ACTIONS.has(el.dataset.mp)) draft = {};
    action(el.dataset);
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
