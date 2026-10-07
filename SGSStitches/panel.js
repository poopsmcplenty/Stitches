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
let equippedSlots = [null, null, null, null]; // [Slot 1, Slot 2, Slot 3, Slot 4]
let cardTimers = {}; // Tracks { cardId: { activeUntil: 0, readyAt: 0 } }

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
  renderShopNotions();
  renderCrafting();
  renderNotionsTab();
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
  const perks = getActiveNotionBonuses();

  let machineSPM = 0;
  for (const [key, count] of Object.entries(shopInventory)) {
    if (GAME_DATA.shopItems[key]) {
      machineSPM += (count || 0) * GAME_DATA.shopItems[key].spm;
    }
  }

  const baseTotal = GAME_DATA.baseSPM + machineSPM + perks.flatSpm;
  // Apply Bonus 4: SPM Multiplier %
  return Math.round(baseTotal * (1 + perks.spmMultiplier));
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
      equippedSlots = d.equippedSlots || [null, null, null, null];
      cardTimers = d.cardTimers || {};
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
      equippedSlots: equippedSlots,
      cardTimers: cardTimers,
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
  if (document.getElementById('tab-notions')?.style.display === 'block') {
  renderNotionsTab();
}
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

// Toggle Minimize Machines Section
bindClick('toggle-machines', () => {
  const container = document.getElementById('shop-items-container');
  const arrow = document.getElementById('machines-arrow');
  if (!container || !arrow) return;

  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  arrow.innerText = isHidden ? '▼' : '◄';
});

