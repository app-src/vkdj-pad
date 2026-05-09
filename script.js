// ============================================================
//  VKDJ Hex Pad — script.js
// ============================================================

// ---- Pad definitions ------------------------------------------------
const padKeys  = ["a","s","d","f","g","h","j","k","l","c","v","b"];
const padNames = {
  a:"Bass Drum", s:"Snare",    d:"Cross Stick", f:"Hi Tom",
  g:"Low Tom",   h:"Floor Tom",j:"Hi-Hat ✕",    k:"Hi-Hat ○",
  l:"Hi-Hat Foot",c:"Ride",   v:"Crash",        b:"—",
};

// ---- Hex geometry ---------------------------------------------------
const R   = 55;                    // outer radius (px)
const HW  = R * 2;                 // bounding-box width  (110)
const HH  = R * Math.sqrt(3);      // bounding-box height (≈95.26)
const SEP = 8;                     // gap between adjacent hex edges

// Flat-top hex:  clip-path polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)
// Vertex coords as fractions of (HW, HH):
//   0: (0.25, 0)   1: (0.75, 0)   2: (1, 0.5)
//   3: (0.75, 1)   4: (0.25, 1)   5: (0, 0.5)
const HEX_VERTS = [
  [0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]
];
// Edge i goes from vertex i to vertex (i+1)%6 and belongs to direction i:
//  0=N  1=NE  2=SE  3=S  4=SW  5=NW
const EDGE_PAIRS = HEX_VERTS.map((_,i)=>[i,(i+1)%6]);

// Neighbour offset vectors [flat-top honeycomb]:
//   direction 0=N  1=NE  2=SE  3=S  4=SW  5=NW
//   "edgeIdx" = index of anchor's edge that faces the snap position
const D30 = Math.cos(Math.PI/6);   // 0.866
const colStep = HW * 0.75 + SEP * D30;
const rowStep = HH + SEP;
const halfRow = (HH + SEP) / 2;

const NEIGHBOR_OFFSETS = [
  { dx: 0,        dy: -rowStep, edgeIdx: 0 },  // N
  { dx: colStep,  dy: -halfRow, edgeIdx: 1 },  // NE
  { dx: colStep,  dy:  halfRow, edgeIdx: 2 },  // SE
  { dx: 0,        dy:  rowStep, edgeIdx: 3 },  // S
  { dx: -colStep, dy:  halfRow, edgeIdx: 4 },  // SW
  { dx: -colStep, dy: -halfRow, edgeIdx: 5 },  // NW
];

// Opposite direction (for ghost edge on dragged pad — not used currently)
const OPP = [3,4,5,0,1,2];

const SNAP_THRESHOLD = HW * 0.85;  // px – how close triggers snap

// ---- DOM refs -------------------------------------------------------
const hexCanvas      = document.getElementById("hexCanvas");
const snapGhost      = document.getElementById("snapGhost");
const snapSvg        = document.getElementById("snapSvg");
const toggleSidebarBtn  = document.getElementById("toggleSidebarBtn");
const closeSidebarBtn   = document.getElementById("closeSidebarBtn");
const sidebar           = document.getElementById("sidebar");
const portSelect        = document.getElementById("portSelect");
const connectSerialBtn  = document.getElementById("connectSerialBtn");
const requestPortBtn    = document.getElementById("requestPortBtn");
const connectionStatus  = document.getElementById("connectionStatus");
const resetAudioBtn     = document.getElementById("resetAudioBtn");
const resetLayoutBtn    = document.getElementById("resetLayoutBtn");

// ---- Sidebar --------------------------------------------------------
toggleSidebarBtn.addEventListener("click", ()=> sidebar.classList.remove("hidden"));
closeSidebarBtn.addEventListener("click",  ()=> sidebar.classList.add("hidden"));

// ---- Position storage -----------------------------------------------
const LS_KEY = "vkdj-hex-positions";

function loadPositions() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function savePositions() {
  const out = {};
  padKeys.forEach(k=>{
    const el = document.getElementById(`pad-${k}`);
    if (el) out[k] = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  });
  localStorage.setItem(LS_KEY, JSON.stringify(out));
}

