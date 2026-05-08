const padKeys = ["a", "s", "d", "f", "g", "h", "j", "k", "l", "c", "v", "b"];
const padRowTop = document.getElementById("padRowTop");
const padRowBottom = document.getElementById("padRowBottom");

// UI Elements
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const sidebar = document.getElementById("sidebar");
const portSelect = document.getElementById("portSelect");
const connectSerialBtn = document.getElementById("connectSerialBtn");
const requestPortBtn = document.getElementById("requestPortBtn");
const connectionStatus = document.getElementById("connectionStatus");
const resetAudioBtn = document.getElementById("resetAudioBtn");

// Toggle Sidebar
toggleSidebarBtn.addEventListener("click", () =>
  sidebar.classList.remove("hidden"),
);
closeSidebarBtn.addEventListener("click", () =>
  sidebar.classList.add("hidden"),
);

// Create pads
const topRowKeys = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const bottomRowKeys = ["c", "v", "b"];

padKeys.forEach((key) => {
  const pad = document.createElement("div");
  pad.classList.add("pad");
  pad.id = `pad-${key}`;
  pad.innerHTML = `
        <span class="key-label">${key}</span>
        <span class="custom-indicator">🎵</span>
    `;
  if (topRowKeys.includes(key)) {
    padRowTop.appendChild(pad);
  } else if (bottomRowKeys.includes(key)) {
    padRowBottom.appendChild(pad);
  }
});

// --- Audio Context and Synthesizer ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

const frequencies = {
  a: 261.63,
  s: 277.18,
  d: 293.66,
  f: 311.13,
  g: 329.63,
  h: 349.23,
  j: 369.99,
  k: 392.0,
  l: 415.3,
  c: 440.0,
  v: 466.16,
  b: 493.88,
};

const activeNodes = {}; // Stores both oscillators and audio buffers
let customAudioBuffers = {}; // Stores decoded AudioBuffers mapping to keys
let defaultAudioBuffers = {}; // Stores fetched default audio

const defaultAudioURLs = {
  a: "https://www.musicca.com/lydfiler/trommesat/standard/kick.mp3",
  s: "https://www.musicca.com/lydfiler/trommesat/standard/snare.mp3",
  d: "https://www.musicca.com/lydfiler/trommesat/standard/sidestick.mp3",
  f: "https://www.musicca.com/lydfiler/trommesat/standard/tom1.mp3",
  g: "https://www.musicca.com/lydfiler/trommesat/standard/tom2.mp3",
  h: "https://www.musicca.com/lydfiler/trommesat/standard/tom3.mp3",
  j: "https://www.musicca.com/lydfiler/trommesat/standard/hihat-closed.mp3",
  k: "https://www.musicca.com/lydfiler/trommesat/standard/hihat-open.mp3",
  l: "https://www.musicca.com/lydfiler/trommesat/standard/hihat-foot.mp3",
  c: "https://www.musicca.com/lydfiler/trommesat/standard/ride.mp3",
  v: "https://www.musicca.com/lydfiler/trommesat/standard/crash.mp3",
  // 'b' is left out as there are only 11 URLs provided for 12 keys
};

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

async function loadDefaultAudio() {
  initAudio();
  for (const key of Object.keys(defaultAudioURLs)) {
    try {
      const response = await fetch(defaultAudioURLs[key]);
      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      defaultAudioBuffers[key] = decodedBuffer;
    } catch (error) {
      console.error(`Failed to load default audio for ${key}:`, error);
    }
  }
}

// --- IndexedDB for Custom Audio ---
const DB_NAME = "MusicPadDB";
const STORE_NAME = "customAudio";
let db;

const initDB = new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  };
  request.onsuccess = (e) => {
    db = e.target.result;
    loadCustomAudioFromDB().then(resolve);
  };
  request.onerror = (e) => reject(e.target.error);
});

