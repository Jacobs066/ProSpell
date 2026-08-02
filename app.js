"use strict";

/* ---------------- themes ---------------- */
const THEMES = ["white", "black", "cyan", "paper", "rose"];
const DARK_THEMES = ["black", "cyan", "custom"];

const modeToggleBtn = document.getElementById("modeToggleBtn");
const modeIconSun = document.getElementById("modeIconSun");
const modeIconMoon = document.getElementById("modeIconMoon");
const bgBtn = document.getElementById("bgBtn");
const bgRemoveBtn = document.getElementById("bgRemoveBtn");
const bgFileInput = document.getElementById("bgFileInput");
const themeSwatches = document.querySelectorAll(".swatch[data-theme]");

const BG_STORAGE_KEY = "pronounce-bg-image";
const BG_MAX_DIMENSION = 1600;
const BG_JPEG_QUALITY = 0.82;

function setBodyBackground(dataUrl) {
  document.body.style.backgroundImage =
    "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(" + dataUrl + ")";
}

function clearBodyBackground() {
  document.body.style.backgroundImage = "";
}

function syncThemeUI(theme) {
  const isDark = DARK_THEMES.includes(theme);
  modeIconSun.hidden = isDark;
  modeIconMoon.hidden = !isDark;
  modeToggleBtn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  modeToggleBtn.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");

  themeSwatches.forEach((swatch) => {
    swatch.classList.toggle("is-active", swatch.dataset.theme === theme);
  });

  bgRemoveBtn.hidden = theme !== "custom";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (theme !== "custom") {
    clearBodyBackground();
    try { localStorage.removeItem(BG_STORAGE_KEY); } catch (_) {}
  }
  try { localStorage.setItem("pronounce-theme", theme); } catch (_) {}
  syncThemeUI(theme);
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("pronounce-theme"); } catch (_) {}

  if (saved === "custom") {
    let savedBg = null;
    try { savedBg = localStorage.getItem(BG_STORAGE_KEY); } catch (_) {}
    if (savedBg) {
      setBodyBackground(savedBg);
      applyTheme("custom");
      return;
    }
    saved = null;
  }

  if (!saved || !THEMES.includes(saved)) {
    saved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "black" : "white";
  }
  applyTheme(saved);
}

modeToggleBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "white";
  applyTheme(DARK_THEMES.includes(current) ? "white" : "black");
});

themeSwatches.forEach((swatch) => {
  swatch.addEventListener("click", () => applyTheme(swatch.dataset.theme));
});

bgBtn.addEventListener("click", () => bgFileInput.click());

bgRemoveBtn.addEventListener("click", () => applyTheme("white"));

bgFileInput.addEventListener("change", () => {
  const file = bgFileInput.files && bgFileInput.files[0];
  bgFileInput.value = "";
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, BG_MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", BG_JPEG_QUALITY);

      setBodyBackground(dataUrl);
      applyTheme("custom");
      try { localStorage.setItem(BG_STORAGE_KEY, dataUrl); } catch (_) {
        // storage quota exceeded; background still applies for this session
      }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

initTheme();

/* ---------------- fonts ---------------- */
const FONTS = [
  { id: "serif", label: "Serif", stack: '"Lora", Georgia, "Times New Roman", serif' },
  { id: "sans", label: "Sans", stack: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: "mono", label: "Mono", stack: '"Space Mono", "Courier New", monospace' },
  { id: "rounded", label: "Rounded", stack: '"Fraunces", Georgia, serif' },
];
const FONT_KEY = "pronounce-font";
const fontOptionsEl = document.getElementById("fontOptions");

function renderFontOptions(activeId) {
  fontOptionsEl.innerHTML = "";
  FONTS.forEach((font) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "font-option" + (font.id === activeId ? " is-active" : "");
    btn.textContent = font.label;
    btn.style.fontFamily = font.stack;
    btn.addEventListener("click", () => applyFont(font.id));
    fontOptionsEl.appendChild(btn);
  });
}

function applyFont(fontId) {
  const font = FONTS.find((f) => f.id === fontId) || FONTS[0];
  document.documentElement.style.setProperty("--font-family", font.stack);
  try { localStorage.setItem(FONT_KEY, font.id); } catch (_) {}
  renderFontOptions(font.id);
}

function initFont() {
  let saved = null;
  try { saved = localStorage.getItem(FONT_KEY); } catch (_) {}
  applyFont(FONTS.some((f) => f.id === saved) ? saved : FONTS[0].id);
}

initFont();

/* ---------------- settings panel ---------------- */
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");

function closeSettingsPanel() {
  settingsPanel.hidden = true;
}

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeInstallPanel();
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsBtn.classList.add("is-spinning");
});

settingsBtn.addEventListener("animationend", () => {
  settingsBtn.classList.remove("is-spinning");
});

