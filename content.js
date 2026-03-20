// ==========================================
// YTM PIP LYRICS PRO - CONTENT SCRIPT
// ==========================================

// ==========================================
// 1. STATE & GLOBAL VARIABLES
// ==========================================
let pipWindow = null;
let lyricInterval = null;
let animationFrameId = null;

// State Kinetic Scroll & Drag
let isDragging = false;
let startY = 0;
let startScrollY = 0;
let currentScrollY = 0;
let scrollOffset = 0; 

// State Time Interpolation (Stopwatch 144Hz)
let lastVideoSrc = ""; 
let lastVideoTime = 0;
let lastRealTime = 0;

const icons = {
  prev: `<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"></path></svg>`,
  next: `<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"></path></svg>`,
  pause: `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>`
};

// ==========================================
// 2. FUNGSI UTILITY & SCRAPING
// ==========================================

function autoClickLyricsTab() {
  const lyricContainerExists = document.querySelector('ytmusic-description-shelf-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]') 
                            || document.querySelector('yt-formatted-string.non-expandable.description');
  
  if (lyricContainerExists) return;

  const tabs = document.querySelectorAll('tp-yt-paper-tab');
  for (const tab of tabs) {
    const tabText = tab.textContent.trim().toLowerCase();
    if (tabText === 'lyrics' || tabText === 'lirik') {
      if (tab.getAttribute('aria-selected') !== 'true') {
        tab.click();
      }
      break; 
    }
  }
}

function getLyrics() {
  const tabs = document.querySelectorAll('tp-yt-paper-tab');
  let isLyricsAvailable = false;
  let tabFound = false;

  for (const tab of tabs) {
    const tabText = tab.textContent.trim().toLowerCase();
    if (tabText === 'lyrics' || tabText === 'lirik') {
      tabFound = true;
      if (tab.getAttribute('aria-disabled') !== 'true') isLyricsAvailable = true;
      break; 
    }
  }

  if (tabFound && !isLyricsAvailable) {
    return "\n\n\n\nYahh, liriknya ga disediain sama YTM buat lagu ini. 🥲\n\nCoba play lagu yang lain ya.";
  }

  const lyricElement = document.querySelector('ytmusic-description-shelf-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"] yt-formatted-string.description') 
                    || document.querySelector('yt-formatted-string.non-expandable.description');
  
  if (!lyricElement || !lyricElement.textContent.trim()) {
    return "\n\n\n\nTunggu bentar yak, lagi nyari liriknya...";
  }
  
  return lyricElement.textContent;
}

function getSongInfo() {
  const titleEl = document.querySelector('yt-formatted-string.title.ytmusic-player-bar');
  const title = titleEl ? titleEl.textContent : document.title.replace(' | YouTube Music', '');

  const bylineEl = document.querySelector('.byline.ytmusic-player-bar');
  let artist = '';
  if (bylineEl) {
    artist = bylineEl.textContent.split('•')[0].trim();
  }

  const imgEl = document.querySelector('ytmusic-player-bar img.yt-img-shadow') 
             || document.querySelector('ytmusic-player-bar img') 
             || document.querySelector('#song-image img');

  let coverSrc = '';
  if (imgEl && imgEl.src && !imgEl.src.startsWith('data:image')) {
    coverSrc = imgEl.src;
    if (coverSrc.match(/w\d+-h\d+/)) {
      coverSrc = coverSrc.replace(/w\d+-h\d+/, 'w120-h120');
    } else if (coverSrc.match(/=w\d+-h\d+/)) {
      coverSrc = coverSrc.replace(/=w\d+-h\d+/, '=w120-h120');
    }
  }

  return { title, artist, coverSrc };
}

// ==========================================
// 3. FUNGSI MEDIA CONTROLS
// ==========================================
function playPauseSong() {
  const btn = document.querySelector('#play-pause-button');
  if (btn) btn.click();
}
function nextSong() {
  const btn = document.querySelector('.next-button');
  if (btn) btn.click();
}
function prevSong() {
  const btn = document.querySelector('.previous-button');
  if (btn) btn.click();
}

// ==========================================
// 4. MESIN ANIMASI & LOGIKA PACING LIRIK
// ==========================================

