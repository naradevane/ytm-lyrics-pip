# 🎵 YTM PiP Lyrics Pro

A lightweight, high-performance Chrome Extension that brings floating lyrics experience directly to YouTube Music via the Document Picture-in-Picture (PiP) API.

## ✨ Features

- **Hardware-Accelerated Smooth Scrolling:** Unlike traditional scrolling plugins that stutter, this extension uses a custom 144Hz Time-Interpolation engine combined with GPU-accelerated CSS `transform` (`translateY`) to deliver buttery-smooth, 60fps+ lyric movements.
- **Smart Drag & Sync:** Need to adjust the timing? Simply click and drag the lyrics. The kinetic scroll engine allows you to manually sync the lyrics on the fly with zero delay (Strict Grab mode).
- **Focus Highlight:** The active lyric line automatically illuminates, scales up, and bolds out when it reaches the center of your screen, fading out the rest for an immersive karaoke-like experience.
- **Seamless Metadata Integration:** Automatically scrapes and dynamically updates the currently playing song's Title, Artist, and high-res Album Cover directly into the PiP header.
- **Fallback Handling:** Gracefully handles unofficial or instrumental tracks with a clean fallback message when official lyrics are disabled by YouTube Music.
- **Mouse Wheel Support:** Full support for trackpad and mouse wheel scrolling with an automatic 25% boundary snap-back to prevent losing your place.

## 🛠️ Tech Stack

- **Vanilla JavaScript** (No heavy frameworks, highly optimized DOM manipulation)
- **CSS3** (Hardware-accelerated animations, Flexbox layout)
- **Document Picture-in-Picture API** (Modern web API for floating windows)

## 🚀 Installation (Developer Mode)

Since this extension is not yet published on the Chrome Web Store, you can install it manually:

1. Download or clone this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button.
5. Select the folder containing this extension's files.
6. Open [YouTube Music](https://music.youtube.com/), play a song, and click the "🎵 PiP Lirik" button in the bottom right corner!

## 📂 File Structure

- `manifest.json`: The core configuration file for the Chrome extension.
- `content.js`: The main brain. Handles scraping, DOM injection, PiP API requests, and the 144Hz LERP animation engine.
- `pip-style.css`: The stylesheet injected into the PiP window to style the lyrics, header, and controls.
- `icon*.png`: The extension icons.

## 💡 How it Works (The 144Hz Secret)
Standard `video.currentTime` updates from the browser only fire about 4 times per second (250ms delay). This causes micro-stutters on high refresh rate monitors. This extension bypasses that limitation by utilizing `performance.now()` as a micro-stopwatch to predict the remaining milliseconds between YouTube's updates, feeding that data into a Linear Interpolation (LERP) algorithm that drives a CSS `transform` via `requestAnimationFrame`. The result is a flawless 144Hz compatible scroll.

---
*Built with passion for a better listening experience.*