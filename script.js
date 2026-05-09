// ============================================================
//  VKDJ Hex Pad — script.js
// ============================================================

// ---- Pad definitions ------------------------------------------------
const padKeys  = ["a","s","d","f","g","h","j","k","l","c","v","b"];
const padNames = {
  a:"Bass Drum", s:"Snare",     d:"Cross Stick", f:"Hi Tom",
  g:"Low Tom",   h:"Floor Tom", j:"Hi-Hat ✕",    k:"Hi-Hat ○",
  l:"Hi-Hat Foot", c:"Ride",   v:"Crash",        b:"—",
};

// ---- Hex geometry (flat-top) ----------------------------------------
const R   = 55;
const HW  = R * 2;               // bounding-box width  110 px
const HH  = R * Math.sqrt(3);    // bounding-box height ≈95.26 px
const SEP = 8;                   // gap between adjacent hex edges

// Flat-top clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)
// Vertex fractions [x, y] of (HW, HH):
const HEX_VERTS = [
  [0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]
];
// Edge i: vertex[i] → vertex[(i+1)%6]  |  direction: 0=N 1=NE 2=SE 3=S 4=SW 5=NW

const D30      = Math.cos(Math.PI / 6);  // 0.866
const colStep  = HW * 0.75 + SEP * D30;
const rowStep  = HH + SEP;
const halfRow  = (HH + SEP) / 2;

const NEIGHBOR_OFFSETS = [
  { dx: 0,        dy: -rowStep, edgeIdx: 0 },  // N
  { dx:  colStep, dy: -halfRow, edgeIdx: 1 },  // NE
  { dx:  colStep, dy:  halfRow, edgeIdx: 2 },  // SE
  { dx: 0,        dy:  rowStep, edgeIdx: 3 },  // S
  { dx: -colStep, dy:  halfRow, edgeIdx: 4 },  // SW
  { dx: -colStep, dy: -halfRow, edgeIdx: 5 },  // NW
];

const SNAP_THRESHOLD = HW * 0.85;

// ---- DOM refs -------------------------------------------------------
const hexCanvas        = document.getElementById("hexCanvas");
const snapGhost        = document.getElementById("snapGhost");
const snapSvg          = document.getElementById("snapSvg");
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
const closeSidebarBtn  = document.getElementById("closeSidebarBtn");
const sidebar          = document.getElementById("sidebar");
const portSelect       = document.getElementById("portSelect");
const connectSerialBtn = document.getElementById("connectSerialBtn");
const requestPortBtn   = document.getElementById("requestPortBtn");
const connectionStatus = document.getElementById("connectionStatus");
const resetAudioBtn    = document.getElementById("resetAudioBtn");
const resetLayoutBtn   = document.getElementById("resetLayoutBtn");
const audioMapList     = document.getElementById("audioMapList");
const resetMapBtn      = document.getElementById("resetMapBtn");
const mapHint          = document.getElementById("mapHint");

// ---- Sidebar --------------------------------------------------------
toggleSidebarBtn.addEventListener("click", () => sidebar.classList.remove("hidden"));
closeSidebarBtn.addEventListener("click",  () => sidebar.classList.add("hidden"));

// ============================================================
//  AUDIO MAP  (key → which sound source key plays)
//  Initially identity; swapping changes entries.
// ============================================================
const LS_MAP_KEY = "vkdj-audio-map";

function defaultAudioMap() {
  const m = {};
  padKeys.forEach(k => m[k] = k);
  return m;
}

function loadAudioMap() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_MAP_KEY));
    if (saved && padKeys.every(k => k in saved)) return saved;
  } catch {}
  return defaultAudioMap();
}

function saveAudioMap() {
  localStorage.setItem(LS_MAP_KEY, JSON.stringify(audioMap));
}

let audioMap = loadAudioMap();

// ---- Position storage -----------------------------------------------
const LS_POS_KEY = "vkdj-hex-positions";

