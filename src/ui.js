// DOM overlay: HUD + screens. Game logic calls these; nothing here knows about Three.js.

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, cls, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  return e;
}

export class UI {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="loading" class="screen show">
        <h1 class="logo">HUSH</h1>
        <div class="bar"><div class="fill"></div></div>
        <p class="small">loading the house…</p>
      </div>

      <div id="title" class="screen">
        <h1 class="logo">HUSH</h1>
        <p class="tagline">there is nothing here.</p>
        <div class="buttons">
          <button data-act="start">Begin</button>
        </div>
        <div class="controls">
          <span><b>Mouse</b> look</span><span><b>WASD</b> move</span><span><b>E / Click</b> interact</span>
          <span><b>F</b> flashlight</span><span><b>Hold Space</b> breathe</span><span><b>Esc</b> pause</span>
        </div>
        <p class="small loops"></p>
        <p class="small">Headphones recommended.</p>
      </div>

      <div id="intro" class="screen">
        <div class="intro-text">
          <p>14 Hollow Lane.</p>
          <p>Empty for years.</p>
          <p>Routine job: inspect it before Monday's sale.</p>
        </div>
        <p class="small hint">click to enter</p>
      </div>

      <div id="pause" class="screen">
        <h2>Paused</h2>
        <div class="buttons">
          <button data-act="resume">Resume</button>
          <button data-act="restart">Restart</button>
          <button data-act="title">Quit to title</button>
        </div>
        <div class="controls">
          <span><b>WASD</b> move</span><span><b>E / Click</b> interact</span>
          <span><b>F</b> flashlight</span><span><b>Hold Space</b> breathe</span>
        </div>
      </div>

      <div id="end" class="screen">
        <div class="end-text"></div>
        <div class="buttons">
          <button data-act="again">Play again</button>
          <button data-act="title">Title</button>
        </div>
      </div>

      <div id="story" class="story"></div>

      <div id="hud">
        <div class="clipboard">
          <div class="clip"></div>
          <div class="head">14 HOLLOW LANE — INSPECTION</div>
          <ul class="checklist"></ul>
        </div>
        <div class="fear"><div class="heart">♥</div><div class="meter"><div class="fill"></div></div></div>
        <div class="battery"><div class="cell"><div class="fill"></div></div><span>BATTERY</span></div>
        <div class="inventory"></div>
        <div class="crosshair"></div>
        <div class="prompt"></div>
        <div class="message"></div>
        <div class="hint-bar"></div>
      </div>

      <div id="inspect" class="inspect">
        <div class="card">
          <h3></h3>
          <div class="text"></div>
          <p class="small">E / Click to put it down</p>
        </div>
      </div>
    `;
    this.actions = {};
    root.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (act && this.actions[act]) {
        e.stopPropagation();
        this.actions[act]();
      }
    });
    this.msgTimer = null;
    this.hintTimer = null;
  }

  on(act, fn) {
    this.actions[act] = fn;
  }

  setLoading(p) {
    $('#loading .fill', this.root).style.width = `${Math.round(p * 100)}%`;
  }

  show(id) {
    for (const s of this.root.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
  }

  hud(visible) {
    $('#hud', this.root).classList.toggle('show', visible);
  }

  setLoops(n) {
    $('#title .loops', this.root).textContent = n > 0 ? `tally marks: ${n + 23}` : '';
  }

  setChecklist(items) {
    const ul = $('.checklist', this.root);
    ul.innerHTML = '';
    let currentShown = false;
    items.forEach((it) => {
      const li = el('li', it.done ? 'done' : '');
      if (!it.done && !currentShown) {
        li.classList.add('current');
        currentShown = true;
      }
      if (it.ghost) li.classList.add('ghost');
      li.innerHTML = `<span class="box">${it.done ? '✓' : ''}</span><span class="txt">${it.text}</span>`;
      ul.appendChild(li);
    });
  }

  // HUD values are written only when they change: touching the DOM every frame
  // forces style recalculation on the main thread.
  changed(key, value) {
    this.cache ??= {};
    if (this.cache[key] === value) return false;
    this.cache[key] = value;
    return true;
  }

  setFear(v, pulse) {
    const f = $('.fear', this.root);
    const w = Math.round(v);
    if (this.changed('fear', w)) {
      $('.fear .fill', this.root).style.width = `${w}%`;
      f.classList.toggle('high', v >= 75);
    }
    const p = pulse.toFixed(1);
    if (this.changed('pulse', p)) f.style.setProperty('--pulse', p);
  }

  setBattery(v, visible) {
    const b = $('.battery', this.root);
    const w = Math.round(v);
    if (!this.changed('battery', `${w}|${visible}`)) return;
    b.classList.toggle('show', visible);
    $('.battery .fill', this.root).style.width = `${w}%`;
    b.classList.toggle('low', v < 20);
  }

  setInventory(list) {
    $('.inventory', this.root).innerHTML = list.map((i) => `<span>${i}</span>`).join('');
  }

  setPrompt(text) {
    if (!this.changed('prompt', text ?? '')) return;
    const p = $('.prompt', this.root);
    p.textContent = text ?? '';
    $('.crosshair', this.root).classList.toggle('active', !!text);
  }

  message(text, seconds = 3.5) {
    const m = $('.message', this.root);
    m.textContent = text;
    m.classList.add('show');
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => m.classList.remove('show'), seconds * 1000);
  }

  hint(text, seconds = 6) {
    const h = $('.hint-bar', this.root);
    h.innerHTML = text;
    h.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => h.classList.remove('show'), seconds * 1000);
  }

  inspect(title, text, handwritten = false) {
    const box = $('#inspect', this.root);
    $('h3', box).textContent = title;
    const t = $('.text', box);
    t.innerHTML = text;
    t.classList.toggle('hand', handwritten);
    box.classList.add('show');
  }

  closeInspect() {
    $('#inspect', this.root).classList.remove('show');
  }

  // Large centered story text (endings). cls: 'light' for dark text on white.
  story(html, cls = '') {
    const s = $('#story', this.root);
    s.className = `story ${cls}`;
    s.innerHTML = html;
    requestAnimationFrame(() => s.classList.add('show'));
  }

  clearStory() {
    $('#story', this.root).classList.remove('show');
  }

  endScreen(html) {
    $('#end .end-text', this.root).innerHTML = html;
    this.show('end');
  }
}
