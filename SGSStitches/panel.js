// --- FIREBASE INITIALIZATION ---
let db;

function initFirebase() {
  if (window.firebaseConfig) {
    if (!firebase.apps.length) {
      firebase.initializeApp(window.firebaseConfig);
    }
    db = firebase.firestore();
    initApp();
  } else {
    console.error("Firebase config not found!");
  }
}

const configCheck = setInterval(() => {
  if (window.firebaseConfig) {
    clearInterval(configCheck);
    initFirebase();
  }
}, 50);

function showNotify(text, isError = false) {
  const el = document.getElementById("game-notify");
  if (!el) return;
  el.innerText = text;
  el.style.color = isError ? "#ff5555" : "#00ff88";
  el.style.opacity = "1";
  setTimeout(() => { el.style.opacity = "0"; }, 2500);
}

// --- GAME STATE ---
let userId = localStorage.getItem("dev_user_id") || "user-" + Math.floor(Math.random() * 10000);
localStorage.setItem("dev_user_id", userId);

let authData = null;
let gameStarted = false;

let score = 0;
let totalPointsEarned = 0;

let ropeBowlsCount = 0; // Currency to buy machines
let shopInventory = {}; // Stores all owned machines: { stdMachine: 0, hdMachine: 0, ... }
let craftInventory = {};   // e.g. { coaster: 5, stdBowl: 2, ... }
let lifetimeCrafted = {};  // Tracks total ever made
let activeCrafts = {}; // e.g. { coaster: { finishTime: 171000000, qty: 1 } }

// UI Elements
const scoreEl = document.getElementById('score');
const ppsEl = document.getElementById('pps');
const statusEl = document.getElementById('status');
const clickBtn = document.getElementById('click-btn');

function initApp() {
  if (window.Twitch && window.Twitch.ext) {
    window.Twitch.ext.onAuthorized((auth) => {
      authData = auth;
      userId = auth.userId;
      if (statusEl) statusEl.innerText = `Connected! User: ${userId}`;
      checkUserStatus();
    });
  }

  setTimeout(() => {
    if (!authData) {
      if (statusEl) statusEl.innerText = `Running in Local Test Mode`;
      checkUserStatus();
    }
  }, 500);
}

// Check if player has already joined or needs the Join screen
async function checkUserStatus() {
  await loadUserData();

  try {
    const doc = await db.collection("players").doc(userId).get();
    if (doc.exists && doc.data().hasJoined) {
      initGame();
    } else {
      showJoin();
    }
  } catch (err) {
    console.error("Status check error:", err);
    showJoin();
  }
}

async function initGame() {
  if (gameStarted) return;
  gameStarted = true;
  if (clickBtn) clickBtn.disabled = false;

  showGame();
  startPassiveLoop();
  startAutoSaveLoop();
  renderShop();
  renderCrafting();
}

function showJoin() {
  document.getElementById('join-container').style.display = 'block';
  document.getElementById('game-ui').style.display = 'none';
  document.querySelector('.nav-bar').style.display = 'none';
}

function showGame() {
  document.getElementById('join-container').style.display = 'none';
  document.getElementById('game-ui').style.display = 'block';
  document.querySelector('.nav-bar').style.display = 'flex';
  updateUI();
}

// --- SPM CALCULATIONS (Powered by GAME_DATA) ---
function getTotalSPM() {
  let machineSPM = 0;
  for (const [key, count] of Object.entries(shopInventory)) {
    if (GAME_DATA.shopItems[key]) {
      machineSPM += (count || 0) * GAME_DATA.shopItems[key].spm;
    }
  }
  return GAME_DATA.baseSPM + machineSPM;
}

// --- DATABASE FUNCTIONS ---
async function loadUserData() {
  try {
    const docRef = db.collection("players").doc(userId);
    const doc = await docRef.get();

    if (doc.exists) {
      const d = doc.data();
      score = Number(d.score) || 0;
      totalPointsEarned = Number(d.totalPointsEarned) || score;
      ropeBowlsCount = Number(d.ropeBowlsCount) || 0;
      shopInventory = d.shopInventory || {};
      craftInventory = d.craftInventory || {};
      lifetimeCrafted = d.lifetimeCrafted || {};
      ropeBowlsCount = craftInventory.stdBowl || 0;
      activeCrafts = d.activeCrafts || {};
    }
    updateUI();
  } catch (err) {
    console.error("Firebase load error:", err);
  }
}

async function saveUserData() {
  if (!gameStarted) return; // Prevent overwriting when quit!

  try {
    const dataToSave = {
      score: Number(score) || 0,
      totalPointsEarned: Number(totalPointsEarned) || 0,
      hasJoined: true,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      ropeBowlsCount: Number(ropeBowlsCount) || 0,
      shopInventory: shopInventory,
      craftInventory: craftInventory,
      lifetimeCrafted: lifetimeCrafted,
      activeCrafts: activeCrafts,
    };

    await db.collection("players").doc(userId).set(dataToSave, { merge: true });
    showNotify("Game Saved!");
    const saveMsg = document.getElementById("save-status");
    if (saveMsg) {
      saveMsg.style.opacity = "1";
      setTimeout(() => { saveMsg.style.opacity = "0"; }, 2000);
    }
  } catch (err) {
    console.error("Firebase save error:", err);
  }
}