function loadPositions() {
  try { return JSON.parse(localStorage.getItem(LS_POS_KEY)) || {}; } catch { return {}; }
}
function savePositions() {
  const out = {};
  padKeys.forEach(k => {
    const el = document.getElementById(`pad-${k}`);
    if (el) out[k] = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  });
  localStorage.setItem(LS_POS_KEY, JSON.stringify(out));
}

function getDefaultPositions() {
  const cw = hexCanvas.clientWidth  || window.innerWidth  - 240;
  const ch = hexCanvas.clientHeight || window.innerHeight - 56;

  // 4-4-4 honeycomb grid
  const layout = [
    [0,0],[1,0],[2,0],[3,0],
    [0,1],[1,1],[2,1],[3,1],
    [0,2],[1,2],[2,2],[3,2],
  ];
  const totalW = 3 * colStep + HW;
  const totalH = 2 * rowStep + HH + halfRow;
  const startX = (cw - totalW) / 2;
  const startY = (ch - totalH) / 2;

  const positions = {};
  padKeys.forEach((key, i) => {
    const [col, row] = layout[i];
    const isOddRow = row % 2 === 1;
    positions[key] = {
      x: startX + col * colStep + (isOddRow ? colStep / 2 : 0),
      y: startY + row * rowStep,
    };
  });
  return positions;
}

function applyPositions(positions) {
  padKeys.forEach(key => {
    const p = positions[key];
    if (p) {
      const el = padEls[key];
      el.style.left = `${p.x}px`;
      el.style.top  = `${p.y}px`;
    }
  });
}

// ---- Create pad elements --------------------------------------------
const padEls = {};

padKeys.forEach(key => {
  const el = document.createElement("div");
  el.classList.add("pad-hex");
  el.id = `pad-${key}`;
  el.innerHTML = `
    <div class="pad-inner">
      <span class="key-label">${key.toUpperCase()}</span>
      <span class="pad-name">${padNames[key] || ""}</span>
      <span class="custom-indicator">🎵</span>
    </div>`;
  hexCanvas.appendChild(el);
  padEls[key] = el;
});

function initLayout() {
  const saved = loadPositions();
  applyPositions(padKeys.every(k => saved[k]) ? saved : getDefaultPositions());
}

resetLayoutBtn && resetLayoutBtn.addEventListener("click", () => {
  if (!confirm("Reset pad layout to default honeycomb?")) return;
  localStorage.removeItem(LS_POS_KEY);
  applyPositions(getDefaultPositions());
});

// ---- Snap helpers ---------------------------------------------------
function getPadCenter(el) {
  return { x: parseFloat(el.style.left) + HW / 2, y: parseFloat(el.style.top) + HH / 2 };
}
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

function getSnapCandidates(excludingKey) {
  const placed = padKeys
    .filter(k => k !== excludingKey)
    .map(k => ({ key: k, ...getPadCenter(padEls[k]) }));

  const candidates = [];
  placed.forEach(anchor => {
    NEIGHBOR_OFFSETS.forEach(off => {
      const cx = anchor.x + off.dx;
      const cy = anchor.y + off.dy;
      if (placed.some(p => dist(p.x, p.y, cx, cy) < HW * 0.6)) return;
      if (cx < 0 || cy < 0 || cx > hexCanvas.clientWidth || cy > hexCanvas.clientHeight) return;
      candidates.push({ cx, cy, anchorKey: anchor.key, edgeIdx: off.edgeIdx });
    });
  });
  return candidates;
}

// ---- Snap visuals ---------------------------------------------------
let currentSnapAnchor = null;

