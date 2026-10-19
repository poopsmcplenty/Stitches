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

let notificationQueue = [];
let isShowingNotification = false;

function showNotify(text, isError = false) {
  notificationQueue.push({ text, isError });
  processNotificationQueue();
}

function processNotificationQueue() {
  if (isShowingNotification || notificationQueue.length === 0) return;

  isShowingNotification = true;
  const { text, isError } = notificationQueue.shift();

  const existing = document.getElementById("dynamic-game-notify");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "dynamic-game-notify";
  el.innerText = text;

  el.style.position = "absolute";
  el.style.top = "16px";
  el.style.left = "50%";
  el.style.transform = "translateX(-50%)";
  el.style.background = "rgba(24, 24, 27, 0.95)";
  el.style.border = isError ? "1px solid #ff5555" : "1px solid #9146ff";
  el.style.color = isError ? "#ff5555" : "#ffffff";
  el.style.padding = "8px 16px";
  el.style.borderRadius = "8px";
  el.style.fontSize = "0.75rem";
  el.style.fontWeight = "bold";
  el.style.zIndex = "999999";
  el.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.8)";
  el.style.pointerEvents = "none";
  el.style.textAlign = "center";
  el.style.whiteSpace = "nowrap";
  el.style.transition = "opacity 0.2s ease-in-out";
  el.style.opacity = "1";

  const container = document.querySelector(".container");
  if (container) container.appendChild(el);

  // Keep it visible for 2.5 seconds, then fade out and pull the next one from the queue
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => {
      el.remove();
      isShowingNotification = false;
      processNotificationQueue();
    }, 200);
  }, 2500);
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
let currentCraftCategory = 'rope';

