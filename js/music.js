// Góc âm nhạc: lưu playlist, đặt tên, thêm link nhạc và phát bằng trình phát nhúng
// của Spotify hoặc YouTube / YouTube Music. Không cần đăng nhập vào app.
// - Spotify: ai đang đăng nhập Spotify trên trình duyệt nghe được cả bài, chưa đăng nhập thì nghe đoạn 30 giây.
// - YouTube / YouTube Music: phát bằng YouTube IFrame Player API, tự chuyển bài khi hết.
import { esc, uid } from './util.js';
import * as store from './store.js';

const SPOTIFY_TYPES = { track: 'Bài hát', album: 'Album', playlist: 'Playlist', episode: 'Tập podcast', show: 'Podcast', artist: 'Nghệ sĩ' };
const YT_HOSTS = ['youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'];

// ---------- Nhận diện link ----------
// Trả về null nếu không phải link Spotify / YouTube hợp lệ. Chỉ giữ lại ID đã kiểm tra,
// URL phát nhạc luôn được dựng lại từ ID nên không chèn được nội dung lạ.
export function parseMusicLink(raw) {
  const s = String(raw || '').trim();
  const uri = s.match(/^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,40})$/);
  if (uri) return spotify(uri[1], uri[2]);
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  if (host === 'open.spotify.com') {
    const parts = u.pathname.split('/').filter((p) => p && !/^intl-/i.test(p) && p !== 'embed');
    const [type, id] = parts;
    return SPOTIFY_TYPES[type] && /^[A-Za-z0-9]{10,40}$/.test(id || '') ? spotify(type, id) : null;
  }
  if (YT_HOSTS.includes(host)) {
    let v = null;
    if (host === 'youtu.be') v = u.pathname.slice(1).split('/')[0];
    else if (u.pathname === '/watch') v = u.searchParams.get('v');
    else v = (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/) || [])[1] || null;
    const list = u.searchParams.get('list');
    const videoId = v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null;
    const listId = list && /^[A-Za-z0-9_-]{10,64}$/.test(list) ? list : null;
    if (!videoId && !listId) return null;
    return {
      kind: 'youtube',
      videoId,
      listId,
      label: videoId ? 'Video YouTube' : 'Playlist YouTube',
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}${listId ? `&list=${listId}` : ''}` : `https://www.youtube.com/playlist?list=${listId}`,
    };
  }
  return null;
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
              events.onError(msg || 'YouTube báo lỗi khi phát.');
            },
          },
        });
        destroy = () => player.destroy?.();
      })
      .catch(() => {
        if (dead) return;
        // Không tải được thư viện: dùng iframe thường, vẫn nghe được nhưng không tự chuyển bài.
        const src = link.videoId
          ? `https://www.youtube.com/embed/${link.videoId}?autoplay=1&playsinline=1${link.listId ? `&list=${link.listId}` : ''}`
          : `https://www.youtube.com/embed/videoseries?list=${link.listId}&autoplay=1&playsinline=1`;
        box.replaceWith(frame(src, 'Trình phát YouTube'));
        events.onPlaying(null);
      });
  } else {
    const height = link.type === 'track' || link.type === 'episode' ? 152 : 352;
    host.style.setProperty('--mp-h', height + 'px');
    loadSpotify()
      .then((api) => {
        if (dead) return;
        api.createController(box, { uri: `spotify:${link.type}:${link.id}`, width: '100%', height }, (ctrl) => {
          if (dead) return ctrl.destroy?.();
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
          ctrl.addListener('ready', () => ctrl.play?.());
          destroy = () => ctrl.destroy?.();
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
const srcTag = (link) =>
  link?.kind === 'spotify' ? '<span class="mp-src sp">Spotify</span>' : link?.kind === 'youtube' ? '<span class="mp-src yt">YouTube</span>' : '';

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
    if (!p || !p.items.length) return;
    current = { pid, index: ((index % p.items.length) + p.items.length) % p.items.length };
    const item = p.items[current.index];
    const link = parseMusicLink(item.url);
    stopPlayer();
    showMsg('');
    playerEl.hidden = false;
    updateNow();
    renderBody();
    if (!link) return showMsg(BAD_LINK);
    unmount = mountPlayer(frameEl, link, {
      onPlaying: (v) => !gone && onPlaying(v),
      onEnded: () => !gone && step(1),
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
    fetchTitle(link).then((t) => {
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
          <label>Tên playlist<input name="name" maxlength="60" required placeholder="Ví dụ: Nhạc học bài"></label>
          <label>Link nhạc (không bắt buộc, mỗi dòng một link)
            <textarea name="links" rows="3" placeholder="https://open.spotify.com/track/...&#10;https://music.youtube.com/watch?v=..."></textarea></label>
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
          <label>Link playlist hoặc album<input name="url" required placeholder="https://open.spotify.com/playlist/... hoặc https://music.youtube.com/playlist?list=..."></label>
          <label>Đặt tên (bỏ trống thì lấy tên gốc)<input name="name" maxlength="60" placeholder="Ví dụ: Lo-fi buổi tối"></label>
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

  function renderPlaylist(p, err) {
    const open = p.id === openId;
    const head =
      renaming === p.id
        ? `<form class="mp-rename" data-form="rename" data-id="${p.id}">
             <input name="name" maxlength="60" required value="${esc(p.name)}">
             <button class="btn small primary">Lưu</button><button type="button" class="btn small" data-mp="cancel">Huỷ</button>
           </form>`
        : `<button class="mp-pl-name" data-mp="toggle" data-id="${p.id}" aria-expanded="${open}">${open ? '▾' : '▸'} 📀 ${esc(p.name)}
             <small class="muted">${p.items.length} link</small></button>
           <div class="row">
             <button class="btn small primary" data-mp="play" data-id="${p.id}" ${p.items.length ? '' : 'disabled'}>▶ Phát</button>
             <button class="btn small" data-mp="rename" data-id="${p.id}" title="Đổi tên">✏️</button>
             <button class="btn small danger" data-mp="del" data-id="${p.id}" title="Xoá playlist">🗑</button>
           </div>`;
    const items = open
      ? `<ol class="mp-items">${p.items
          .map((it, i) => {
            const on = current?.pid === p.id && current.index === i;
            return `<li class="${on ? 'on' : ''}">
              <button class="mp-item" data-mp="playItem" data-id="${p.id}" data-i="${i}">${on ? '🔊' : '▶'} ${srcTag(parseMusicLink(it.url))} ${esc(it.title)}</button>
              <button class="link danger" data-mp="delItem" data-id="${p.id}" data-item="${it.id}">Xoá</button>
            </li>`;
          })
          .join('')}</ol>
         <form class="mp-add" data-form="add" data-id="${p.id}">
           <input name="url" placeholder="Dán link bài hát, album hoặc playlist" aria-label="Link nhạc">
           <button class="btn small">＋ Thêm</button>
         </form>${err}`
      : '';
    return `<div class="mp-pl">${`<div class="mp-pl-head">${head}</div>`}${items}</div>`;
  }

  function onClick(e) {
    const el = e.target.closest('[data-mp]');
    if (!el) return;
    const { mp, id, i, item } = el.dataset;
    error = '';
    switch (mp) {
      case 'prev': return step(-1);
      case 'next': return step(1);
      case 'stop': return stop();
      case 'new':
      case 'save':
        mode = mp;
        return renderBody();
      case 'cancel':
        mode = 'list';
        renaming = null;
        return renderBody();
      case 'toggle':
        openId = openId === id ? null : id;
        return renderBody();
      case 'play':
        openId = id;
        return play(id, 0);
      case 'playItem':
        return play(id, Number(i));
      case 'rename':
        renaming = id;
        return renderBody();
      case 'del': {
        const p = store.getPlaylist(id);
        if (!p || !confirm(`Xoá playlist "${p.name}"?`)) return;
        if (current?.pid === id) stop();
        store.deletePlaylist(id);
        return renderBody();
      }
      case 'delItem': {
        const p = store.getPlaylist(id);
        const idx = p ? p.items.findIndex((x) => x.id === item) : -1;
        if (idx < 0) return;
        store.removePlaylistItem(id, item);
        if (current?.pid === id) {
          if (idx === current.index) stop();
          else if (idx < current.index) current.index--;
          updateNow();
        }
        return renderBody();
      }
    }
  }

  function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const f = new FormData(form);
    const name = String(f.get('name') || '').trim();
    error = '';

    if (form.dataset.form === 'new') {
      if (!name) return;
      const lines = String(f.get('links') || '').split(/\s+/).filter(Boolean);
      const links = lines.map(parseMusicLink);
      if (links.some((l) => !l)) {
        error = BAD_LINK;
        return renderBody();
      }
      const p = { id: uid(), name, createdAt: Date.now(), items: [] };
      store.addPlaylist(p);
      links.forEach((l) => addLink(p.id, l));
      openId = p.id;
      mode = 'list';
    } else if (form.dataset.form === 'save') {
      const link = parseMusicLink(f.get('url'));
      if (!link) {
        error = BAD_LINK;
        return renderBody();
      }
      const p = { id: uid(), name: name || link.label, createdAt: Date.now(), items: [] };
      store.addPlaylist(p);
      addLink(p.id, link);
      if (!name) {
        // Lấy tên gốc của playlist làm tên nếu người dùng không đặt
        fetchTitle(link).then((t) => {
          if (!t || gone) return;
          store.renamePlaylist(p.id, t.slice(0, 60));
          renderBody();
          updateNow();
        });
      }
      openId = p.id;
      mode = 'list';
    } else if (form.dataset.form === 'rename') {
      if (name) store.renamePlaylist(form.dataset.id, name);
      renaming = null;
      updateNow();
    } else if (form.dataset.form === 'add') {
      const link = parseMusicLink(f.get('url'));
      if (!link) {
        error = BAD_LINK;
        renderBody();
        return body.querySelector('.mp-add input')?.focus();
      }
      addLink(form.dataset.id, link);
      renderBody();
      return body.querySelector('.mp-add input')?.focus();
    }
    renderBody();
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