function showSnap(candidate) {
  snapGhost.style.left = `${candidate.cx - HW / 2}px`;
  snapGhost.style.top  = `${candidate.cy - HH / 2}px`;
  snapGhost.classList.add("visible");

  if (currentSnapAnchor !== candidate.anchorKey) {
    if (currentSnapAnchor) padEls[currentSnapAnchor]?.classList.remove("snap-anchor");
    currentSnapAnchor = candidate.anchorKey;
  }
  padEls[candidate.anchorKey].classList.add("snap-anchor");

  // SVG edge line
  snapSvg.innerHTML = "";
  const anchorEl = padEls[candidate.anchorKey];
  const ax = parseFloat(anchorEl.style.left);
  const ay = parseFloat(anchorEl.style.top);
  const ei = candidate.edgeIdx;
  const [vi, vj] = [ei, (ei + 1) % 6];
  const [fx1, fy1] = HEX_VERTS[vi];
  const [fx2, fy2] = HEX_VERTS[vj];

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", ax + fx1 * HW); line.setAttribute("y1", ay + fy1 * HH);
  line.setAttribute("x2", ax + fx2 * HW); line.setAttribute("y2", ay + fy2 * HH);
  line.setAttribute("class", "snap-edge-line");
  snapSvg.appendChild(line);
}

function clearSnapVisuals() {
  snapGhost.classList.remove("visible");
  snapSvg.innerHTML = "";
  if (currentSnapAnchor) {
    padEls[currentSnapAnchor]?.classList.remove("snap-anchor");
    currentSnapAnchor = null;
  }
}

// ---- Pad drag (pointer events) --------------------------------------
function attachDragBehaviour(key) {
  const el = padEls[key];
  let dragging = false;
  let startPX, startPY, startEX, startEY, pendingSnap = null;

  el.addEventListener("pointerdown", e => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragging = true;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    el.style.zIndex = 100;
    startPX = e.clientX; startPY = e.clientY;
    startEX = parseFloat(el.style.left) || 0;
    startEY = parseFloat(el.style.top)  || 0;
    e.preventDefault();
  });

  el.addEventListener("pointermove", e => {
    if (!dragging) return;
    const nx = startEX + e.clientX - startPX;
    const ny = startEY + e.clientY - startPY;
    el.style.left = `${nx}px`;
    el.style.top  = `${ny}px`;

    const cx = nx + HW / 2, cy = ny + HH / 2;
    const candidates = getSnapCandidates(key);
    let best = null, bestDist = SNAP_THRESHOLD;
    candidates.forEach(c => {
      const d = dist(cx, cy, c.cx, c.cy);
      if (d < bestDist) { bestDist = d; best = c; }
    });

    if (best) { pendingSnap = best; showSnap(best); }
    else      { pendingSnap = null; clearSnapVisuals(); }
    e.preventDefault();
  });

  el.addEventListener("pointerup", e => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    el.style.zIndex = "";
    if (pendingSnap) {
      el.style.left = `${pendingSnap.cx - HW / 2}px`;
      el.style.top  = `${pendingSnap.cy - HH / 2}px`;
      pendingSnap = null;
    }
    clearSnapVisuals();
    savePositions();
    e.preventDefault();
  });

  el.addEventListener("pointercancel", () => {
    dragging = false;
    el.classList.remove("dragging");
    el.style.zIndex = "";
    pendingSnap = null;
    clearSnapVisuals();
  });
}

padKeys.forEach(key => attachDragBehaviour(key));

// ============================================================
//  AUDIO MAP PANEL
// ============================================================

let selectedMapKey = null;  // the first key selected for swap

// Returns display name for what sound is currently assigned to padKey
function getSoundName(padKey) {
  const srcKey = audioMap[padKey];
  if (customAudioBuffers[srcKey]) return "Custom ♪";
  return padNames[srcKey] ?? "—";
}

function getSoundTag(padKey) {
  const srcKey = audioMap[padKey];
  if (customAudioBuffers[srcKey]) return { label: "custom file", isCustom: true };
  if (srcKey !== padKey) return { label: `from ${srcKey.toUpperCase()}`, isCustom: false };
  return { label: "default", isCustom: false };
}