window.switchCraftCategory = function(category, btnEl) {
  currentCraftCategory = category;
  document.querySelectorAll('.recipe-tab').forEach(t => t.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderCrafting();
};
const notionsMachinesSlots = document.getElementById('notions-machines-slots');
if (notionsMachinesSlots) {
 notionsMachinesSlots.innerHTML = Object.entries(GAME_DATA.shopItems)
 .map(([key, item]) => `<div class="inv-slot"><span style="font-size:0.5rem">${item.name.split(' ')[0]}</span><span id="owned-shop-${key}">0</span></div>`)
 .join('');
}
window.switchNotionsCategory = function(category, btnEl) {
 document.querySelectorAll('#tab-notions .recipe-tab').forEach(t => t.classList.remove('active'));
 if (btnEl) btnEl.classList.add('active');

 const cardsSec = document.getElementById('notions-category-cards');
 const decorSec = document.getElementById('notions-category-decor');
 const buttonsSec = document.getElementById('notions-category-buttons');

 if (cardsSec) cardsSec.style.display = (category === 'cards') ? 'block' : 'none';
 if (decorSec) decorSec.style.display = (category === 'decor') ? 'block' : 'none';
 if (buttonsSec) buttonsSec.style.display = (category === 'buttons') ? 'block' : 'none';
};
window.switchShopCategory = function(category, btnEl) {
  document.querySelectorAll('#tab-shop .recipe-tab').forEach(t => t.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  
  const machinesSec = document.getElementById('shop-category-machines');
  const cardsSec = document.getElementById('shop-category-cards');
  const blueprintsSec = document.getElementById('shop-category-blueprints');
  
  if (machinesSec) machinesSec.style.display = (category === 'machines') ? 'block' : 'none';
  if (cardsSec) cardsSec.style.display = (category === 'cards') ? 'block' : 'none';
  if (blueprintsSec) blueprintsSec.style.display = (category === 'blueprints') ? 'block' : 'none';
};
// UI Elements
const scoreEl = document.getElementById('score');
const ppsEl = document.getElementById('pps');
const clickBtn = document.getElementById('click-btn');

function initApp() {
  if (window.Twitch && window.Twitch.ext) {
    window.Twitch.ext.onAuthorized((auth) => {
      authData = auth;
      userId = auth.userId;
      
      checkUserStatus();
    });
  }

  setTimeout(() => {
    if (!authData) {

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
  const notify = document.getElementById('game-notify');
  if (notify) notify.style.display = 'none';

  const join = document.getElementById('join-container');
  if (join) join.style.display = 'block';

  const gameUI = document.getElementById('game-ui');
  if (gameUI) gameUI.style.display = 'none';

  const dock = document.querySelector('.bottom-dock-nav');
  if (dock) dock.style.display = 'none';
}

function showGame() {
  const notify = document.getElementById('game-notify');
  if (notify) notify.style.display = 'none';

  const join = document.getElementById('join-container');
  if (join) join.style.display = 'none';

  const gameUI = document.getElementById('game-ui');
  if (gameUI) gameUI.style.display = 'block';

  const dock = document.querySelector('.bottom-dock-nav');
  if (dock) dock.style.display = 'flex';

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
 // Only overwrite if cloud score is greater than or equal to local score
 score = Math.max(score, Number(d.score) || 0);
 totalPointsEarned = Math.max(totalPointsEarned, Number(d.totalPointsEarned) || score);
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
 if (!gameStarted) return; 

 try {
 const docRef = db.collection("players").doc(userId);
 const doc = await docRef.get();
 
 // Safety Guard: Prevent saving zero over an existing higher score unless explicitly intended
 if (doc.exists) {
 const cloudData = doc.data();
 if ((cloudData.score || 0) > score && score === 0) {
 console.warn("Aborted save: Attempted to overwrite existing progress with zero.");
 return;
 }
 }

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

 await docRef.set(dataToSave, { merge: true });
 showNotify("Game Saved!");
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
    // Auto-restart equipped timed cards once their cooldown ends
    equippedSlots.forEach(cardId => {
      if (!cardId) return;
      const [key] = cardId.split('_');
      const tool = GAME_DATA.notions[key];
      const timed = tool?.Timed || tool?.timed || [0, 0];
      if (timed[0] > 0) {
        const timer = cardTimers[cardId];
        const now = Date.now();
        // If ready and still equipped, auto-restart active phase!
        if (!timer || now >= timer.readyAt) {
          activateTimedCard(cardId, timed);
        }
      }
    });
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

  // --- 1. SAFE CONFIRMATION ACTIONS ---
window.confirmBuyCard = function(key, tier) {
  buyNotionCard(key, tier);
  hideCardTooltip();
};

window.confirmEquipCard = function(cardId, tier) {
  equipCard(cardId, tier);
  hideCardTooltip();
};

window.confirmUnequipCard = function(slotIndex) {
  unequipCard(slotIndex);
  hideCardTooltip();
};

// --- 2. COMPLETE INSPECTION CARD FUNCTION ---
function showCardTooltip(key, tier, mode = 'shop', slotIndex = -1) {
 const tooltip = document.getElementById('global-card-tooltip');
 const tool = GAME_DATA.notions[key];
 const card = tool?.[tier];
 if (!tooltip || !tool || !card) return;

 const cardId = `${key}_${tier}`;
 const craftNames = Object.values(GAME_DATA.craftables).map(c => c.name);
 const timed = tool.Timed || tool.timed || [0, 0];
 const isTimed = timed[0] > 0;
 const timerText = isTimed 
? `⏱️ <strong>Active:</strong> ${Math.round(timed[0] / 60)}m | <strong>CD:</strong> ${Math.round(timed[1] / 60)}m<br>`
 : `⏱️ <strong>Type:</strong> Passive (Always On)<br>`;

 // Cost section list (only shown on shop cards)
 let costHTML = "";
 if (mode === 'shop') {
 const costItemsHTML = card.cost
 .map((needed, idx) => {
 if (needed <= 0) return null;
 const itemName = craftNames[idx];
 const owned = craftInventory[Object.keys(GAME_DATA.craftables)[idx]] || 0;
 const isMet = owned >= needed;

 return `
 <li class="cost-item ${isMet ? 'met' : 'missing'}">
 <span class="item-name">${itemName}</span>
 <span class="item-amount">${needed} / ${owned}</span>
 </li>
 `;
 })
 .filter(Boolean)
 .join('');

 costHTML = `
 <div class="card-cost-section">
 <div class="cost-header">
 <span>Required</span>
 <span style="font-size: 0.5rem; opacity: 0.8;">Needed/Owned</span>
 </div>
 <ul class="cost-list">
 ${costItemsHTML}
 </ul>
 </div>
 `;
}

 // Build the dedicated Action Button based on where you tapped
 let actionBtnHTML = "";
 if (mode === 'shop') {
 actionBtnHTML = `<button class="inspect-action-btn" onclick="confirmBuyCard('${key}', '${tier}')">Trade for Card</button>`;
 } else if (mode === 'inventory') {
 actionBtnHTML = `<button class="inspect-action-btn" onclick="confirmEquipCard('${cardId}', '${tier}')">Equip Card</button>`;
 } else if (mode === 'equipped') {
 actionBtnHTML = `<button class="inspect-action-btn unequip" onclick="confirmUnequipCard(${slotIndex})">Unequip</button>`;
 }

 tooltip.innerHTML = `
 <span class="inspect-close-btn" onclick="hideCardTooltip()">✕</span>
 <strong>${tool.name} (${tier.toUpperCase()})</strong><br>
 <em>"${tool.Description || ''}"</em><br><br>
 ⚡ <strong>SPM:</strong> +${card.spm}<br>
 ✨ <strong>Perk:</strong> ${getBonusDescription(card.bonus)}<br>
 ${timerText}
 ${costHTML}
 ${actionBtnHTML}
 `;
 tooltip.style.display = 'block';
 tooltip.classList.remove('card-pop-in');
 void tooltip.offsetWidth; // Force CSS reflow to restart animation
 tooltip.classList.add('card-pop-in');
}

function hideCardTooltip() {
  const tooltip = document.getElementById('global-card-tooltip');
  if (tooltip && tooltip.style.display === 'block') {
    tooltip.classList.remove('card-pop-in');
    tooltip.classList.add('card-pop-out');
    setTimeout(() => {
      tooltip.style.display = 'none';
      tooltip.classList.remove('card-pop-out');
    }, 200);
  }
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
      const maxLimit = 1;
      const currentOwned = craftInventory[cardId] || 0;
      const isMaxed = currentOwned >= maxLimit;

      const costText = card.cost
        .map((amt, idx) => amt > 0 ? `${amt} ${craftNames[idx]}` : null)
        .filter(Boolean)
        .join(', ');

      const el = document.createElement('div');
      el.className = `notion-card ${tier}`;

      // If already max-owned, grey it out and disable clicks completely!
      if (isMaxed) {
        el.style.opacity = '0.35';
        el.style.pointerEvents = 'none'; // Disables clicking & hover
        el.style.cursor = 'not-allowed';
      } else {
        el.onclick = () => showCardTooltip(key, tier, 'shop');
      }

      el.innerHTML = `
        <div class="card-name">${tool.name}</div>
        <div class="card-tier-label" style="color: ${tier === 'gold' ? '#ffd700' : tier === 'silver' ? '#c0c0c0' : '#cd7f32'}">
          ${isMaxed ? 'MAX OWNED' : tier}
        </div>
      `;
      // Hover: on click
      el.onclick = () => showCardTooltip(key, tier, 'shop');
      container.appendChild(el);
    });
  }
}

// --- BUY NOTION CARD (Capped: 4 Bronze, 1 Silver, 1 Gold) ---
function buyNotionCard(key, tier) {
  const card = GAME_DATA.notions[key]?.[tier];
  if (!card) return;

  const cardId = `${key}_${tier}`;
  const maxLimit = 1;
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
  if (document.getElementById('crafting-tab-score')) {
    document.getElementById('crafting-tab-score').innerText = score;
  }
  if (document.getElementById('shop-tab-score')) {
    document.getElementById('shop-tab-score').innerText = score;
  }
  // Stats Menu
  if (document.getElementById('stat-user')) document.getElementById('stat-user').innerText = userId;
  if (document.getElementById('stat-total-stitches')) document.getElementById('stat-total-stitches').innerText = totalPointsEarned;
  if (document.getElementById('stat-total-spm')) document.getElementById('stat-total-spm').innerText = totalSpm;
  for (const key of Object.keys(GAME_DATA.craftables)) {
    const ownedEl = document.getElementById(`owned-${key}`);
    if (ownedEl) ownedEl.innerText = craftInventory[key] || 0;
    
    const shopOwnedEl = document.getElementById(`shop-owned-${key}`);
    if (shopOwnedEl) shopOwnedEl.innerText = craftInventory[key] || 0;
  }
  for (const key of Object.keys(GAME_DATA.shopItems)) {
    const el = document.getElementById(`owned-shop-${key}`);
    if (el) el.innerText = shopInventory[key] || 0;
  }

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

// --- CLOSE ALL DRAWERS HELPER ---
window.closeAllDrawers = function() {
  document.querySelectorAll(".tab-content:not(#global-card-tooltip)").forEach(tab => {
    if (tab.style.display === "block") {
      tab.classList.remove('slide-in');
      tab.classList.add('slide-out');
      setTimeout(() => {
        tab.style.display = "none";
        tab.classList.remove('slide-out');
      }, 200);
    }
  });
  document.querySelectorAll(".dock-btn").forEach(b => b.classList.remove("active"));
  const menuBtn = document.getElementById("menu-toggle-btn");
  if (menuBtn) menuBtn.classList.remove("active");
};

function switchTab(tabId, btnId) {
  const target = document.getElementById(tabId);
  const btn = document.getElementById(btnId);
  if (!target) return;

  const isAlreadyOpen = target.style.display === "block";

  closeAllDrawers();
  hideCardTooltip();

  if (!isAlreadyOpen) {
    target.style.display = "block";
    target.classList.remove('slide-out', 'slide-in');
    void target.offsetWidth; // Force reflow
    target.classList.add('slide-in');
    if (btn) btn.classList.add("active");

    if (tabId === 'tab-notions') renderNotionsTab();
    if (tabId === 'tab-crafting') {
      renderCrafting();
      updateCraftingProgress();
    }
    if (tabId === 'tab-shop') {
      renderShop();
      renderShopNotions();
    }
    updateUI();
  }
}

bindClick("nav-crafting", () => switchTab("tab-crafting", "nav-crafting"));
bindClick("nav-notions", () => switchTab("tab-notions", "nav-notions"));
bindClick("nav-shop", () => switchTab("tab-shop", "nav-shop"));
bindClick("menu-toggle-btn", () => switchTab("tab-menu", "menu-toggle-btn"));
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
        <small>Cost: ${item.cost} Rope Bowl${item.cost > 1 ? 's' : ''}</small>
      </div>
      <div class="craft-controls">
        <input type="number" id="qty-shop-${key}" value="1" min="1" class="craft-qty-input">
        <button class="craft-btn" onclick="buyShopItem('${key}')">Buy</button>
      </div>
    `;
    container.appendChild(row);
  }
}
const shopSlotsContainer = document.getElementById('shop-inventory-slots');
if (shopSlotsContainer) {
  shopSlotsContainer.innerHTML = Object.entries(GAME_DATA.shopItems)
    .map(([key, item]) => `<div class="inv-slot"><span style="font-size:0.5rem">${item.name.split(' ')[0]}</span><span id="owned-shop-${key}">0</span></div>`)
    .join('');
}
function buyShopItem(key) {
  const item = GAME_DATA.shopItems[key];
  if (!item) return;

  const perks = getActiveNotionBonuses();
  const qtyInput = document.getElementById(`qty-shop-${key}`);
  const qty = parseInt(qtyInput?.value) || 1;

  // Apply discount to total purchase batch
  const rawTotal = item.cost * qty;
  const totalCost = Math.max(1, Math.floor(rawTotal * (1 - perks.shopCostDiscount)));
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

    const discountMsg = perks.shopCostDiscount > 0 ? ` (${Math.round(perks.shopCostDiscount * 100)}% off!)` : '';
    showNotify(`Bought ${qty}x ${item.name} for ${totalCost} Bowls${discountMsg}!`);
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

  const perks = getActiveNotionBonuses();
  let hasItems = false;

  for (const [key, item] of Object.entries(GAME_DATA.craftables)) {
    // Filter by selected tab category (defaults to 'rope')
    if ((item.category || 'rope') !== currentCraftCategory) continue;
    hasItems = true;

    const discountedCost = Math.max(1, Math.floor(item.cost * (1 - perks.craftCostDiscount)));
    const discountedTime = Math.max(1, Math.floor(item.craftTime * (1 - perks.craftTimeDiscount)));

    const costText = perks.craftCostDiscount > 0
      ? `<span style="color:#00ff88;">Costs ${discountedCost} Stitches</span> <s style="color:#adadb8; font-size:0.65rem;">(${item.cost})</s>`
      : `Costs ${item.cost} Stitches`;

    const row = document.createElement('div');
    row.className = 'crafting-item';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'stretch';
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div class="craft-info">
          <strong>${item.name}</strong>
          <span>${costText} (${discountedTime}s)</span>
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

  if (!hasItems) {
    container.innerHTML = '<div style="text-align:center; color:#adadb8; font-size:0.75rem; padding:20px;">No recipes in this category yet!</div>';
  }
}
function startCrafting(key) {
  const item = GAME_DATA.craftables[key];
  if (!item || activeCrafts[key]) return;

  const perks = getActiveNotionBonuses();
  const qtyInput = document.getElementById(`qty-${key}`);
  const qty = parseInt(qtyInput?.value) || 1;

  // Stitch cost discount still applies at click time
  const discountedCost = Math.max(1, Math.floor(item.cost * (1 - perks.craftCostDiscount)));
  const totalCost = discountedCost * qty;

  if (score >= totalCost) {
    score -= totalCost;
    activeCrafts[key] = {
      totalBaseSeconds: item.craftTime * qty,
      completedSeconds: 0,
      lastUpdate: Date.now(),
      qty: qty
    };

    showNotify(`Crafting ${qty}x ${item.name}...`);
    updateUI();
    saveUserData();
  } else {
    showNotify(`Need ${totalCost} Stitches!`, true);
  }
}

// Checks and updates crafting progress dynamically every second
function updateCraftingProgress() {
  const now = Date.now();
  const perks = getActiveNotionBonuses();

  // Dynamic Speed Multiplier (e.g. 50% discount = 2x speed)
  const speed = 1 / Math.max(0.1, (1 - perks.craftTimeDiscount));

  for (const [key, craft] of Object.entries(activeCrafts)) {
    const pBox = document.getElementById(`progress-box-${key}`);
    const pBar = document.getElementById(`progress-bar-${key}`);
    const pTimer = document.getElementById(`timer-text-${key}`);
    const craftBtn = document.getElementById(`btn-craft-${key}`);

    if (!pBox || !pBar || !pTimer) continue;

    // Backward-compatibility check for existing saves
    if (craft.totalBaseSeconds === undefined) {
      craft.totalBaseSeconds = (craft.totalDuration || 10000) / 1000;
      craft.completedSeconds = Math.max(0, (now - (craft.startTime || now)) / 1000);
      craft.lastUpdate = now;
    }

    // Add progress based on current active speed
    const delta = (now - craft.lastUpdate) / 1000;
    craft.lastUpdate = now;
    craft.completedSeconds += delta * speed;

    if (craft.completedSeconds >= craft.totalBaseSeconds) {
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
      pBox.style.display = 'block';
      pTimer.style.display = 'block';
      if (craftBtn) craftBtn.disabled = true;

      const percent = Math.min(100, (craft.completedSeconds / craft.totalBaseSeconds) * 100);
      pBar.style.width = `${percent}%`;

      const remainingBase = Math.max(0, craft.totalBaseSeconds - craft.completedSeconds);
      const remainingSec = Math.ceil(remainingBase / speed);
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

      
      
      slotEl.onclick = () => showCardTooltip(key, tier, 'equipped', index);
    } else {
      // When slot is empty:
      const defaultTiers = ['Bronze', 'Bronze', 'Silver', 'Gold'];
      const slotTier = defaultTiers[index].toLowerCase();
      slotEl.className = `slot ${slotTier}`;
      slotEl.innerHTML = `<span>${defaultTiers[index]}<br><small>Empty</small></span>`;
      slotEl.onclick = null; // Empty slots do nothing
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

        // Check if this card is currently on cooldown
        const timed = tool?.Timed || tool?.timed || [0, 0];
        const isTimed = timed[0] > 0;
        const timer = cardTimers[cardId];
        const now = Date.now();
        const isCooldown = isTimed && timer && now < timer.readyAt;

        let cooldownBadge = "";
        if (isCooldown && availableToEquip > 0) {
          const totalCd = timed[1] * 1000;
          const rem = Math.max(0, timer.readyAt - now);
          const pct = Math.max(0, Math.min(100, (rem / totalCd) * 100));
          const remSec = Math.ceil(rem / 1000);
          const remText = remSec > 60 ? `${Math.ceil(remSec / 60)}m` : `${remSec}s`;

          cooldownBadge = `
            <span style="font-size: 0.48rem; color: #ff5555; margin-top: 1px;">⏳ CD (${remText})</span>
            <div class="slot-timer-bar"><div class="slot-timer-fill cooldown" style="width:${pct}%"></div></div>
          `;
        }

        const cardEl = document.createElement('div');
        cardEl.className = `notion-card ${tier}`;

        // If all copies are equipped, grey out and disable clicks completely!
        if (availableToEquip === 0) {
          cardEl.style.opacity = '0.35';
          cardEl.style.pointerEvents = 'none';
          cardEl.style.cursor = 'not-allowed';
        } else {
          cardEl.style.opacity = '1';
          cardEl.onclick = () => showCardTooltip(key, tier, 'inventory');
        }

        cardEl.innerHTML = `
          <div class="card-name">${tool.name}</div>
          <div class="card-tier-label" style="color: ${tier === 'gold' ? '#ffd700' : tier === 'silver' ? '#c0c0c0' : '#cd7f32'}">
            ${availableToEquip === 0 ? 'EQUIPPED' : tier}
          </div>
          ${cooldownBadge}
          <small style="font-size: 0.52rem; margin-top: 2px;">Owned: ${totalOwned} (${availableToEquip} free)</small>
        `;

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

// --- EQUIP CARD (Slot Rules + Max 1 of each Perk Type) ---
function equipCard(cardId, tier) {
  const [key] = cardId.split('_');
  const tool = GAME_DATA.notions[key];
  const card = tool?.[tier];
  if (!card) return;

  // RULE: Only allow 1 of each perk type equipped across all 4 slots!
  if (card.bonus && card.bonus.length >= 2) {
    const perkType = card.bonus[0];
    const perkNames = ["Click Multiplier", "Cheaper Crafting", "Faster Crafting", "Cheaper Shop", "SPM Boost"];

    const isDuplicate = equippedSlots.some(eqId => {
      if (!eqId) return false;
      const [eqKey, eqTier] = eqId.split('_');
      const eqCard = GAME_DATA.notions[eqKey]?.[eqTier];
      return eqCard?.bonus && eqCard.bonus[0] === perkType;
    });

    if (isDuplicate) {
      showNotify(`Already have a ${perkNames[perkType]} card equipped!`, true);
      return;
    }
  }

  // Slot tier checks (Bronze anywhere, Silver Slot 3, Gold Slot 4)
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
    
    // Auto-start active phase if it's a timed card and not on cooldown
    const timed = tool?.Timed || tool?.timed || [0, 0];
    const isTimed = timed[0] > 0;
    const timer = cardTimers[cardId];
    const now = Date.now();
    const isCooldown = timer && now < timer.readyAt;

    if (isTimed && !isCooldown) {
      activateTimedCard(cardId, timed);
    } else {
      showNotify(`Equipped to Slot ${targetSlot + 1}!`);
    }

    updateUI();
    renderNotionsTab();
    renderCrafting();
    renderShop();
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
  renderCrafting(); // Updates crafting discounts immediately!
  renderShop();     // Updates shop discounts immediately!
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

const clickerBtn = document.querySelector('.round-clicker-btn');
const container = document.querySelector('.container');

if (clickerBtn) {
  let lastClickTime = 0;
  const cooldown = 100;

  clickerBtn.addEventListener('click', (e) => {
    clickerBtn.classList.remove('is-bouncing');
    void clickerBtn.offsetWidth;
    clickerBtn.classList.add('is-bouncing');

    const now = Date.now();
    if (now - lastClickTime >= cooldown) {
      lastClickTime = now;

      const ripple = document.createElement('div');
      ripple.className = 'clicker-ripple';
      clickerBtn.appendChild(ripple);

      ripple.addEventListener('animationend', (e) => {
        if (e.animationName === 'lightFlowOut') {
          ripple.remove();
        }
      });

      // Randomized burst wrapper
    const burstWrapper = document.createElement('div');
    burstWrapper.style.position = 'absolute';
    burstWrapper.style.top = '75%';
    burstWrapper.style.left = '50%';
    burstWrapper.style.pointerEvents = 'none';
    burstWrapper.style.zIndex = '2';
    burstWrapper.style.setProperty('--spin', Math.random() < 0.5 ? '1' : '-1');
    burstWrapper.style.transform = `rotate(${Math.random() * 360}deg)`;

      const burst = document.createElement('div');
      burst.className = 'click-ember-burst';
      burstWrapper.appendChild(burst);
      if (container) container.appendChild(burstWrapper);

      burst.addEventListener('animationend', () => {
        burstWrapper.remove();
      });
    }
  });

  clickerBtn.addEventListener('animationend', (e) => {
    if (e.animationName === 'buttonBounce') {
      clickerBtn.classList.remove('is-bouncing');
    }
  });
}

  document.querySelectorAll(".dock-btn").forEach(b => b.classList.remove("active"));
  const menuBtn = document.getElementById("menu-toggle-btn");
  if (menuBtn) menuBtn.classList.remove("active");