settingsPanel.addEventListener("click", (e) => e.stopPropagation());

/* ---------------- install-help panel ---------------- */
const installBtn = document.getElementById("installBtn");
const installPanel = document.getElementById("installPanel");

function closeInstallPanel() {
  installPanel.hidden = true;
}

installBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeSettingsPanel();
  installPanel.hidden = !installPanel.hidden;
});

installPanel.addEventListener("click", (e) => e.stopPropagation());

document.addEventListener("click", () => {
  closeSettingsPanel();
  closeInstallPanel();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSettingsPanel();
    closeInstallPanel();
  }
});

/* ---------------- elements ---------------- */
const screenHome = document.getElementById("screenHome");
const screenResult = document.getElementById("screenResult");

const formHero = document.getElementById("searchFormHero");
const inputHero = document.getElementById("searchInputHero");
const formSlim = document.getElementById("searchFormSlim");
const inputSlim = document.getElementById("searchInputSlim");
const clearBtn = document.getElementById("clearBtn");
const homeLink = document.getElementById("homeLink");

const resultCard = document.getElementById("resultCard");
const notFoundCard = document.getElementById("notFoundCard");
const loadingCard = document.getElementById("loadingCard");
const notFoundTitle = document.getElementById("notFoundTitle");
const notFoundText = document.getElementById("notFoundText");

const wordEl = document.getElementById("wordEl");
const phoneticEl = document.getElementById("phoneticEl");
const meaningsEl = document.getElementById("meaningsEl");
const speakBtn = document.getElementById("speakBtn");
const shareBtn = document.getElementById("shareBtn");

const recentWrap = document.getElementById("recentWrap");
const recentChips = document.getElementById("recentChips");
const recentClearBtn = document.getElementById("recentClearBtn");

let currentAudioUrl = null;
let currentWord = "";
let audio = null;

/* ---------------- navigation ---------------- */
function showHome() {
  screenResult.classList.remove("is-active");
  screenHome.classList.add("is-active");
  inputHero.value = "";
  inputHero.focus();
}

function showResultScreen() {
  screenHome.classList.remove("is-active");
  screenResult.classList.add("is-active");
}

function showCard(card) {
  [resultCard, notFoundCard, loadingCard].forEach((c) => (c.hidden = c !== card));
}

homeLink.addEventListener("click", (e) => {
  e.preventDefault();
  showHome();
});

/* ---------------- recent searches ---------------- */
const RECENT_KEY = "pronounce-recent";
const RECENT_MAX = 8;

function getRecents() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function renderRecents() {
  const list = getRecents();
  recentChips.innerHTML = "";
  if (!list.length) {
    recentWrap.hidden = true;
    return;
  }
  list.forEach((word) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "recent-chip";
    chip.textContent = word;
    chip.addEventListener("click", () => handleSearch(word));
    recentChips.appendChild(chip);
  });
  recentWrap.hidden = false;
}