function getDefaultPositions() {
  const cw = hexCanvas.clientWidth  || window.innerWidth;
  const ch = hexCanvas.clientHeight || window.innerHeight - 80;

  // 4-4-4 honeycomb grid, centred
  const layout = [
    [0,0],[1,0],[2,0],[3,0],   // row 0
    [0,1],[1,1],[2,1],[3,1],   // row 1  (offset col += 0.5)
    [0,2],[1,2],[2,2],[3,2],   // row 2
  ];
  const cols = 4;
  const rows = 3;
  const totalW = (cols - 1) * colStep + HW;
  const totalH = (rows  - 1) * rowStep + HH + rowStep / 2; // half-row for odd rows

  const startX = (cw - totalW) / 2;
  const startY = (ch - totalH) / 2 + rowStep * 0.25;

  const positions = {};
  padKeys.forEach((key, i) => {
    const [col, row] = layout[i];
    const isOddRow = row % 2 === 1;
    positions[key] = {
      x: startX + col * colStep + (isOddRow ? colStep / 2 : 0),
      y: startY + row * rowStep  + (isOddRow ? 0 : 0),
    };
  });
  return positions;
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

function initLayout() {
  const saved = loadPositions();
  const hasSaved = padKeys.every(k => saved[k]);
  applyPositions(hasSaved ? saved : getDefaultPositions());
}

resetLayoutBtn && resetLayoutBtn.addEventListener("click", ()=>{
  if (!confirm("Reset pad layout to default honeycomb?")) return;
  localStorage.removeItem(LS_KEY);
  applyPositions(getDefaultPositions());
});

// ---- Snap helpers ---------------------------------------------------
function getPadCenter(el) {
  return {
    x: parseFloat(el.style.left) + HW / 2,
    y: parseFloat(el.style.top)  + HH / 2,
  };
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Returns all snap candidate positions (unoccupied neighbour slots of placed pads)
// excludingKey: the pad being dragged (ignore its own slots)
function getSnapCandidates(excludingKey) {
  const candidates = [];
  const placedCenters = [];

  padKeys.forEach(k => {
    if (k === excludingKey) return;
    const c = getPadCenter(padEls[k]);
    placedCenters.push({ key: k, ...c });
  });

  placedCenters.forEach(anchor => {
    NEIGHBOR_OFFSETS.forEach(off => {
      const cx = anchor.x + off.dx;
      const cy = anchor.y + off.dy;

      // Skip if too close to any placed pad (slot already occupied)
      const occupied = placedCenters.some(p => dist(p.x, p.y, cx, cy) < HW * 0.6);
      if (occupied) return;

      // Skip if off-screen
      if (cx < 0 || cy < 0 || cx > hexCanvas.clientWidth || cy > hexCanvas.clientHeight) return;

      candidates.push({ cx, cy, anchorKey: anchor.key, edgeIdx: off.edgeIdx });
    });
  });

  return candidates;
}

// ---- Snap visualisation ---------------------------------------------
let currentSnapAnchor = null;

function showSnap(candidate) {
  // Position ghost hex
  const ghostX = candidate.cx - HW / 2;
  const ghostY = candidate.cy - HH / 2;
  snapGhost.style.left = `${ghostX}px`;
  snapGhost.style.top  = `${ghostY}px`;
  snapGhost.classList.add("visible");

  // Highlight edge on anchor pad
  if (currentSnapAnchor !== candidate.anchorKey) {
    clearSnapVisuals(false);
    currentSnapAnchor = candidate.anchorKey;
  }
  const anchorEl = padEls[candidate.anchorKey];
  anchorEl.classList.add("snap-anchor");

  // Draw SVG edge line
  snapSvg.innerHTML = "";
  const ax = parseFloat(anchorEl.style.left);
  const ay = parseFloat(anchorEl.style.top);
  const [vi, vj] = EDGE_PAIRS[candidate.edgeIdx];
  const [fx1, fy1] = HEX_VERTS[vi];
  const [fx2, fy2] = HEX_VERTS[vj];

  const x1 = ax + fx1 * HW;
  const y1 = ay + fy1 * HH;
  const x2 = ax + fx2 * HW;
  const y2 = ay + fy2 * HH;

  const line = document.createElementNS("http://www.w3.org/2000/svg","line");
  line.setAttribute("x1", x1); line.setAttribute("y1", y1);
  line.setAttribute("x2", x2); line.setAttribute("y2", y2);
  line.setAttribute("class","snap-edge-line");
  snapSvg.appendChild(line);
}

function clearSnapVisuals(clearGhost = true) {
  if (clearGhost) {
    snapGhost.classList.remove("visible");
    snapSvg.innerHTML = "";
  }
  if (currentSnapAnchor) {
    padEls[currentSnapAnchor]?.classList.remove("snap-anchor");
    currentSnapAnchor = null;
  }
}

// ---- Pad dragging (pointer events) ----------------------------------
function attachDragBehaviour(key) {
  const el = padEls[key];
  let dragging = false;
  let startPointerX, startPointerY, startElX, startElY;
  let pendingSnap = null;

  el.addEventListener("pointerdown", e => {
    // Only primary button (left click / single touch)
    if (e.button !== 0 && e.pointerType === "mouse") return;
    // Don't intercept if dragging an audio file
    if (e.dataTransfer) return;

    dragging = true;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    el.style.zIndex = 100;

    startPointerX = e.clientX;
    startPointerY = e.clientY;
    startElX = parseFloat(el.style.left) || 0;
    startElY = parseFloat(el.style.top)  || 0;
    e.preventDefault();
  });

  el.addEventListener("pointermove", e => {
    if (!dragging) return;

    const dx = e.clientX - startPointerX;
    const dy = e.clientY - startPointerY;
    const newX = startElX + dx;
    const newY = startElY + dy;
    el.style.left = `${newX}px`;
    el.style.top  = `${newY}px`;

    // Compute current center
    const cx = newX + HW / 2;
    const cy = newY + HH / 2;

    // Find closest snap candidate
    const candidates = getSnapCandidates(key);
    let best = null, bestDist = SNAP_THRESHOLD;
    candidates.forEach(c => {
      const d = dist(cx, cy, c.cx, c.cy);
      if (d < bestDist) { bestDist = d; best = c; }
    });

    if (best) {
      pendingSnap = best;
      showSnap(best);
    } else {
      pendingSnap = null;
      clearSnapVisuals();
    }

    e.preventDefault();
  });

  el.addEventListener("pointerup", e => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    el.style.zIndex = "";

    if (pendingSnap) {
      // Snap to grid position
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

// ---- Audio Context --------------------------------------------------
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
const activeNodes    = {};
let customAudioBuffers  = {};
let defaultAudioElements = {};

const BASE = "https://www.musicca.com/files/audio/tools/drums/standard/";
const defaultAudioURLs = {
  a: BASE+"bass.mp3",      s: BASE+"snare-drum.mp3",
  d: BASE+"snare-stick.mp3",f: BASE+"tom1.mp3",
  g: BASE+"tom2.mp3",      h: BASE+"floor-tom.mp3",
  j: BASE+"hihat.mp3",     k: BASE+"hihat-open.mp3",
  l: BASE+"hihat-foot.mp3",c: BASE+"ride.mp3",
  v: BASE+"crash.mp3",
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
  req.onsuccess = e => { db = e.target.result; loadCustomAudioFromDB().then(resolve); };
  req.onerror   = e => reject(e.target.error);
});

async function saveCustomAudioToDB(key, buf) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME],"readwrite");
    const store = tx.objectStore(STORE_NAME);
    const r = store.put(buf, key);
    r.onsuccess = ()=>resolve(); r.onerror = e=>reject(e.target.error);
  });
}