async function saveCustomAudioToDB(key, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(arrayBuffer, key);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

async function loadCustomAudioFromDB() {
  initAudio();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const items = [];

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        items.push({ key: cursor.key, buffer: cursor.value });
        cursor.continue();
      }
    };

    transaction.oncomplete = async () => {
      for (const item of items) {
        try {
          const bufferCopy = item.buffer.slice(0);
          const decodedBuffer = await audioCtx.decodeAudioData(bufferCopy);
          customAudioBuffers[item.key] = decodedBuffer;
          document
            .getElementById(`pad-${item.key}`)
            .classList.add("has-custom");
        } catch (err) {
          console.error("Error decoding saved audio for", item.key, err);
        }
      }
      resolve();
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

// --- Drag and Drop Logic ---
padKeys.forEach((key) => {
  const pad = document.getElementById(`pad-${key}`);

  pad.addEventListener("dragover", (e) => {
    e.preventDefault();
    pad.classList.add("dragover");
  });

  pad.addEventListener("dragleave", () => {
    pad.classList.remove("dragover");
  });

  pad.addEventListener("drop", async (e) => {
    e.preventDefault();
    pad.classList.remove("dragover");

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("audio/")) {
      initAudio();
      const arrayBuffer = await file.arrayBuffer();

      try {
        // Save to DB
        await saveCustomAudioToDB(key, arrayBuffer);

        // Load to memory immediately
        const bufferCopy = arrayBuffer.slice(0);
        const decodedBuffer = await audioCtx.decodeAudioData(bufferCopy);
        customAudioBuffers[key] = decodedBuffer;

        pad.classList.add("has-custom");
        console.log(`Custom audio set for pad ${key}`);
      } catch (err) {
        console.error("Error setting custom audio:", err);
        alert("Failed to process audio file.");
      }
    }
  });
});

// --- Audio Playback Logic ---
function playSound(key) {
  initAudio();
  if (activeNodes[key]) return; // Already playing

  const bufferToPlay = customAudioBuffers[key] || defaultAudioBuffers[key];

  if (bufferToPlay) {
    // Play Audio Buffer (custom or default)
    const source = audioCtx.createBufferSource();
    source.buffer = bufferToPlay;
    source.connect(audioCtx.destination);
    source.start();

    // Track it
    activeNodes[key] = { type: "buffer", source: source };

    // Clean up when done
    source.onended = () => {
      if (activeNodes[key] && activeNodes[key].source === source) {
        delete activeNodes[key];
      }
    };
  } else if (frequencies[key]) {
    // Play fallback synthesized sound
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequencies[key], audioCtx.currentTime);

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.05); // Attack
    gainNode.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.1); // Decay

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    activeNodes[key] = { type: "oscillator", oscillator, gainNode };
  }
}

function stopSound(key) {
  if (!activeNodes[key]) return;

  if (activeNodes[key].type === "oscillator") {
    const { oscillator, gainNode } = activeNodes[key];
    gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime + 0.1,
    ); // Release
    oscillator.stop(audioCtx.currentTime + 0.1);
  }

  delete activeNodes[key];
}

// --- Event Listeners for UI and Keyboard ---
function activatePad(key) {
  const pad = document.getElementById(`pad-${key}`);
  if (pad && !pad.classList.contains("active")) {
    pad.classList.add("active");
    playSound(key);
  }
}

function deactivatePad(key) {
  const pad = document.getElementById(`pad-${key}`);
  if (pad && pad.classList.contains("active")) {
    pad.classList.remove("active");
    stopSound(key);
  }
}

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (padKeys.includes(key)) {
    activatePad(key);
  }
});

window.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  if (padKeys.includes(key)) {
    deactivatePad(key);
  }
});

padKeys.forEach((key) => {
  const pad = document.getElementById(`pad-${key}`);
  pad.addEventListener("mousedown", () => activatePad(key));
  pad.addEventListener("mouseup", () => deactivatePad(key));
  pad.addEventListener("mouseleave", () => deactivatePad(key));

  pad.addEventListener("touchstart", (e) => {
    e.preventDefault();
    activatePad(key);
  });
  pad.addEventListener("touchend", (e) => {
    e.preventDefault();
    deactivatePad(key);
  });
});

// --- Web Serial API Logic ---
let activePort;
let reader;
let keepReading = true;
let availablePorts = [];
let serialBuffer = "";

// Common ESP32 Vendor IDs (Silicon Labs CP210x, CH340, etc.)
// Note: In Web Serial, vendorId must be passed in hex format to requestPort but getPorts returns numeric.
const ESP32_VIDS = [
  0x10c4, // Silicon Labs (CP210x)
  0x1a86, // QinHeng Electronics (CH340)
  0x303a, // Espressif
];

async function updatePortList() {
  if (!("serial" in navigator)) {
    connectionStatus.textContent = "Web Serial not supported";
    return;
  }

  availablePorts = await navigator.serial.getPorts();
  portSelect.innerHTML = '<option value="">Select a port...</option>';

  availablePorts.forEach((port, index) => {
    const info = port.getInfo();
    const isEsp = ESP32_VIDS.includes(info.usbVendorId);
    const name = `Port ${index + 1}` + (isEsp ? " (ESP32?)" : "");

    const option = document.createElement("option");
    option.value = index;
    option.textContent = name;
    portSelect.appendChild(option);
  });
}

