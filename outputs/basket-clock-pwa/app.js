const STORAGE_KEY = "basket-clock-state-v1";
const DEFAULT_STATE = {
  duration: 600,
  remaining: 600,
  running: false,
  homeScore: 0,
  awayScore: 0,
  homeName: "HOME",
  awayName: "AWAY",
  mode: "normal"
};

const FLICK_THRESHOLD = 40;
const AUDIO_FILES = {
  half: "audio/half.mp3",
  "60": "audio/one-minute.mp3",
  "30": "audio/thirty.mp3",
  "15": "audio/no-time.mp3",
  "10": "audio/10.mp3",
  "9": "audio/9.mp3",
  "8": "audio/8.mp3",
  "7": "audio/7.mp3",
  "6": "audio/6.mp3",
  "5": "audio/5.mp3",
  "4": "audio/4.mp3",
  "3": "audio/3.mp3",
  "2": "audio/2.mp3",
  "1": "audio/1.mp3",
  end: "audio/end.mp3"
};

const els = {
  app: document.getElementById("app"),
  runningTimer: document.getElementById("runningTimer"),
  timerPicker: document.getElementById("timerPicker"),
  minuteWheel: document.getElementById("minuteWheel"),
  secondWheel: document.getElementById("secondWheel"),
  minutePrev: document.getElementById("minutePrev"),
  minuteValue: document.getElementById("minuteValue"),
  minuteNext: document.getElementById("minuteNext"),
  secondPrev: document.getElementById("secondPrev"),
  secondValue: document.getElementById("secondValue"),
  secondNext: document.getElementById("secondNext"),
  startStopBtn: document.getElementById("startStopBtn"),
  resetTimerBtn: document.getElementById("resetTimerBtn"),
  resetScoresBtn: document.getElementById("resetScoresBtn"),
  modeToggleBtn: document.getElementById("modeToggleBtn"),
  homePanel: document.getElementById("homePanel"),
  awayPanel: document.getElementById("awayPanel"),
  homeScore: document.getElementById("homeScore"),
  awayScore: document.getElementById("awayScore")
};

let state = loadState();
let tickId = null;
let endAt = 0;
let audioContext = null;
let wakeLock = null;
let announced = new Set();
let activeDuration = state.duration;
let audioUnlocked = false;
let timerHasStarted = false;
let sessionActive = false;
const audioBank = new Map();
let fitFrame = null;
let fitCanvasContext = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...DEFAULT_STATE, ...saved, running: false };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  const toSave = { ...state, running: false };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

function clampSeconds(value) {
  return Math.max(0, Math.min(99 * 60 + 59, Math.round(value)));
}

function clampMinute(value) {
  return Math.max(0, Math.min(99, value));
}