function addRecent(word) {
  const list = [word, ...getRecents().filter((w) => w !== word)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (_) {}
  renderRecents();
}

recentClearBtn.addEventListener("click", () => {
  try { localStorage.removeItem(RECENT_KEY); } catch (_) {}
  renderRecents();
});

renderRecents();

clearBtn.addEventListener("click", () => {
  inputSlim.value = "";
  showHome();
});

/* ---------------- search ---------------- */
const suggestionsHero = document.getElementById("suggestionsHero");
const suggestionsSlim = document.getElementById("suggestionsSlim");

function handleSearch(rawValue) {
  const word = rawValue.trim().toLowerCase();
  if (!word) return;
  suggestionsHero.hidden = true;
  suggestionsSlim.hidden = true;
  showResultScreen();
  inputSlim.value = word;
  lookUp(word);
}

formHero.addEventListener("submit", (e) => {
  e.preventDefault();
  handleSearch(inputHero.value);
});

formSlim.addEventListener("submit", (e) => {
  e.preventDefault();
  handleSearch(inputSlim.value);
});

/* ---------------- word suggestions ---------------- */
const SUGGEST_MIN_LEN = 2;
const SUGGEST_DEBOUNCE_MS = 200;
const SUGGEST_MAX = 8;

function setupSuggestions(input, listEl, onSelect) {
  let debounceTimer = null;
  let items = [];
  let activeIndex = -1;

  function hideList() {
    listEl.hidden = true;
    listEl.innerHTML = "";
    items = [];
    activeIndex = -1;
  }

  function setActive(index) {
    const lis = listEl.children;
    if (activeIndex >= 0 && lis[activeIndex]) lis[activeIndex].classList.remove("is-active");
    activeIndex = index;
    if (activeIndex >= 0 && lis[activeIndex]) {
      lis[activeIndex].classList.add("is-active");
      lis[activeIndex].scrollIntoView({ block: "nearest" });
    }
  }

  function renderList(words) {
    items = words;
    activeIndex = -1;
    listEl.innerHTML = "";
    if (!words.length) {
      hideList();
      return;
    }
    words.forEach((word) => {
      const li = document.createElement("li");
      li.textContent = word;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep input focus so blur doesn't close the list first
        onSelect(word);
        hideList();
      });
      listEl.appendChild(li);
    });
    listEl.hidden = false;
  }

  async function fetchSuggestions(prefix) {
    try {
      const shard = await fetchAcShard(shardKeyFor(prefix));
      const matches = shard.filter((w) => w.startsWith(prefix) && w !== prefix);
      renderList(matches.slice(0, SUGGEST_MAX));
    } catch (_) {
      // shard fetch failed (offline); leave list as-is
    }
  }

  input.addEventListener("input", () => {
    const value = input.value.trim().toLowerCase();
    clearTimeout(debounceTimer);
    if (value.length < SUGGEST_MIN_LEN) {
      hideList();
      return;
    }
    debounceTimer = setTimeout(() => fetchSuggestions(value), SUGGEST_DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (e) => {
    if (listEl.hidden || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      onSelect(items[activeIndex]);
      hideList();
    } else if (e.key === "Escape") {
      hideList();
    }
  });

  input.addEventListener("blur", () => setTimeout(hideList, 100));
}

setupSuggestions(inputHero, suggestionsHero, (word) => {
  inputHero.value = word;
  handleSearch(word);
});
setupSuggestions(inputSlim, suggestionsSlim, (word) => {
  inputSlim.value = word;
  handleSearch(word);
});

/* ---------------- speech search ---------------- */
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

function setupMic(button, input, onResult) {
  if (!SpeechRecognitionCtor) {
    button.hidden = true;
    return;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let listening = false;

  recognition.onresult = (e) => {
    const word = e.results[0][0].transcript.trim().toLowerCase();
    if (word) {
      input.value = word;
      onResult(word);
    }
  };
  recognition.onend = () => {
    listening = false;
    button.classList.remove("is-listening");
  };
  recognition.onerror = () => {
    listening = false;
    button.classList.remove("is-listening");
  };

  button.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    listening = true;
    button.classList.add("is-listening");
    recognition.start();
  });
}

setupMic(document.getElementById("micBtnHero"), inputHero, (word) => handleSearch(word));
setupMic(document.getElementById("micBtnSlim"), inputSlim, (word) => handleSearch(word));

/* ---------------- local dictionary dataset ---------------- */
const shardCache = new Map();

function shardKeyFor(word) {
  return word.length === 1 ? "_" + word : word.slice(0, 2);
}

function fetchShard(key) {
  if (shardCache.has(key)) return shardCache.get(key);
  const promise = fetch("data/entries/" + key + ".json").then((res) => {
    if (res.status === 404) return {};
    if (!res.ok) throw new Error("shard fetch failed: " + res.status);
    return res.json();
  });
  shardCache.set(key, promise);
  return promise;
}

const acShardCache = new Map();

function fetchAcShard(key) {
  if (acShardCache.has(key)) return acShardCache.get(key);
  const promise = fetch("data/ac/" + key + ".json").then((res) => {
    if (res.status === 404) return [];
    if (!res.ok) throw new Error("autocomplete shard fetch failed: " + res.status);
    return res.json();
  });
  acShardCache.set(key, promise);
  return promise;
}

function showNotFound(reason) {
  if (reason === "network") {
    notFoundTitle.textContent = "offline?";
    notFoundText.textContent = "we couldn't reach the dictionary. check your connection and try again";
  } else {
    notFoundTitle.textContent = "hmm...";
    notFoundText.textContent = "we couldn't find that word. check the spelling and try again";
  }
  showCard(notFoundCard);
}

async function lookUp(word) {
  showCard(loadingCard);
  currentWord = word;
  currentAudioUrl = null;

  try {
    const shard = await fetchShard(shardKeyFor(word));
    const entry = shard[word];
    if (!entry) {
      showNotFound("word");
      return;
    }
    renderEntry(entry, word);
  } catch (_) {
    showNotFound("network");
  }
}

function appendRelation(label, words) {
  if (!words || !words.length) return;
  const p = document.createElement("p");
  p.className = "relation";
  const labelEl = document.createElement("span");
  labelEl.className = "relation-label";
  labelEl.textContent = label + " ";
  p.appendChild(labelEl);
  p.appendChild(document.createTextNode(words.slice(0, 6).join(", ")));
  meaningsEl.appendChild(p);
}