async function autoConnectEsp32() {
  if (activePort) return;
  for (const port of availablePorts) {
    const info = port.getInfo();
    if (ESP32_VIDS.includes(info.usbVendorId)) {
      try {
        await connectToPort(port);
        return;
      } catch (e) {
        console.log("Auto-connect failed for port", port, e);
      }
    }
  }
}

async function connectToPort(port) {
  if (activePort) {
    await disconnectSerial();
  }
  try {
    await port.open({ baudRate: 115200 }); // standard ESP32 rate, adjust if needed
    activePort = port;
    connectionStatus.textContent = "Connected";
    connectionStatus.classList.add("connected");
    connectSerialBtn.textContent = "Disconnect";
    keepReading = true;
    readSerialData();
  } catch (error) {
    console.error("Error connecting to serial port:", error);
    connectionStatus.textContent = "Connection Failed";
    connectionStatus.classList.remove("connected");
  }
}

async function disconnectSerial() {
  keepReading = false;
  if (reader) {
    await reader.cancel();
  }
  if (activePort) {
    await activePort.close();
  }
  activePort = null;
  connectionStatus.textContent = "Disconnected";
  connectionStatus.classList.remove("connected");
  connectSerialBtn.textContent = "Connect Selected";
}

connectSerialBtn.addEventListener("click", async () => {
  if (activePort) {
    await disconnectSerial();
  } else {
    const selectedIndex = portSelect.value;
    if (selectedIndex !== "") {
      await connectToPort(availablePorts[selectedIndex]);
    }
  }
});

requestPortBtn.addEventListener("click", async () => {
  if (!("serial" in navigator)) return;
  try {
    const port = await navigator.serial.requestPort();
    await updatePortList();
    await connectToPort(port);
    // Ensure dropdown selects the newly connected port (simplification: just select the last one)
    portSelect.value = availablePorts.length - 1;
  } catch (error) {
    console.error("User cancelled port request or error occurred", error);
  }
});

async function readSerialData() {
  while (activePort && activePort.readable && keepReading) {
    reader = activePort.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const decodedData = new TextDecoder().decode(value);
        serialBuffer += decodedData;

        // Process buffer for markers #[key][direction]$
        // e.g., #ad$ (a down), #au$ (a up)
        let startIndex;
        while ((startIndex = serialBuffer.indexOf("#")) !== -1) {
          const endIndex = serialBuffer.indexOf("$", startIndex);
          if (endIndex !== -1) {
            // We have a complete command
            const command = serialBuffer
              .substring(startIndex + 1, endIndex)
              .toLowerCase();
            if (command.length === 2) {
              const key = command[0];
              const direction = command[1];

              if (padKeys.includes(key)) {
                if (direction === "d") {
                  activatePad(key);
                } else if (direction === "u") {
                  deactivatePad(key);
                }
              }
            }
            // Remove processed command from buffer
            serialBuffer = serialBuffer.substring(endIndex + 1);
          } else {
            // Incomplete command, wait for more data
            break;
          }
        }

        // Prevent buffer from growing infinitely if garbage data is received
        if (serialBuffer.length > 100) {
          const lastHash = serialBuffer.lastIndexOf("#");
          if (lastHash !== -1) {
            serialBuffer = serialBuffer.substring(lastHash);
          } else {
            serialBuffer = "";
          }
        }
      }
    } catch (error) {
      console.error("Error reading from serial:", error);
    } finally {
      if (reader) {
        reader.releaseLock();
      }
    }
  }
}

// Initialize on load
window.addEventListener("load", async () => {
  await loadDefaultAudio(); // Load defaults first
  await initDB; // Then load customs which override defaults
  if ("serial" in navigator) {
    await updatePortList();
    await autoConnectEsp32();
  }
});

// --- Reset Audio Feature ---
if (resetAudioBtn) {
  resetAudioBtn.addEventListener("click", async () => {
    if (
      !confirm(
        "Are you sure you want to reset all custom sounds? This will restore the default drum kit.",
      )
    ) {
      return;
    }

    // Clear IndexedDB
    if (db) {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        // Clear in-memory buffers
        customAudioBuffers = {};

        // Remove visual indicators
        padKeys.forEach((key) => {
          const pad = document.getElementById(`pad-${key}`);
          if (pad) {
            pad.classList.remove("has-custom");
          }
        });

        alert("Audio settings reset to defaults.");
      };

      request.onerror = (e) => {
        console.error("Error clearing IndexedDB:", e);
        alert("Failed to reset audio settings.");
      };
    }
  });
}