function renderAudioPanel() {
  audioMapList.innerHTML = "";
  padKeys.forEach(key => {
    const row = document.createElement("div");
    row.classList.add("audio-map-row");
    row.id = `map-row-${key}`;
    if (selectedMapKey === key) row.classList.add("selected-first");

    const { label, isCustom } = getSoundTag(key);

    row.innerHTML = `
      <span class="map-key-badge">${key.toUpperCase()}</span>
      <div class="map-sound-info">
        <span class="map-sound-name">${getSoundName(key)}</span>
        <span class="map-sound-tag${isCustom ? " custom" : ""}">${label}</span>
      </div>
      <span class="map-swap-arrow">⇌</span>`;

    row.addEventListener("click", () => handleMapRowClick(key));
    audioMapList.appendChild(row);
  });
}

function handleMapRowClick(clickedKey) {
  if (selectedMapKey === null) {
    // First selection
    selectedMapKey = clickedKey;
    mapHint.textContent = `"${clickedKey.toUpperCase()}" selected — now click another key to swap its sound.`;
    mapHint.classList.add("selecting");
    renderAudioPanel();
  } else if (selectedMapKey === clickedKey) {
    // Deselect
    selectedMapKey = null;
    mapHint.textContent = "Click a pad row to select, then click another to swap sounds.";
    mapHint.classList.remove("selecting");
    renderAudioPanel();
  } else {
    // Swap the two audio assignments
    const a = selectedMapKey, b = clickedKey;
    [audioMap[a], audioMap[b]] = [audioMap[b], audioMap[a]];
    saveAudioMap();

    // Update pad name labels on the hex pads
    updatePadLabels();

    // Flash both rows
    selectedMapKey = null;
    mapHint.textContent = `Swapped sounds: ${a.toUpperCase()} ⇌ ${b.toUpperCase()}`;
    mapHint.classList.remove("selecting");
    renderAudioPanel();

    requestAnimationFrame(() => {
      [a, b].forEach(k => {
        const r = document.getElementById(`map-row-${k}`);
        r?.classList.add("swap-flash");
        setTimeout(() => r?.classList.remove("swap-flash"), 600);
      });
    });

    // Reset hint text after a moment
    setTimeout(() => {
      mapHint.textContent = "Click a pad row to select, then click another to swap sounds.";
    }, 2500);
  }
}

// Update the small name labels on the hex pads to reflect audio map
function updatePadLabels() {
  padKeys.forEach(key => {
    const el = padEls[key];
    if (el) {
      el.querySelector(".pad-name").textContent = getSoundName(key);
    }
  });
}

resetMapBtn && resetMapBtn.addEventListener("click", () => {
  if (!confirm("Reset all sound assignments to default?")) return;
  audioMap = defaultAudioMap();
  saveAudioMap();
  selectedMapKey = null;
  mapHint.textContent = "Click a pad row to select, then click another to swap sounds.";
  mapHint.classList.remove("selecting");
  updatePadLabels();
  renderAudioPanel();
});

// ---- Audio Context --------------------------------------------------
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
const activeNodes        = {};
let customAudioBuffers   = {};
let defaultAudioElements = {};

const BASE = "https://www.musicca.com/files/audio/tools/drums/standard/";
const defaultAudioURLs = {
  a: BASE + "bass.mp3",
  s: BASE + "snare-drum.mp3",
  d: BASE + "snare-stick.mp3",
  f: BASE + "tom1.mp3",
  g: BASE + "tom2.mp3",
  h: BASE + "floor-tom.mp3",
  j: BASE + "hihat.mp3",
  k: BASE + "hihat-open.mp3",
  l: BASE + "hihat-foot.mp3",
  c: BASE + "ride.mp3",
  v: BASE + "crash.mp3",
};

function initAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

async function loadDefaultAudio() {
  for (const key of Object.keys(defaultAudioURLs)) {
    const audio = new Audio(defaultAudioURLs[key]);
    audio.preload = "auto";
    defaultAudioElements[key] = audio;
  }
}

// ---- IndexedDB for custom audio -------------------------------------
const DB_NAME = "MusicPadDB", STORE_NAME = "customAudio";
let db;