let passiveInterval = null;
let saveInterval = null;

function startPassiveLoop() {
  if (passiveInterval) clearInterval(passiveInterval);
  passiveInterval = setInterval(() => {
    if (!gameStarted) return;
    const spm = getTotalSPM();
    score += spm;
    totalPointsEarned += spm;
    updateUI();
    updateCraftingProgress();
  }, 1000);
}

function startAutoSaveLoop() {
  if (saveInterval) clearInterval(saveInterval);
  saveInterval = setInterval(saveUserData, 60000);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveUserData();
});

// Helper for safe click bindings
function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
}

function getClickPower() {
  // Base is 1 (will automatically multiply when we wire up equipped Notions!)
  return 1;
}
function spawnFloatingText(e, text) {
  const el = document.createElement('div');
  el.className = 'floating-click';
  el.innerText = text;

  // Random horizontal scatter (-20px to +20px) and random rotation (-15deg to +15deg)
  const randomX = (Math.random() - 0.5) * 40;
  const randomRotate = (Math.random() - 0.5) * 30;

  el.style.left = `${e.clientX + randomX}px`;
  el.style.top = `${e.clientY - 10}px`;
  el.style.transform = `rotate(${randomRotate}deg)`;

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// --- GAME LOGIC ---
bindClick('join-btn', async () => {
  await db.collection("players").doc(userId).set({ hasJoined: true }, { merge: true });
  initGame();
});

bindClick('quit-btn', async () => {
  gameStarted = false;
  await db.collection("players").doc(userId).set({ hasJoined: false }, { merge: true });
  showJoin();
});

bindClick('click-btn', (e) => {
  if (!gameStarted) return;
  
  const clickPower = getClickPower();
  score += clickPower;
  totalPointsEarned += clickPower;

  // Spawns floating "+1" right next to mouse!
  if (e) spawnFloatingText(e, `+${clickPower}`);

  updateUI();
});

// --- UPDATE UI & STATS ---
function updateUI() {
  const totalSpm = getTotalSPM();

  // Main Header UI
  if (scoreEl) scoreEl.innerText = score;
  if (ppsEl) ppsEl.innerText = totalSpm;
  
  // Stats Menu
  if (document.getElementById('stat-user')) document.getElementById('stat-user').innerText = userId;
  if (document.getElementById('stat-total-stitches')) document.getElementById('stat-total-stitches').innerText = totalPointsEarned;
  if (document.getElementById('stat-total-spm')) document.getElementById('stat-total-spm').innerText = totalSpm;
  for (const key of Object.keys(GAME_DATA.craftables)) {
  const ownedEl = document.getElementById(`owned-${key}`);
  if (ownedEl) ownedEl.innerText = craftInventory[key] || 0;
  }
  for (const key of Object.keys(GAME_DATA.shopItems)) {
  const el = document.getElementById(`owned-shop-${key}`);
  if (el) el.innerText = shopInventory[key] || 0;
}
}

// --- TAB SWITCHING ---
function switchTab(tabId, btnId) {
  document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));

  const target = document.getElementById(tabId);
  if (target) target.style.display = "block";
  const btn = document.getElementById(btnId);
  if (btn) btn.classList.add("active");
}

bindClick("nav-notions", () => switchTab("tab-notions", "nav-notions"));
bindClick("nav-shop", () => switchTab("tab-shop", "nav-shop"));
bindClick("nav-crafting", () => switchTab("tab-crafting", "nav-crafting"));
bindClick("nav-menu", () => switchTab("tab-menu", "nav-menu"));
bindClick("manual-save-btn", () => saveUserData());

function renderShop() {
  const container = document.getElementById('shop-items-container');
  if (!container) return;
  container.innerHTML = '';

  for (const [key, item] of Object.entries(GAME_DATA.shopItems)) {
    const row = document.createElement('div');
    row.className = 'crafting-item';
    row.innerHTML = `
      <div class="craft-info">
        <strong>${item.name}</strong>
        <span>+${item.spm} SPM</span>
        <small>Cost: ${item.cost} Std Bowl${item.cost > 1 ? 's' : ''} | Owned: <span id="owned-shop-${key}">0</span></small>
      </div>
      <div class="craft-controls">
        <input type="number" id="qty-shop-${key}" value="1" min="1" class="craft-qty-input">
        <button class="craft-btn" onclick="buyShopItem('${key}')">Buy</button>
      </div>
    `;
    container.appendChild(row);
  }
}