function getClickPower() {
  const perks = getActiveNotionBonuses();
  // Apply Bonus 0: Click Multiplier
  return Math.max(1, Math.round(1 * perks.clickMultiplier));
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
// --- NOTION CARD HELPER: Get readable bonus text ---
function getBonusDescription(bonus) {
  if (!bonus || bonus.length < 2) return "None";
  const [type, val] = bonus;
  const types = ["Click Multiplier", "Cheaper Crafting", "Faster Crafting", "Cheaper Shop", "Timed SPM Boost"];
  if (type === 0) return `+${val * 100}% ${types[type]}`;
  return `${val * 100}% ${types[type]}`;
}

// --- SINGLE REUSABLE TOOLTIP FUNCTION ---
function showCardTooltip(key, tier, showCost = true) {
  const tooltip = document.getElementById('global-card-tooltip');
  const tool = GAME_DATA.notions[key];
  const card = tool?.[tier];
  if (!tooltip || !tool || !card) return;

  const craftNames = Object.values(GAME_DATA.craftables).map(c => c.name);
  const timed = tool.Timed || tool.timed || [0, 0];
  const isTimed = timed[0] > 0;
  const timerText = isTimed 
    ? `⏱️ <strong>Active:</strong> ${Math.round(timed[0] / 60)}m | <strong>Cooldown:</strong> ${Math.round(timed[1] / 60)}m<br>`
    : `⏱️ <strong>Passive:</strong> (Always On)<br>`;

  // Only build cost text if showCost is true
  let costHTML = "";
  if (showCost) {
    const costText = card.cost
      .map((amt, idx) => amt > 0 ? `${amt} ${craftNames[idx]}` : null)
      .filter(Boolean)
      .join(', ');
    costHTML = `💰 <strong>Cost:</strong> ${costText}`;
  }

  tooltip.innerHTML = `
    <strong>${tool.name} (${tier.toUpperCase()})</strong><br>
    <em>"${tool.Description || ''}"</em><br><br>
    ⚡ <strong>SPM:</strong> +${card.spm}<br>
    ✨ <strong>Perk:</strong> ${getBonusDescription(card.bonus)}<br>
    ${timerText}
    ${costHTML}
  `;
  tooltip.style.display = 'block';
}

function hideCardTooltip() {
  const tooltip = document.getElementById('global-card-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

// --- RENDER NOTION CARDS IN SHOP ---
function renderShopNotions() {
  const container = document.getElementById('shop-notions-container');
  const tooltip = document.getElementById('global-card-tooltip');
  if (!container || !tooltip) return;
  container.innerHTML = '';

  const craftNames = ["Coasters", "Std Bowls", "Rainbowls", "Large Bowls", "Fabrics"];

  for (const [key, tool] of Object.entries(GAME_DATA.notions)) {
    const timed = tool.Timed || tool.timed || [0, 0];
    const isTimed = timed[0] > 0;
    const timerText = isTimed 
      ? `⏱️ <strong>Active:</strong> ${Math.round(timed[0] / 60)}m | <strong>Cooldown:</strong> ${Math.round(timed[1] / 60)}m<br>`
      : `⏱️ <strong>Type:</strong> Passive (Always On)<br>`;

    ['bronze', 'silver', 'gold'].forEach(tier => {
      const card = tool[tier];
      if (!card) return;

      const cardId = `${key}_${tier}`;
      const maxLimit = (tier === 'bronze') ? 4 : 1;
      const currentOwned = craftInventory[cardId] || 0;
      const isMaxed = currentOwned >= maxLimit;

      const costText = card.cost
        .map((amt, idx) => amt > 0 ? `${amt} ${craftNames[idx]}` : null)
        .filter(Boolean)
        .join(', ');

      const el = document.createElement('div');
      el.className = `notion-card ${tier}`;
      if (isMaxed) el.style.opacity = '0.35'; // Dims maxed cards

      el.innerHTML = `
        <div class="card-name">${tool.name}</div>
        <div class="card-tier-label" style="color: ${tier === 'gold' ? '#ffd700' : tier === 'silver' ? '#c0c0c0' : '#cd7f32'}">
          ${isMaxed ? 'MAX OWNED' : tier}
        </div>
      `;

      // Hover: position tooltip right above the card and clamp within 318px bounds
      el.onmouseenter = () => {
        tooltip.innerHTML = `
          <strong>${tool.name} (${tier.toUpperCase()})</strong><br>
          <em>"${tool.Description || ''}"</em><br><br>
          ⚡ <strong>SPM:</strong> +${card.spm}<br>
          ✨ <strong>Perk:</strong> ${getBonusDescription(card.bonus)}<br>
          ${timerText}
          💰 <strong>Cost:</strong> ${costText}
        `;
        tooltip.style.display = 'block';

        const rect = el.getBoundingClientRect();
        const tooltipWidth = 200;
        
        // Position directly above card
        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        
        // Clamp to stay inside screen edges (10px padding)
        left = Math.max(10, Math.min(window.innerWidth - tooltipWidth - 10, left));
        
        let top = rect.top - tooltip.offsetHeight - 8;
        if (top < 10) top = rect.bottom + 8; // If near top edge, show below card instead

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      };

      el.onmouseleave = () => {
        tooltip.style.display = 'none';
      };

      el.onclick = () => buyNotionCard(key, tier);
      container.appendChild(el);
    });
  }
}

// --- BUY NOTION CARD (Capped: 4 Bronze, 1 Silver, 1 Gold) ---
function buyNotionCard(key, tier) {
  const card = GAME_DATA.notions[key]?.[tier];
  if (!card) return;

  const cardId = `${key}_${tier}`;
  const maxLimit = (tier === 'bronze') ? 4 : 1;
  const currentOwned = craftInventory[cardId] || 0;

  // 1. Check Ownership Cap Rule
  if (currentOwned >= maxLimit) {
    showNotify(`Max ${tier.toUpperCase()} ${GAME_DATA.notions[key].name} already owned (${maxLimit}/${maxLimit})!`, true);
    return;
  }

  const [c0, c1, c2, c3, c4] = card.cost;
  const c = craftInventory;

  // Check all 5 craft requirements
  if ((c.coaster || 0) >= c0 && (c.stdBowl || 0) >= c1 && (c.rainbowl || 0) >= c2 && (c.largeBowl || 0) >= c3 && (c.fabric || 0) >= c4) {
    c.coaster = (c.coaster || 0) - c0;
    c.stdBowl = (c.stdBowl || 0) - c1;
    c.rainbowl = (c.rainbowl || 0) - c2;
    c.largeBowl = (c.largeBowl || 0) - c3;
    c.fabric = (c.fabric || 0) - c4;
    ropeBowlsCount = c.stdBowl; // sync

    // Add to owned collection
    craftInventory[cardId] = currentOwned + 1;

    showNotify(`Traded for ${GAME_DATA.notions[key].name} (${tier.toUpperCase()})!`);
    updateUI();
    renderShopNotions(); // Refresh shop to show updated MAX badges
    saveUserData();
  } else {
    showNotify("Missing required crafted items!", true);
  }
}

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
  // Dynamic HUD: Machines (Pulls directly from gameData.js)
  const mList = document.getElementById('hud-machines-list');
  if (mList) {
    mList.innerHTML = Object.entries(GAME_DATA.shopItems)
      .map(([key, item]) => `<div class="hud-item"><span>${item.name.split(' ')[0]}:</span> <strong>${shopInventory[key] || 0}</strong></div>`)
      .join('');
  }

  // Dynamic HUD: Inventory (Pulls directly from gameData.js)
  const iList = document.getElementById('hud-inventory-list');
  if (iList) {
    iList.innerHTML = Object.entries(GAME_DATA.craftables)
      .map(([key, item]) => `<div class="hud-item"><span>${item.name.split(' ')[0]}:</span> <strong>${craftInventory[key] || 0}</strong></div>`)
      .join('');
  }
}
}

// --- TAB SWITCHING ---
function switchTab(tabId, btnId) {
  document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  if (tabId === 'tab-notions') renderNotionsTab();
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

  const perks = getActiveNotionBonuses();
    const qtyInput = document.getElementById(`qty-shop-${key}`);
    const qty = parseInt(qtyInput?.value) || 1;
    const discountedCost = Math.max(1, Math.round(item.cost * (1 - perks.shopCostDiscount)));
    const totalCost = discountedCost * qty;
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
  if (!item || activeCrafts[key]) return;

  const perks = getActiveNotionBonuses();
  const qtyInput = document.getElementById(`qty-${key}`);
  const qty = parseInt(qtyInput?.value) || 1;

  // Apply Bonus 1 (Cheaper Crafting %) and Bonus 2 (Faster Crafting %)
  const discountedCost = Math.max(1, Math.round(item.cost * (1 - perks.craftCostDiscount)));
  const discountedTime = Math.max(1, Math.round(item.craftTime * (1 - perks.craftTimeDiscount)));

  const totalCost = discountedCost * qty;
  const totalTimeSeconds = discountedTime * qty;

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

// --- CHECK IF A CARD'S PERKS ARE CURRENTLY ACTIVE ---
function isCardActive(cardId) {
  if (!cardId) return false;
  const [key] = cardId.split('_');
  const tool = GAME_DATA.notions[key];
  if (!tool) return false;

  const timed = tool.Timed || tool.timed || [0, 0];
  if (timed[0] === 0) return true; // Passive cards are always active!

  const now = Date.now();
  const timer = cardTimers[cardId];
  return timer && now < timer.activeUntil;
}

// --- CALCULATE ALL ACTIVE NOTION PERKS ---
function getActiveNotionBonuses() {
  const perks = {
    flatSpm: 0,           // Flat SPM from cards
    spmMultiplier: 0,     // Bonus 4: % boost to total SPM
    clickMultiplier: 1.0, // Bonus 0: Click multiplier (Base 1x)
    craftCostDiscount: 0, // Bonus 1: % off stitch costs
    craftTimeDiscount: 0, // Bonus 2: % off crafting timers
    shopCostDiscount: 0   // Bonus 3: % off shop bowl costs
  };

  equippedSlots.forEach(cardId => {
    if (!cardId || !isCardActive(cardId)) return;
    const [key, tier] = cardId.split('_');
    const card = GAME_DATA.notions[key]?.[tier];
    if (!card) return;

    // 1. Add Flat SPM
    if (card.spm) perks.flatSpm += card.spm;

    // 2. Add Specific Bonus [type, value]
    if (card.bonus && card.bonus.length === 2) {
      const [type, val] = card.bonus;
      if (type === 0) perks.clickMultiplier += val;     // Click Multiplier
      if (type === 1) perks.craftCostDiscount += val;    // Cheaper Crafting
      if (type === 2) perks.craftTimeDiscount += val;    // Faster Crafting
      if (type === 3) perks.shopCostDiscount += val;     // Cheaper Shop
      if (type === 4) perks.spmMultiplier += val;        // SPM % Multiplier
    }
  });

  return perks;
}
// --- NOTIONS TAB: Render 4 Slots & Owned Cards ---
function renderNotionsTab() {
  const slotsGrid = document.querySelector('.slots-grid');
  const ownedList = document.getElementById('owned-notions-list');
  if (!slotsGrid || !ownedList) return;

  // 1. Render 4 Equipped Slots
  const slotElements = slotsGrid.querySelectorAll('.slot');
  equippedSlots.forEach((cardId, index) => {
    const slotEl = slotElements[index];
    if (!slotEl) return;

    if (cardId) {
      const [key, tier] = cardId.split('_');
      const tool = GAME_DATA.notions[key];
      const timed = tool?.Timed || tool?.timed || [0, 0];
      const isTimed = timed[0] > 0;
      const timer = cardTimers[cardId];
      const now = Date.now();
      const isActive = timer && now < timer.activeUntil;
      const isCooldown = timer && now < timer.readyAt;

    let statusBadge = "";
      if (isTimed) {
        if (isActive) {
          const totalDur = timed[0] * 1000;
          const rem = timer.activeUntil - now;
          const pct = Math.max(0, Math.min(100, (rem / totalDur) * 100));
          statusBadge = `
            <span style="font-size: 0.48rem; color: #00ff88; margin-top: 2px;">Active</span>
            <div class="slot-timer-bar"><div class="slot-timer-fill active" style="width:${pct}%"></div></div>
          `;
        } else if (isCooldown) {
          const totalCd = timed[1] * 1000;
          const rem = timer.readyAt - now;
          const pct = Math.max(0, Math.min(100, (rem / totalCd) * 100));
          statusBadge = `
            <span style="font-size: 0.48rem; color: #ff5555; margin-top: 2px;">Cooldown</span>
            <div class="slot-timer-bar"><div class="slot-timer-fill cooldown" style="width:${pct}%"></div></div>
          `;
        } else {
          statusBadge = `<span style="color:#00f0ff; font-size:0.5rem; margin-top:2px;">▶ Click to Start!</span>`;
        }
      }

      slotEl.className = `slot ${tier}`;
      slotEl.innerHTML = `
        <strong style="font-size:0.65rem;">${tool?.name || ''}</strong>
        <span style="font-size:0.55rem; text-transform:uppercase;">(${tier})</span>
        ${statusBadge}
      `;

      slotEl.onmouseenter = () => showCardTooltip(key, tier, false);
      slotEl.onmouseleave = hideCardTooltip;

      slotEl.onclick = () => {
        // If it's a timed card that's ready, activate it; otherwise unequip
        if (isTimed && !isActive && !isCooldown) {
          activateTimedCard(cardId, timed);
        } else {
          unequipCard(index);
        }
      };
    } else {
      const defaultTiers = ['Bronze', 'Bronze', 'Silver', 'Gold'];
      const slotTier = defaultTiers[index].toLowerCase();
      slotEl.className = `slot ${slotTier}`;
      slotEl.innerHTML = `<span>${defaultTiers[index]}<br><small>Empty</small></span>`;
      slotEl.onclick = null;
      slotEl.onmouseenter = null;
      slotEl.onmouseleave = null;
    }
  });

  // 2. Render Owned Cards Collection
  ownedList.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'notions-grid';

  let hasCards = false;

  for (const [key, tool] of Object.entries(GAME_DATA.notions)) {
    ['bronze', 'silver', 'gold'].forEach(tier => {
      const cardId = `${key}_${tier}`;
      const totalOwned = craftInventory[cardId] || 0;
      const equippedCount = equippedSlots.filter(id => id === cardId).length;
      const availableToEquip = totalOwned - equippedCount;

      if (totalOwned > 0) {
        hasCards = true;
        const cardEl = document.createElement('div');
        cardEl.className = `notion-card ${tier}`;
        cardEl.style.opacity = availableToEquip > 0 ? '1' : '0.4';
        cardEl.innerHTML = `
          <div class="card-name">${tool.name}</div>
          <div class="card-tier-label" style="color: ${tier === 'gold' ? '#ffd700' : tier === 'silver' ? '#c0c0c0' : '#cd7f32'}">${tier}</div>
          <small style="font-size: 0.55rem; margin-top: 2px;">Owned: ${totalOwned} (${availableToEquip} free)</small>
        `;
        cardEl.onmouseenter = () => showCardTooltip(key, tier, false);
        cardEl.onmouseleave = hideCardTooltip;
        cardEl.onclick = () => {
          if (availableToEquip > 0) {
            equipCard(cardId, tier);
          } else {
            showNotify("All copies already equipped!", true);
          }
        };

        grid.appendChild(cardEl);
      }
    });
  }

  if (!hasCards) {
    ownedList.innerHTML = '<p class="placeholder-text">No cards owned yet. Trade for some in the Shop!</p>';
  } else {
    ownedList.appendChild(grid);
  }
}

// --- EQUIP CARD (Slot Rules: Bronze 1-4, Silver 3 only, Gold 4 only) ---
function equipCard(cardId, tier) {
  let targetSlot = -1;

  if (tier === 'bronze') {
    targetSlot = equippedSlots.findIndex(s => s === null);
  } else if (tier === 'silver') {
    if (equippedSlots[2] === null) targetSlot = 2;
  } else if (tier === 'gold') {
    if (equippedSlots[3] === null) targetSlot = 3;
  }

  if (targetSlot !== -1) {
    equippedSlots[targetSlot] = cardId;
    showNotify(`Equipped to Slot ${targetSlot + 1}!`);
    updateUI();
    renderNotionsTab();
    saveUserData();
  } else {
    showNotify(`No valid empty slot for ${tier.toUpperCase()} card!`, true);
  }
}

// --- UNEQUIP CARD ---
function unequipCard(slotIndex) {
  const cardId = equippedSlots[slotIndex];
  if (!cardId) return;

  const [key] = cardId.split('_');
  const tool = GAME_DATA.notions[key];
  const timed = tool?.Timed || tool?.timed || [0, 0];
  const isTimed = timed[0] > 0;

  // RULE: Only block unequipping if it is a TIMED card currently running!
  if (isTimed && isCardActive(cardId)) {
    showNotify("Cannot unequip while active timer is running!", true);
    return;
  }
  hideCardTooltip();
  // Passive cards and Cooldown cards unequip instantly
  equippedSlots[slotIndex] = null;
  showNotify(`Unequipped Slot ${slotIndex + 1}!`);
  updateUI();
  renderNotionsTab();
  saveUserData();
}


// --- ACTIVATE TIMED CARD ---
function activateTimedCard(cardId, timed) {
  const [duration, cooldown] = timed;
  const now = Date.now();

  cardTimers[cardId] = {
    activeUntil: now + (duration * 1000),
    readyAt: now + ((duration + cooldown) * 1000)
  };

  showNotify(`Activated ${cardId.split('_')[0]} boost for ${Math.round(duration / 60)}m!`);
  updateUI();
  renderNotionsTab();
  saveUserData();
}