const initDB = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
  };
  req.onsuccess = e => {
    db = e.target.result;
    loadCustomAudioFromDB().then(resolve);
  };
  req.onerror = e => reject(e.target.error);
});

async function saveCustomAudioToDB(key, buf) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const r = store.put(buf, key);
    r.onsuccess = () => resolve();
    r.onerror   = e  => reject(e.target.error);
  });
}

async function loadCustomAudioFromDB() {
  initAudio();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction([STORE_NAME], "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.openCursor();
    const items = [];
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) { items.push({ key: cursor.key, buffer: cursor.value }); cursor.continue(); }
    };
    tx.oncomplete = async () => {
      for (const item of items) {
        try {
          customAudioBuffers[item.key] = await audioCtx.decodeAudioData(item.buffer.slice(0));
          padEls[item.key]?.classList.add("has-custom");
        } catch (err) { console.error("Decode error", item.key, err); }
      }
      resolve();
    };
    req.onerror = e => reject(e.target.error);
  });
}

// ---- Audio file drag-drop onto pads ---------------------------------
padKeys.forEach(key => {
  const el = padEls[key];
  el.addEventListener("dragover",  e => { e.preventDefault(); el.classList.add("dragover"); });
  el.addEventListener("dragleave", () => el.classList.remove("dragover"));
  el.addEventListener("drop", async e => {
    e.preventDefault();
    el.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("audio/")) {
      initAudio();
      const buf = await file.arrayBuffer();
      try {
        await saveCustomAudioToDB(key, buf);
        customAudioBuffers[key] = await audioCtx.decodeAudioData(buf.slice(0));
        el.classList.add("has-custom");
        // Refresh panel so custom tags update
        renderAudioPanel();
        updatePadLabels();
      } catch (err) {
        console.error("Custom audio error:", err);
        alert("Failed to process audio file.");
      }
    }
  });
});

// ---- Audio playback (uses audioMap to resolve source) ---------------
function playSound(padKey) {
  initAudio();
  const srcKey = audioMap[padKey];  // follow the map

  if (customAudioBuffers[srcKey]) {
    if (activeNodes[padKey]) return;
    const src = audioCtx.createBufferSource();
    src.buffer = customAudioBuffers[srcKey];
    src.connect(audioCtx.destination);
    src.start();
    activeNodes[padKey] = { source: src };
    src.onended = () => { if (activeNodes[padKey]?.source === src) delete activeNodes[padKey]; };
  } else if (defaultAudioElements[srcKey]) {
    defaultAudioElements[srcKey].cloneNode().play().catch(e => console.warn(e));
  }
}
function stopSound(key) { if (activeNodes[key]) delete activeNodes[key]; }

// ---- Pad activation -------------------------------------------------
function activatePad(key) {
  const el = padEls[key];
  if (el && !el.classList.contains("active")) { el.classList.add("active"); playSound(key); }
}
function deactivatePad(key) {
  const el = padEls[key];
  if (el && el.classList.contains("active")) { el.classList.remove("active"); stopSound(key); }
}

// Keyboard
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (padKeys.includes(k)) activatePad(k);
});
window.addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  if (padKeys.includes(k)) deactivatePad(k);
});

// Mouse / touch
padKeys.forEach(key => {
  const el = padEls[key];
  el.addEventListener("mousedown",  () => activatePad(key));
  el.addEventListener("mouseup",    () => deactivatePad(key));
  el.addEventListener("mouseleave", () => deactivatePad(key));
  el.addEventListener("touchstart", e => { e.preventDefault(); activatePad(key); });
  el.addEventListener("touchend",   e => { e.preventDefault(); deactivatePad(key); });
});

// ---- Web Serial -----------------------------------------------------
let activePort, reader, keepReading = true;
let availablePorts = [], serialBuffer = "";
const ESP32_VIDS = [0x10c4, 0x1a86, 0x303a];