function renderEntry(entry, word) {
  wordEl.textContent = entry.w || word;
  phoneticEl.textContent = entry.ipa || "/" + word + "/";
  currentAudioUrl = null; // dataset carries no audio; speak button falls back to speechSynthesis

  meaningsEl.innerHTML = "";
  (entry.s || []).forEach((sense) => {
    const pos = document.createElement("p");
    pos.className = "pos";
    pos.textContent = sense.p || "";
    if (sense.t && sense.t.length) {
      const tag = document.createElement("span");
      tag.className = "register-tag";
      tag.textContent = " · " + sense.t.join(", ");
      pos.appendChild(tag);
    }
    meaningsEl.appendChild(pos);

    const d = document.createElement("p");
    d.className = "definition";
    d.textContent = sense.d;
    meaningsEl.appendChild(d);

    if (sense.e) {
      const ex = document.createElement("p");
      ex.className = "example";
      ex.textContent = "\u201C" + sense.e + "\u201D";
      meaningsEl.appendChild(ex);
    }
  });

  appendRelation("synonyms", entry.syn);
  appendRelation("antonyms", entry.ant);

  showCard(resultCard);
  addRecent(wordEl.textContent);
}

/* ---------------- pronunciation ---------------- */
function speakWithTTS(word) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(word);
  utter.rate = 0.85;
  utter.onstart = () => speakBtn.classList.add("is-playing");
  utter.onend = () => speakBtn.classList.remove("is-playing");
  utter.onerror = () => speakBtn.classList.remove("is-playing");
  window.speechSynthesis.speak(utter);
}

speakBtn.addEventListener("click", () => {
  if (currentAudioUrl) {
    if (audio) audio.pause();
    audio = new Audio(currentAudioUrl);
    speakBtn.classList.add("is-playing");
    audio.onended = () => speakBtn.classList.remove("is-playing");
    audio.onerror = () => {
      speakBtn.classList.remove("is-playing");
      speakWithTTS(currentWord); // fall back if the file fails
    };
    audio.play().catch(() => speakWithTTS(currentWord));
  } else {
    speakWithTTS(currentWord);
  }
});

/* ---------------- share card ---------------- */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line + word + " ";
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line.trim(), x, y);
      line = word + " ";
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y);
  return y + lineHeight;
}

async function buildShareCard() {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) {}
  }

  const width = 1080;
  const height = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const styles = getComputedStyle(document.documentElement);
  const bg = styles.getPropertyValue("--bg").trim() || "#f1f1ef";
  const text = styles.getPropertyValue("--text").trim() || "#1a1a1a";
  const muted = styles.getPropertyValue("--muted").trim() || "#6b6b68";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const pad = 90;
  let y = 300;

  ctx.fillStyle = text;
  ctx.font = "500 108px Lora, Georgia, serif";
  y = wrapText(ctx, wordEl.textContent || currentWord, pad, y, width - pad * 2, 120);
  y += 30;

  ctx.fillStyle = muted;
  ctx.font = "italic 44px Lora, Georgia, serif";
  ctx.fillText(phoneticEl.textContent || "", pad, y);
  y += 60;

  ctx.strokeStyle = text;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(pad + 140, y);
  ctx.stroke();
  y += 80;

  const posEl = meaningsEl.querySelector(".pos");
  const defEl = meaningsEl.querySelector(".definition");
  if (posEl) {
    ctx.fillStyle = muted;
    ctx.font = "italic 34px Lora, Georgia, serif";
    ctx.fillText(posEl.textContent, pad, y);
    y += 60;
  }
  if (defEl) {
    ctx.fillStyle = text;
    ctx.font = "42px Lora, Georgia, serif";
    wrapText(ctx, defEl.textContent, pad, y, width - pad * 2, 58);
  }

  ctx.fillStyle = muted;
  ctx.font = "32px Lora, Georgia, serif";
  ctx.fillText("pronounce · /pruh-nowns/", pad, height - 70);

  return canvas;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

shareBtn.addEventListener("click", async () => {
  if (!currentWord) return;
  shareBtn.disabled = true;
  try {
    const canvas = await buildShareCard();
    canvas.toBlob(async (blob) => {
      if (!blob) {
        shareBtn.disabled = false;
        return;
      }

      const fileName = currentWord + "-pronounce.png";
      const shareText = (wordEl.textContent || currentWord) + " " + (phoneticEl.textContent || "");
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: wordEl.textContent, text: shareText });
          shareBtn.disabled = false;
          return;
        } catch (_) {
          // user cancelled or share failed; fall through to download
        }
      } else if (navigator.share) {
        try {
          await navigator.share({ title: wordEl.textContent, text: shareText });
          shareBtn.disabled = false;
          return;
        } catch (_) {
          // fall through to download
        }
      }

      downloadBlob(blob, fileName);
      shareBtn.disabled = false;
    }, "image/png");
  } catch (_) {
    shareBtn.disabled = false;
  }
});

/* ---------------- offline support ---------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
