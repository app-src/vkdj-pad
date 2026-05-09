import sys
import re

with open("script.js", "r") as f:
    content = f.read()

# Replace defaultAudioBuffers with defaultAudioElements
content = content.replace(
    'let defaultAudioBuffers = {}; // Stores fetched default audio',
    'let defaultAudioElements = {}; // Stores standard HTML5 Audio elements'
)

# Replace loadDefaultAudio
old_load = """async function loadDefaultAudio() {
  initAudio();
  for (const key of Object.keys(defaultAudioURLs)) {
    try {
      const response = await fetch(defaultAudioURLs[key]);
      if (!response.ok) {
        console.error(
          `Failed to load default audio for ${key}: HTTP ${response.status}`,
        );
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      defaultAudioBuffers[key] = decodedBuffer;
    } catch (error) {
      console.error(`Error fetching default audio for ${key}:`, error);
    }
  }
}"""

new_load = """async function loadDefaultAudio() {
  for (const key of Object.keys(defaultAudioURLs)) {
    const audio = new Audio(defaultAudioURLs[key]);
    audio.crossOrigin = "anonymous";
    // Preload but don't play
    audio.preload = 'auto';
    defaultAudioElements[key] = audio;
  }
}"""

content = content.replace(old_load, new_load)

with open("script.js", "w") as f:
    f.write(content)
