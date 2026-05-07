const padKeys = ["a", "s", "d", "f", "g", "h", "j", "k", "l", "c", "v", "b"];
const padGrid = document.getElementById("padGrid");

// Create pads
padKeys.forEach((key) => {
  const pad = document.createElement("div");
  pad.classList.add("pad");
  pad.id = `pad-${key}`;
  pad.textContent = key;
  padGrid.appendChild(pad);
});

// Audio Context and Synthesizer
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// Frequencies for the 12 notes (C4 to B4)
const frequencies = {
  a: 261.63, // C4
  s: 277.18, // C#4/Db4
  d: 293.66, // D4
  f: 311.13, // D#4/Eb4
  g: 329.63, // E4
  h: 349.23, // F4
  j: 369.99, // F#4/Gb4
  k: 392.0, // G4
  l: 415.3, // G#4/Ab4
  c: 440.0, // A4
  v: 466.16, // A#4/Bb4
  b: 493.88, // B4
};

const activeOscillators = {};

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
}

function playSound(key) {
  if (!frequencies[key]) return;
  initAudio();

  if (activeOscillators[key]) return; // Already playing

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = "sine"; // sine, square, sawtooth, triangle
  oscillator.frequency.setValueAtTime(frequencies[key], audioCtx.currentTime);

  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.05); // Attack
  gainNode.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.1); // Decay

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();

  activeOscillators[key] = { oscillator, gainNode };
}

function stopSound(key) {
  if (!activeOscillators[key]) return;

  const { oscillator, gainNode } = activeOscillators[key];

  gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
  gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1); // Release

  oscillator.stop(audioCtx.currentTime + 0.1);

  delete activeOscillators[key];
}

// Event Listeners for UI and Keyboard
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

// Mouse/Touch events for the visual pads
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

// Web Serial API Foundation
const connectSerialBtn = document.getElementById("connectSerialBtn");
let port;
let reader;
let keepReading = true;

async function connectSerial() {
  if ("serial" in navigator) {
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 }); // Default baudRate, change as needed
      connectSerialBtn.textContent = "Serial Connected";
      connectSerialBtn.style.backgroundColor = "#555";

      keepReading = true;
      readSerialData();
    } catch (error) {
      console.error("Error connecting to serial port:", error);
      alert("Failed to connect to serial port.");
    }
  } else {
    alert("Web Serial API not supported in your browser.");
  }
}

async function readSerialData() {
  while (port.readable && keepReading) {
    reader = port.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break; // Reader has been canceled.
        }

        // Assuming data is sent as characters mapping to pads, e.g., 'a', 's'
        // You might need to adjust parsing based on your Arduino code
        const decodedData = new TextDecoder().decode(value);

        // Process each character
        for (let i = 0; i < decodedData.length; i++) {
          const char = decodedData[i].toLowerCase();
          // Basic handling: toggle sound if character matches
          // A more robust protocol (e.g., 'a_ON', 'a_OFF') is recommended for real usage
          if (padKeys.includes(char)) {
            // Simple simulation: trigger down, then immediately schedule up to mimic hit
            activatePad(char);
            setTimeout(() => deactivatePad(char), 100);
          }
        }
      }
    } catch (error) {
      console.error("Error reading from serial:", error);
    } finally {
      reader.releaseLock();
    }
  }
}

connectSerialBtn.addEventListener("click", connectSerial);