function clampSecond(value) {
  return Math.max(0, Math.min(59, value));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatTime(totalSeconds) {
  return `${pad2(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)}`;
}

function getMinute() {
  return Math.floor(state.remaining / 60);
}

function getSecond() {
  return state.remaining % 60;
}

function renderWheel(prevEl, valueEl, nextEl, value, min, max, formatter) {
  prevEl.textContent = formatter(value <= min ? max : value - 1);
  valueEl.textContent = formatter(value);
  nextEl.textContent = formatter(value >= max ? min : value + 1);
}

function renderSecondWheel(second) {
  const current = clampSecond(second);
  const prev = current <= 0 ? 59 : current - 1;
  const next = current >= 59 ? 0 : current + 1;
  els.secondPrev.textContent = pad2(prev);
  els.secondValue.textContent = pad2(current);
  els.secondNext.textContent = pad2(next);
}

function render() {
  const minute = getMinute();
  const second = getSecond();
  els.runningTimer.textContent = formatTime(state.remaining);
  renderWheel(els.minutePrev, els.minuteValue, els.minuteNext, minute, 0, 99, pad2);
  renderSecondWheel(second);
  els.startStopBtn.setAttribute("aria-label", state.running ? "Stop" : "Start");
  els.startStopBtn.innerHTML = `<span class="control-icon ${state.running ? "pause-icon" : "play-icon"}" aria-hidden="true"></span>`;
  els.startStopBtn.classList.toggle("is-active", state.running);
  els.app.classList.toggle("is-running", state.running);
  els.app.classList.toggle("timer-only", state.mode === "timer");
  els.timerPicker.classList.toggle("is-running", state.running);
  els.modeToggleBtn.textContent = state.mode === "timer" ? "S" : "T";
  els.modeToggleBtn.setAttribute("aria-label", state.mode === "timer" ? "Score mode" : "Timer only mode");
  els.homeScore.textContent = state.homeScore;
  els.awayScore.textContent = state.awayScore;
  scheduleRunningTimerFit();
}

function scheduleRunningTimerFit() {
  if (fitFrame !== null) {
    window.cancelAnimationFrame(fitFrame);
  }
  fitFrame = window.requestAnimationFrame(() => {
    fitFrame = null;
    fitRunningTimer();
  });
}

function fitRunningTimer() {
  if (!state.running) return;
  const timer = els.runningTimer;
  const zone = document.getElementById("timerZone");
  const zoneRect = zone.getBoundingClientRect();
  const maxWidth = Math.max(1, zoneRect.width - 34);
  const maxHeight = Math.max(1, zoneRect.height - 14);
  const upper = state.mode === "timer"
    ? Math.min(maxHeight / 0.94, maxWidth / 3.18)
    : Math.min(maxHeight / 0.94, maxWidth / 3.16);
  let low = 48;
  let high = Math.max(low, upper);

  timer.style.fontSize = `${Math.floor(high)}px`;
  for (let i = 0; i < 8; i += 1) {
    const mid = (low + high) / 2;
    timer.style.fontSize = `${mid}px`;
    const measuredWidth = measureTimerTextWidth(timer, mid);
    const tooWide = measuredWidth > maxWidth || timer.scrollWidth > timer.clientWidth;
    const tooTall = mid * 0.94 > maxHeight;
    if (tooWide || tooTall) {
      high = mid;
    } else {
      low = mid;
    }
  }
  timer.style.fontSize = `${Math.floor(low * 0.965)}px`;
}

function measureTimerTextWidth(timer, fontSize) {
  try {
    if (!fitCanvasContext) {
      fitCanvasContext = document.createElement("canvas").getContext("2d");
    }
    const style = window.getComputedStyle(timer);
    fitCanvasContext.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    return fitCanvasContext.measureText(timer.textContent).width;
  } catch {
    return timer.scrollWidth;
  }
}

function setTimerParts(minute, second) {
  if (state.running) return;
  const normalizedMinute = clampMinute(minute);
  const normalizedSecond = clampSecond(second);
  state.remaining = clampSeconds(normalizedMinute * 60 + normalizedSecond);
  state.duration = state.remaining;
  activeDuration = state.duration;
  announced = new Set();
  timerHasStarted = false;
  sessionActive = false;
  stopAllAudio();
  render();
  saveState();
}

function adjustMinute(delta) {
  if (state.running) return;
  setTimerParts(getMinute() + delta, getSecond());
}

function adjustSecond(delta) {
  if (state.running) return;
  const next = (getSecond() + delta + 60) % 60;
  setTimerParts(getMinute(), next);
}

function preloadAudio() {
  Object.entries(AUDIO_FILES).forEach(([key, src]) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 1;
    audio.addEventListener("error", () => {
      console.warn(`Audio file unavailable: ${src}`);
    }, { once: true });
    audio.load();
    audioBank.set(key, audio);
  });
}

function initAudio() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) {
      audioContext = new AudioCtor();
    }
  }
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function unlockAudioElements() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  audioBank.forEach((audio) => {
    const previousMuted = audio.muted;
    const previousVolume = audio.volume;
    audio.muted = true;
    audio.volume = 0;
    audio.currentTime = 0;
    const attempt = audio.play();
    if (attempt && typeof attempt.then === "function") {
      attempt
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = previousMuted;
          audio.volume = previousVolume;
        })
        .catch(() => {
          audio.muted = previousMuted;
          audio.volume = previousVolume;
        });
    } else {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = previousMuted;
      audio.volume = previousVolume;
    }
  });
}

function prepareSound() {
  initAudio();
  unlockAudioElements();
}

function playAudioKey(key) {
  const audio = audioBank.get(key);
  if (!audio) {
    console.warn(`Audio key unavailable: ${key}`);
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const done = (ok) => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      resolve(ok);
    };
    const onEnded = () => done(true);
    const onError = () => {
      console.warn(`Audio file unavailable: ${audio.currentSrc || audio.src}`);
      done(false);
    };

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = 1;
      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });
      const attempt = audio.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch((error) => {
          console.warn(`Audio playback failed: ${audio.currentSrc || audio.src}`, error);
          done(false);
        });
      }
    } catch (error) {
      console.warn(`Audio playback failed: ${audio.currentSrc || audio.src}`, error);
      done(false);
    }
  });
}

function stopAllAudio() {
  audioBank.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}

async function playEndSequence() {
  stopAllAudio();
  for (let count = 0; count < 3; count += 1) {
    await playAudioKey("end");
  }
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    await wakeLock.release();
  } catch {
    wakeLock = null;
  }
}

function startTimer() {
  if (state.running || state.remaining <= 0) return;
  prepareSound();
  if (!sessionActive) {
    announced = new Set();
    activeDuration = state.remaining;
    state.duration = state.remaining;
    sessionActive = true;
  }
  timerHasStarted = true;
  state.running = true;
  endAt = Date.now() + state.remaining * 1000;
  tickId = window.setInterval(updateTimer, 160);
  requestWakeLock();
  render();
  saveState();
}

function stopTimer() {
  if (!state.running) return;
  state.remaining = clampSeconds(Math.ceil((endAt - Date.now()) / 1000));
  state.running = false;
  window.clearInterval(tickId);
  tickId = null;
  releaseWakeLock();
  render();
  saveState();
}