function calculateEasedProgress(p) {
  const edgeThreshold = 0.10; 
  const slowSpeed = 0.9; 
  const normalSpeed = 1.0;

  const zone1Size = edgeThreshold;
  const zone2Size = 1.0 - (2 * edgeThreshold); 
  const zone3Size = edgeThreshold;
  
  const totalWeight = (zone1Size * slowSpeed) + (zone2Size * normalSpeed) + (zone3Size * slowSpeed);
  
  let eased = 0;
  
  if (p <= edgeThreshold) {
    eased = (p * slowSpeed) / totalWeight;
  } else if (p <= 1.0 - edgeThreshold) {
    const zone1End = (zone1Size * slowSpeed) / totalWeight;
    const pInZone2 = p - edgeThreshold;
    eased = zone1End + ((pInZone2 * normalSpeed) / totalWeight);
  } else {
    const zone1End = (zone1Size * slowSpeed) / totalWeight;
    const zone2End = zone1End + ((zone2Size * normalSpeed) / totalWeight);
    const pInZone3 = p - (1.0 - edgeThreshold);
    eased = zone2End + ((pInZone3 * slowSpeed) / totalWeight);
  }
  return eased;
}

function runSmoothScroll() {
  if (!pipWindow) return; 

  const videoElement = document.querySelector('video');
  const contentEl = pipWindow.document.getElementById('lyrics-content');
  
  if (!contentEl) {
    animationFrameId = requestAnimationFrame(runSmoothScroll);
    return;
  }
  
  if (videoElement && videoElement.duration > 0 && !videoElement.paused) {
    if (videoElement.src !== lastVideoSrc || videoElement.currentTime < 1) {
      scrollOffset = 0; 
      lastVideoSrc = videoElement.src;
    }

    const duration = videoElement.duration;
    let currentTime = videoElement.currentTime; 
    
    // Trik Interpolasi Waktu 144Hz (Prediksi millisecond)
    const now = performance.now();
    if (currentTime !== lastVideoTime) {
      lastVideoTime = currentTime;
      lastRealTime = now;
    } else {
      currentTime = lastVideoTime + ((now - lastRealTime) / 1000);
    }

    const introBuffer = 15;
    const outroBuffer = 15;
    let rawProgress = 0;

    if (duration <= (introBuffer + outroBuffer)) {
      rawProgress = currentTime / duration;
    } else {
      if (currentTime > introBuffer) {
        const activeDuration = duration - introBuffer - outroBuffer;
        const activeTime = currentTime - introBuffer;
        rawProgress = activeTime / activeDuration;
        if (rawProgress > 1) rawProgress = 1;
      }
    }

    const finalProgress = calculateEasedProgress(rawProgress);
    const maxScroll = Math.max(0, contentEl.scrollHeight - pipWindow.innerHeight);
    const baseTargetScrollY = maxScroll * finalProgress;
    
    if (isDragging) {
      scrollOffset = currentScrollY - baseTargetScrollY;
    } else {
      const maxAllowedOffset = maxScroll * 0.25; 
      if (Math.abs(scrollOffset) > maxAllowedOffset) {
        scrollOffset = 0; 
      }

      const targetScrollY = baseTargetScrollY + scrollOffset;
      // LERP Ngejar target posisi
      currentScrollY += (targetScrollY - currentScrollY) * 0.05; 
      
      // KUNCI GPU: Geser elemen pake transform (Super Mulus!)
      contentEl.style.transform = `translateY(-${currentScrollY}px)`;
    }
  }
  
  // Deteksi Lirik Tengah buat efek Highlight
  const centerViewport = pipWindow.innerHeight / 2;
  const lyricLines = pipWindow.document.querySelectorAll('.lyric-line');
  
  let minDistance = Infinity;
  let activeIndex = -1;

  lyricLines.forEach((line, index) => {
    const rect = line.getBoundingClientRect();
    const lineCenter = rect.top + (rect.height / 2);
    const distance = Math.abs(centerViewport - lineCenter);
    
    if (distance < minDistance) {
      minDistance = distance;
      activeIndex = index;
    }
  });

  lyricLines.forEach((line, index) => {
    if (index === activeIndex) {
      line.classList.add('active');
    } else {
      line.classList.remove('active');
    }
  });
  
  animationFrameId = requestAnimationFrame(runSmoothScroll);
}