function buyShopItem(key) {
  const item = GAME_DATA.shopItems[key];
  if (!item) return;

  const qtyInput = document.getElementById(`qty-shop-${key}`);
  const qty = parseInt(qtyInput?.value) || 1;
  const totalCost = item.cost * qty;
  const currentBowls = craftInventory.stdBowl || 0;

  // Check Bobbin Winder machine cap rule
  if (item.cap === "machinesOwned") {
    const totalMachines = (shopInventory.stdMachine || 0) + (shopInventory.hdMachine || 0) + (shopInventory.comMachine || 0);
    if ((shopInventory[key] || 0) + qty > totalMachines) {
      showNotify("Need more machines to support that many winders!", true);
      return;
    }
  }

  if (currentBowls >= totalCost) {
    craftInventory.stdBowl = currentBowls - totalCost;
    ropeBowlsCount = craftInventory.stdBowl;
    shopInventory[key] = (shopInventory[key] || 0) + qty;

    showNotify(`Bought ${qty}x ${item.name}!`);
    updateUI();
    saveUserData();
  } else {
    showNotify(`Need ${totalCost} Standard Bowls!`, true);
  }
}

function renderCrafting() {
  const container = document.getElementById('crafting-items-container');
  if (!container) return;
  container.innerHTML = '';

  for (const [key, item] of Object.entries(GAME_DATA.craftables)) {
    const row = document.createElement('div');
    row.className = 'crafting-item';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'stretch';
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div class="craft-info">
          <strong>${item.name}</strong>
          <span>Costs ${item.cost} Stitches (${item.craftTime}s)</span>
          <small>Owned: <span id="owned-${key}">0</span></small>
        </div>
        <div class="craft-controls">
          <input type="number" id="qty-${key}" value="1" min="1" class="craft-qty-input">
          <button id="btn-craft-${key}" class="craft-btn" onclick="startCrafting('${key}')">Craft</button>
        </div>
      </div>
      <div id="progress-box-${key}" class="craft-progress-container">
        <div id="progress-bar-${key}" class="craft-progress-bar"></div>
      </div>
      <div id="timer-text-${key}" class="craft-timer-text">Crafting...</div>
    `;
    container.appendChild(row);
  }
}
function startCrafting(key) {
  const item = GAME_DATA.craftables[key];
  if (!item || activeCrafts[key]) return; // Already crafting this item

  const qtyInput = document.getElementById(`qty-${key}`);
  const qty = parseInt(qtyInput?.value) || 1;
  const totalCost = item.cost * qty;
  const totalTimeSeconds = item.craftTime * qty;

  if (score >= totalCost) {
    score -= totalCost;
    const now = Date.now();
    activeCrafts[key] = {
      startTime: now,
      finishTime: now + (totalTimeSeconds * 1000),
      totalDuration: totalTimeSeconds * 1000,
      qty: qty
    };

    showNotify(`Crafting ${qty}x ${item.name}...`);
    updateUI();
    saveUserData();
  } else {
    showNotify(`Need ${totalCost} Stitches!`, true);
  }
}

// Checks and updates crafting progress every second
function updateCraftingProgress() {
  const now = Date.now();

  for (const [key, craft] of Object.entries(activeCrafts)) {
    const pBox = document.getElementById(`progress-box-${key}`);
    const pBar = document.getElementById(`progress-bar-${key}`);
    const pTimer = document.getElementById(`timer-text-${key}`);
    const craftBtn = document.getElementById(`btn-craft-${key}`);

    if (!pBox || !pBar || !pTimer) continue;

    if (now >= craft.finishTime) {
      // Craft complete! Deliver items
      craftInventory[key] = (craftInventory[key] || 0) + craft.qty;
      lifetimeCrafted[key] = (lifetimeCrafted[key] || 0) + craft.qty;
      delete activeCrafts[key];

      pBox.style.display = 'none';
      pTimer.style.display = 'none';
      if (craftBtn) craftBtn.disabled = false;

      showNotify(`Completed ${craft.qty}x ${GAME_DATA.craftables[key].name}!`);
      updateUI();
      saveUserData();
    } else {
      // In progress: update bar and remaining time
      pBox.style.display = 'block';
      pTimer.style.display = 'block';
      if (craftBtn) craftBtn.disabled = true;

      const elapsed = now - craft.startTime;
      const percent = Math.min(100, (elapsed / craft.totalDuration) * 100);
      pBar.style.width = `${percent}%`;

      const remainingSec = Math.ceil((craft.finishTime - now) / 1000);
      pTimer.innerText = `Crafting: ${remainingSec}s remaining`;
    }
  }
}
function craftItem(key) {
  const item = GAME_DATA.craftables[key];
  if (!item) return;

  const qtyInput = document.getElementById(`qty-${key}`);
  const qty = parseInt(qtyInput?.value) || 1;
  const totalCost = item.cost * qty;

  if (score >= totalCost) {
    score -= totalCost;
    craftInventory[key] = (craftInventory[key] || 0) + qty;
    lifetimeCrafted[key] = (lifetimeCrafted[key] || 0) + qty;

    // Keep ropeBowlsCount in sync for machine purchases
    if (key === 'stdBowl') ropeBowlsCount = craftInventory[key];

    updateUI();
    saveUserData();
  } else {
    showNotify(`Not enough Stitches! Need ${totalCost}.`);
  }
}