async function updatePortList() {
  if (!("serial" in navigator)) { connectionStatus.textContent = "Web Serial not supported"; return; }
  availablePorts = await navigator.serial.getPorts();
  portSelect.innerHTML = '<option value="">Select a port...</option>';
  availablePorts.forEach((port, i) => {
    const isEsp = ESP32_VIDS.includes(port.getInfo().usbVendorId);
    const opt = document.createElement("option");
    opt.value = i; opt.textContent = `Port ${i + 1}${isEsp ? " (ESP32?)" : ""}`;
    portSelect.appendChild(opt);
  });
}

async function connectToPort(port) {
  if (activePort) await disconnectSerial();
  try {
    await port.open({ baudRate: 115200 });
    activePort = port;
    connectionStatus.textContent = "Connected"; connectionStatus.classList.add("connected");
    connectSerialBtn.textContent = "Disconnect";
    keepReading = true; readSerialData();
  } catch (err) {
    console.error(err);
    connectionStatus.textContent = "Connection Failed"; connectionStatus.classList.remove("connected");
  }
}

async function disconnectSerial() {
  keepReading = false;
  if (reader) await reader.cancel();
  if (activePort) await activePort.close();
  activePort = null;
  connectionStatus.textContent = "Disconnected"; connectionStatus.classList.remove("connected");
  connectSerialBtn.textContent = "Connect Selected";
}

async function autoConnectEsp32() {
  if (activePort) return;
  for (const port of availablePorts) {
    if (ESP32_VIDS.includes(port.getInfo().usbVendorId)) {
      try { await connectToPort(port); return; } catch (e) { console.log("Auto-connect failed", e); }
    }
  }
}

connectSerialBtn.addEventListener("click", async () => {
  if (activePort) await disconnectSerial();
  else if (portSelect.value !== "") await connectToPort(availablePorts[portSelect.value]);
});

requestPortBtn.addEventListener("click", async () => {
  if (!("serial" in navigator)) return;
  try {
    const port = await navigator.serial.requestPort();
    await updatePortList(); await connectToPort(port);
    portSelect.value = availablePorts.length - 1;
  } catch (e) { console.error(e); }
});

async function readSerialData() {
  while (activePort && activePort.readable && keepReading) {
    reader = activePort.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        serialBuffer += new TextDecoder().decode(value);
        let si;
        while ((si = serialBuffer.indexOf("#")) !== -1) {
          const ei = serialBuffer.indexOf("$", si);
          if (ei === -1) break;
          const cmd = serialBuffer.substring(si + 1, ei).toLowerCase();
          if (cmd.length === 2 && padKeys.includes(cmd[0])) {
            if      (cmd[1] === "d") activatePad(cmd[0]);
            else if (cmd[1] === "u") deactivatePad(cmd[0]);
          }
          serialBuffer = serialBuffer.substring(ei + 1);
        }
        if (serialBuffer.length > 100) {
          const lh = serialBuffer.lastIndexOf("#");
          serialBuffer = lh !== -1 ? serialBuffer.substring(lh) : "";
        }
      }
    } catch (err) { console.error(err); }
    finally { if (reader) reader.releaseLock(); }
  }
}

// ---- Reset custom audio ---------------------------------------------
resetAudioBtn && resetAudioBtn.addEventListener("click", async () => {
  if (!confirm("Reset all custom sounds to defaults?")) return;
  if (db) {
    const tx = db.transaction([STORE_NAME], "readwrite");
    tx.objectStore(STORE_NAME).clear().onsuccess = () => {
      customAudioBuffers = {};
      padKeys.forEach(k => padEls[k]?.classList.remove("has-custom"));
      renderAudioPanel();
      updatePadLabels();
      alert("Custom sounds cleared.");
    };
  }
});

// ---- Init -----------------------------------------------------------
window.addEventListener("load", async () => {
  initLayout();
  renderAudioPanel();
  updatePadLabels();
  await loadDefaultAudio();
  await initDB;
  // Refresh panel after custom audio loaded (names may update)
  renderAudioPanel();
  updatePadLabels();
  if ("serial" in navigator) { await updatePortList(); await autoConnectEsp32(); }
});