// ==========================================
// 5. DOM UPDATER (Tiap 1 Detik)
// ==========================================

function updatePipContent() {
  if (!pipWindow) return; 
  
  autoClickLyricsTab();
  
  const contentElement = pipWindow.document.getElementById('lyrics-content');
  const latestLyrics = getLyrics();
  
  if (contentElement && contentElement.getAttribute('data-raw') !== latestLyrics) {
    contentElement.setAttribute('data-raw', latestLyrics);
    contentElement.innerHTML = '';
    
    const lines = latestLyrics.split('\n');
    lines.forEach(lineText => {
      const div = pipWindow.document.createElement('div');
      div.className = 'lyric-line';
      div.innerText = lineText || '\u00A0'; 
      contentElement.appendChild(div);
    });
  }

  // Update Icon Play/Pause
  const playBtnPiP = pipWindow.document.getElementById('pip-play-btn');
  if (playBtnPiP) {
    const playerBar = document.querySelector('ytmusic-player-bar');
    const playing = playerBar && playerBar.hasAttribute('playing');

    if (playing) {
      playBtnPiP.innerHTML = icons.pause;
      playBtnPiP.title = "Pause";
    } else {
      playBtnPiP.innerHTML = icons.play;
      playBtnPiP.title = "Play";
    }
  }

  // Update Header Info Lagu & Cover
  const info = getSongInfo();
  const pipTitleEl = pipWindow.document.getElementById('pip-song-title');
  const pipArtistEl = pipWindow.document.getElementById('pip-song-artist');
  const pipCoverEl = pipWindow.document.getElementById('pip-song-cover');
  
  if (pipTitleEl && pipTitleEl.innerText !== info.title) pipTitleEl.innerText = info.title;
  if (pipArtistEl && pipArtistEl.innerText !== info.artist) pipArtistEl.innerText = info.artist;
  
  if (pipCoverEl) {
    if (info.coverSrc) {
      if (pipCoverEl.src !== info.coverSrc) {
        pipCoverEl.src = info.coverSrc;
        pipCoverEl.style.display = 'block'; 
      }
    } else {
      pipCoverEl.style.display = 'none'; 
    }
  }
}

// ==========================================
// 6. MAIN FUNGSI BUKA PIP & EVENT LISTENER
// ==========================================