async function loadCustomAudioFromDB() {
  initAudio();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME],"readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    const items = [];
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) { items.push({ key: cursor.key, buffer: cursor.value }); cursor.continue(); }
    };
    tx.oncomplete = async () => {
      for (const item of items) {
        try {
          const decoded = await audioCtx.decodeAudioData(item.buffer.slice(0));
          customAudioBuffers[item.key] = decoded;
          padEls[item.key]?.classList.add("has-custom");
        } catch(err) { console.error("Decode error", item.key, err); }
      }
      resolve();
    };
    req.onerror = e => reject(e.target.error);
  });
}

// ---- Audio file drag-drop onto pads ---------------------------------
padKeys.forEach(key => {
  const el = padEls[key];
  el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("dragover"); });
  el.addEventListener("dragleave", ()=> el.classList.remove("dragover"));
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
      } catch(err) { console.error("Custom audio error:", err); alert("Failed to process audio file."); }
    }
  });
});

// ---- Audio playback -------------------------------------------------
function playSound(key) {
  initAudio();
  if (customAudioBuffers[key]) {
    if (activeNodes[key]) return;
    const src = audioCtx.createBufferSource();
    src.buffer = customAudioBuffers[key];
    src.connect(audioCtx.destination);
    src.start();
    activeNodes[key] = { type:"buffer", source: src };
    src.onended = ()=>{ if (activeNodes[key]?.source === src) delete activeNodes[key]; };
  } else if (defaultAudioElements[key]) {
    defaultAudioElements[key].cloneNode().play().catch(e=>console.warn(e));
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

// Mouse / touch play
padKeys.forEach(key => {
  const el = padEls[key];
  el.addEventListener("mousedown",  ()=> activatePad(key));
  el.addEventListener("mouseup",    ()=> deactivatePad(key));
  el.addEventListener("mouseleave", ()=> deactivatePad(key));
  el.addEventListener("touchstart", e=>{ e.preventDefault(); activatePad(key); });
  el.addEventListener("touchend",   e=>{ e.preventDefault(); deactivatePad(key); });
});

// ---- Web Serial -----------------------------------------------------
let activePort, reader, keepReading = true;
let availablePorts = [], serialBuffer = "";
const ESP32_VIDS = [0x10c4, 0x1a86, 0x303a];

async function updatePortList() {
  if (!("serial" in navigator)) { connectionStatus.textContent="Web Serial not supported"; return; }
  availablePorts = await navigator.serial.getPorts();
  portSelect.innerHTML = '<option value="">Select a port...</option>';
  availablePorts.forEach((port, i) => {
    const info = port.getInfo();
    const isEsp = ESP32_VIDS.includes(info.usbVendorId);
    const opt = document.createElement("option");
    opt.value = i; opt.textContent = `Port ${i+1}${isEsp?" (ESP32?)":""}`;
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
  } catch(err) {
    console.error(err); connectionStatus.textContent="Connection Failed"; connectionStatus.classList.remove("connected");
  }
}

async function disconnectSerial() {
  keepReading = false;
  if (reader) await reader.cancel();
  if (activePort) await activePort.close();
  activePort = null;
  connectionStatus.textContent="Disconnected"; connectionStatus.classList.remove("connected");
  connectSerialBtn.textContent="Connect Selected";
}

async function autoConnectEsp32() {
  if (activePort) return;
  for (const port of availablePorts) {
    if (ESP32_VIDS.includes(port.getInfo().usbVendorId)) {
      try { await connectToPort(port); return; } catch(e) { console.log("Auto-connect failed", e); }
    }
  }
}

connectSerialBtn.addEventListener("click", async ()=>{
  if (activePort) await disconnectSerial();
  else if (portSelect.value !== "") await connectToPort(availablePorts[portSelect.value]);
});

requestPortBtn.addEventListener("click", async ()=>{
  if (!("serial" in navigator)) return;
  try {
    const port = await navigator.serial.requestPort();
    await updatePortList(); await connectToPort(port);
    portSelect.value = availablePorts.length - 1;
  } catch(e) { console.error(e); }
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
          const cmd = serialBuffer.substring(si+1, ei).toLowerCase();
          if (cmd.length === 2 && padKeys.includes(cmd[0])) {
            if (cmd[1]==="d") activatePad(cmd[0]);
            else if (cmd[1]==="u") deactivatePad(cmd[0]);
          }
          serialBuffer = serialBuffer.substring(ei+1);
        }
        if (serialBuffer.length > 100) {
          const lh = serialBuffer.lastIndexOf("#");
          serialBuffer = lh !== -1 ? serialBuffer.substring(lh) : "";
        }
      }
    } catch(err) { console.error(err); }
    finally { if (reader) reader.releaseLock(); }
  }
}

// ---- Reset audio ----------------------------------------------------
resetAudioBtn && resetAudioBtn.addEventListener("click", async ()=>{
  if (!confirm("Reset all custom sounds?")) return;
  if (db) {
    const tx = db.transaction([STORE_NAME],"readwrite");
    tx.objectStore(STORE_NAME).clear().onsuccess = ()=>{
      customAudioBuffers = {};
      padKeys.forEach(k=> padEls[k]?.classList.remove("has-custom"));
      alert("Audio reset to defaults.");
    };
  }
});

// ---- Init -----------------------------------------------------------
window.addEventListener("load", async ()=>{
  initLayout();
  await loadDefaultAudio();
  await initDB;
  if ("serial" in navigator) { await updatePortList(); await autoConnectEsp32(); }
});