function announce(key) {
  if (!timerHasStarted || !state.running) return;
  if (announced.has(key)) return;
  announced.add(key);
  playAudioKey(key);
}

function maybeAnnounce(previous, current) {
  if (!timerHasStarted || !state.running) return;
  if (current <= 0) return;
  const half = Math.floor(activeDuration / 2);
  if (half > 0 && previous > half && current <= half) announce("half");
  if (previous > 60 && current <= 60) announce("60");
  if (previous > 30 && current <= 30) announce("30");
  if (previous > 15 && current <= 15) announce("15");
  for (let second = 10; second >= 1; second -= 1) {
    if (previous > second && current <= second) {
      announce(String(second));
    }
  }
}

function updateTimer() {
  const next = clampSeconds(Math.ceil((endAt - Date.now()) / 1000));
  if (next === state.remaining) return;
  const previous = state.remaining;
  state.remaining = next;
  maybeAnnounce(previous, state.remaining);
  if (state.remaining <= 0) {
    state.running = false;
    timerHasStarted = false;
    sessionActive = false;
    window.clearInterval(tickId);
    tickId = null;
    releaseWakeLock();
    playEndSequence();
  }
  render();
  saveState();
}

function resetTimer() {
  stopTimer();
  announced = new Set();
  timerHasStarted = false;
  sessionActive = false;
  stopAllAudio();
  state.remaining = state.duration;
  activeDuration = state.duration;
  render();
  saveState();
}

function toggleMode() {
  state.mode = state.mode === "timer" ? "normal" : "timer";
  render();
  saveState();
}

function adjustScore(team, delta) {
  const key = team === "home" ? "homeScore" : "awayScore";
  state[key] = Math.max(0, state[key] + delta);
  render();
  saveState();
}

function bindFlick(target, onFlick) {
  let startY = 0;
  let tracking = false;

  target.addEventListener("pointerdown", (event) => {
    tracking = true;
    startY = event.clientY;
    target.setPointerCapture(event.pointerId);
  });

  target.addEventListener("pointerup", (event) => {
    if (!tracking) return;
    tracking = false;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaY) < FLICK_THRESHOLD) return;
    onFlick(deltaY < 0 ? 1 : -1);
  });

  target.addEventListener("pointercancel", () => {
    tracking = false;
  });
}

function bindWheelPicker(target, onChange) {
  let startY = 0;
  let latestY = 0;
  let tracking = false;

  target.addEventListener("pointerdown", (event) => {
    if (state.running) return;
    tracking = true;
    startY = event.clientY;
    latestY = event.clientY;
    target.classList.add("is-dragging");
    target.setPointerCapture(event.pointerId);
  });

  target.addEventListener("pointermove", (event) => {
    if (!tracking || state.running) return;
    latestY = event.clientY;
    const deltaY = latestY - startY;
    target.style.setProperty("--drag-offset", `${deltaY}px`);
  });

  target.addEventListener("pointerup", () => {
    if (!tracking) return;
    tracking = false;
    const deltaY = latestY - startY;
    const itemHeight = Math.max(1, target.clientHeight / 3);
    let steps = Math.round(-deltaY / itemHeight);
    if (steps === 0 && Math.abs(deltaY) >= FLICK_THRESHOLD) {
      steps = deltaY < 0 ? 1 : -1;
    }
    target.classList.remove("is-dragging");
    target.style.setProperty("--drag-offset", "0px");
    if (steps !== 0 && !state.running) onChange(steps);
  });

  target.addEventListener("pointercancel", () => {
    tracking = false;
    target.classList.remove("is-dragging");
    target.style.setProperty("--drag-offset", "0px");
  });

  target.addEventListener("wheel", (event) => {
    if (state.running) return;
    event.preventDefault();
    onChange(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });
}

function bindEvents() {
  document.addEventListener("pointerdown", initAudio, { once: true });
  preventDoubleTapZoom();

  els.startStopBtn.addEventListener("click", () => {
    state.running ? stopTimer() : startTimer();
  });

  els.resetTimerBtn.addEventListener("click", resetTimer);
  els.resetScoresBtn.addEventListener("click", () => {
    state.homeScore = 0;
    state.awayScore = 0;
    render();
    saveState();
  });
  els.modeToggleBtn.addEventListener("click", toggleMode);

  bindFlick(els.homePanel, (direction) => adjustScore("home", direction));
  bindFlick(els.awayPanel, (direction) => adjustScore("away", direction));
  bindWheelPicker(els.minuteWheel, adjustMinute);
  bindWheelPicker(els.secondWheel, adjustSecond);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.running) {
      requestWakeLock();
      updateTimer();
      scheduleRunningTimerFit();
    }
  });

  window.addEventListener("resize", scheduleRunningTimerFit);
  window.addEventListener("orientationchange", scheduleRunningTimerFit);
}

function preventDoubleTapZoom() {
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener("gesturestart", (event) => {
    event.preventDefault();
  }, { passive: false });
}

state.remaining = clampSeconds(state.remaining);
state.duration = clampSeconds(state.duration);
activeDuration = state.duration;
preloadAudio();
bindEvents();
render();