async function openPip() {
  if (pipWindow) {
    pipWindow.close();
    return;
  }

  try {
    pipWindow = await window.documentPictureInPicture.requestWindow({
      width: 500,  
      height: 250 
    });

    // Load CSS & Font Eksternal
    const cssResponse = await fetch(chrome.runtime.getURL('pip-style.css'));
    const cssText = await cssResponse.text();
    const style = pipWindow.document.createElement('style');
    style.textContent = cssText;
    pipWindow.document.head.appendChild(style);

    const fontLink = pipWindow.document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap';
    fontLink.rel = 'stylesheet';
    pipWindow.document.head.appendChild(fontLink);

    // Bikin Header Info Lagu
    const songInfo = pipWindow.document.createElement('div');
    songInfo.className = 'song-info-container';
    
    const pipCover = pipWindow.document.createElement('img');
    pipCover.id = 'pip-song-cover';
    pipCover.className = 'album-cover';
    
    const textWrapper = pipWindow.document.createElement('div');
    textWrapper.className = 'song-text-wrapper';
    
    const pipTitle = pipWindow.document.createElement('div');
    pipTitle.id = 'pip-song-title';
    pipTitle.className = 'song-title';
    
    const pipArtist = pipWindow.document.createElement('div');
    pipArtist.id = 'pip-song-artist';
    pipArtist.className = 'song-artist';

    textWrapper.appendChild(pipTitle);
    textWrapper.appendChild(pipArtist);
    songInfo.appendChild(pipCover);
    songInfo.appendChild(textWrapper);
    pipWindow.document.body.appendChild(songInfo);

    // Bikin Container Lirik Utama
    const content = pipWindow.document.createElement('div');
    content.id = 'lyrics-content';
    pipWindow.document.body.appendChild(content);

    // Bikin Container Tombol Media
    const controls = pipWindow.document.createElement('div');
    controls.className = 'controls-container';

    const prevBtn = pipWindow.document.createElement('button');
    prevBtn.className = 'ctrl-btn';
    prevBtn.innerHTML = icons.prev; 
    prevBtn.onclick = prevSong;

    const playBtn = pipWindow.document.createElement('button');
    playBtn.id = 'pip-play-btn'; 
    playBtn.className = 'ctrl-btn';
    playBtn.innerHTML = icons.pause;
    playBtn.onclick = playPauseSong;

    const nextBtn = pipWindow.document.createElement('button');
    nextBtn.className = 'ctrl-btn';
    nextBtn.innerHTML = icons.next; 
    nextBtn.onclick = nextSong;

    controls.append(prevBtn, playBtn, nextBtn);
    pipWindow.document.body.appendChild(controls);

    // ==========================================
    // LOGIKA STRICT GRAB & WHEEL HACK (GPU)
    // ==========================================
    const pipBody = pipWindow.document.body;

    pipWindow.addEventListener('mousedown', (e) => {
      // Abaikan kalo klik tombol/header
      if (e.target.closest('.controls-container') || e.target.closest('.song-info-container')) return;

      isDragging = true;
      startY = e.clientY;
      startScrollY = currentScrollY; // Kunci posisi saat ini
      pipBody.style.cursor = 'grabbing';
    });

    pipWindow.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault(); 
      
      const deltaY = e.clientY - startY;
      currentScrollY = startScrollY - deltaY;
      
      // Langsung geser secara visual pas ditarik (100% Responsif)
      const contentEl = pipWindow.document.getElementById('lyrics-content');
      if (contentEl) contentEl.style.transform = `translateY(-${currentScrollY}px)`;
    });

    const stopDragging = () => {
      if (!isDragging) return;
      isDragging = false;
      pipBody.style.cursor = 'default';
    };

    pipWindow.addEventListener('mouseup', stopDragging);
    pipWindow.addEventListener('mouseleave', stopDragging);

    // Wheel Scroll buat ngoreksi
    pipWindow.addEventListener('wheel', (e) => {
      e.preventDefault(); 
      scrollOffset += e.deltaY; 
      
      const contentEl = pipWindow.document.getElementById('lyrics-content');
      if (contentEl) {
        const maxScroll = Math.max(0, contentEl.scrollHeight - pipWindow.innerHeight);
        const maxAllowedOffset = maxScroll * 0.25; 
        
        // Reset snap-back kalo scrollnya ngawur kejauhan
        if (Math.abs(scrollOffset) > maxAllowedOffset) scrollOffset = 0; 
      }
    }, { passive: false });

    // ==========================================
    // JALANIN MESIN
    // ==========================================
    lyricInterval = setInterval(updatePipContent, 1000);
    runSmoothScroll(); // Panggil animasi GPU 60fps
    autoClickLyricsTab();

    // Cleanup kalo ditutup
    pipWindow.addEventListener("pagehide", () => {
      pipWindow = null;
      clearInterval(lyricInterval); 
      cancelAnimationFrame(animationFrameId);
      isDragging = false; // Reset state
    });

  } catch (error) {
    console.error("Gagal buka Document PiP:", error);
    alert("Gagal buka PiP. Pastiin browser lu udah support Document Picture-in-Picture API.");
  }
}

// ==========================================
// 7. INJECT TOMBOL TRIGGER
// ==========================================

function injectButton() {
  if (document.getElementById('pip-lyrics-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'pip-lyrics-btn';
  btn.innerText = '🎵 PiP Lirik';
  
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '100px', 
    right: '30px',
    zIndex: '9999',
    padding: '12px 18px',
    backgroundColor: '#ffffff',
    color: '#000000',
    border: 'none',
    borderRadius: '24px',
    cursor: 'pointer',
    fontWeight: 'bold',
    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
    transition: 'transform 0.2s'
  });

  btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.05)');
  btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
  btn.addEventListener('click', openPip);
  
  document.body.appendChild(btn);
}

// Tunggu 3 detik biar YTM kelar loading sebelum inject tombol
setTimeout(injectButton, 3000);