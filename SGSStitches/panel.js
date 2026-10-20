// --- FIREBASE DB INITIALIZATION ---
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

let ropeBowlsCount = 0;
let shopInventory = {};
let craftInventory = {};
let lifetimeCrafted = {};
let activeCrafts = {};
let equippedSlots = [null, null, null, null];
let cardTimers = {};
let currentCraftCategory = 'rope';

let ownedBlueprints = {};
let craftedDecor = {};
let equippedDecor = null;

window.switchCraftCategory = function(category, btnEl) {
 currentCraftCategory = category;
 document.querySelectorAll('.recipe-tab').forEach(t => t.classList.remove('active'));
 if (btnEl) btnEl.classList.add('active');
 renderCrafting();
};

const notionsMachinesSlots = document.getElementById('notions-machines-slots');
if (notionsMachinesSlots) {
 notionsMachinesSlots.innerHTML = Object.entries(GAME_DATA.shopItems)
 .map(([key, item]) => `<div class="inv-slot"><span style="font-size:0.5rem">${item.name.split(' ')[0]}</span><span id="owned-machines-${key}">0</span></div>`)
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

 if (category === 'decor') renderNotionsDecor('decor');
 if (category === 'buttons') renderNotionsDecor('buttons');
};

window.switchShopCategory = function(category, btnEl) {
 document.querySelectorAll('#tab-shop .recipe-tab').forEach(t => t.classList.remove('active'));
 if (btnEl) btnEl.classList.add('active');
 
 const machinesSec = document.getElementById('shop-category-machines');
 const cardsSec = document.getElementById('shop-category-cards');
 const blueprintsSec = document.getElementById('shop-category-blueprints');
 
 if (machinesSec) machinesSec.style.display = (category === 'machines') ? 'block' : 'none';
 if (cardsSec) cardsSec.style.display = (category === 'cards') ? 'block' : 'none';
 if (blueprintsSec) {
     blueprintsSec.style.display = (category === 'blueprints') ? 'block' : 'none';
     if (category === 'blueprints') renderShopBlueprints();
 }
};

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
 renderShopBlueprints();
 renderCrafting();
 renderNotionsTab();
 renderNotionsDecor();
 applyEquippedWallpaper();
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

function getTotalSPM() {
 const perks = getActiveNotionBonuses();

 let machineSPM = 0;
 for (const [key, count] of Object.entries(shopInventory)) {
 if (GAME_DATA.shopItems[key]) {
 machineSPM += (count || 0) * GAME_DATA.shopItems[key].spm;
 }
 }

 const baseTotal = GAME_DATA.baseSPM + machineSPM + perks.flatSpm;
 return Math.round(baseTotal * (1 + perks.spmMultiplier));
}

async function loadUserData() {
 try {
 const docRef = db.collection("players").doc(userId);
 const doc = await docRef.get();

 if (doc.exists) {
 const d = doc.data();
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
 ownedBlueprints = d.ownedBlueprints || {};
 craftedDecor = d.craftedDecor || {};
 equippedDecor = d.equippedDecor || null;
 
 equippedWallpaper = d.equippedWallpaper || null;
 equippedButton = d.equippedButton || null;
 buttonGlowColor = d.buttonGlowColor || '#00f0ff';
 console.log("Loaded craftedDecor:", craftedDecor);

 if (Object.keys(activeCrafts).length > 0) {
 startStitchAnimation();
 }
 }
 updateUI();
 applyEquippedWallpaper();
 renderNotionsDecor();
 } catch (err) {
 console.error("Firebase load error:", err);
 }
}

async function saveUserData() {
 if (!gameStarted) return; 

 try {
 const docRef = db.collection("players").doc(userId);
 const doc = await docRef.get();
 
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
 ownedBlueprints: ownedBlueprints,
 craftedDecor: craftedDecor,
 equippedWallpaper: equippedWallpaper,
 equippedButton: equippedButton,
 buttonGlowColor: buttonGlowColor,
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

 const slotElements = document.querySelectorAll('.slots-grid .slot');
 equippedSlots.forEach((cardId, index) => {
 if (!cardId || !isCardActive(cardId)) return;
 const [key, tier] = cardId.split('_');
 const card = GAME_DATA.notions[key]?.[tier];
 if (card && card.spm && slotElements[index]) {
 spawnCardFloatingSPM(slotElements[index], card.spm);
 }

 const tool = GAME_DATA.notions[key];
 const timed = tool?.Timed || tool?.timed || [0, 0];
 if (timed[0] > 0) {
 const timer = cardTimers[cardId];
 const now = Date.now();
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

function bindClick(id, handler) {
 const el = document.getElementById(id);
 if (el) el.addEventListener('click', handler);
}

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
 return Math.max(1, Math.round(1 * perks.clickMultiplier));
}

function spawnFloatingText(e, text) {
 const el = document.createElement('div');
 el.className = 'floating-click';
 el.innerText = text;

 const randomX = (Math.random() - 0.5) * 40;
 const randomRotate = (Math.random() - 0.5) * 30;

 el.style.left = `${e.clientX + randomX}px`;
 el.style.top = `${e.clientY - 10}px`;
 el.style.transform = `rotate(${randomRotate}deg)`;

 document.body.appendChild(el);
 setTimeout(() => el.remove(), 1500);
}

function spawnCardFloatingSPM(slotEl, spmValue) {
 const rect = slotEl.getBoundingClientRect();
 const el = document.createElement('div');
 el.className = 'floating-click card-floating-spm';
 el.innerText = `+${spmValue}`;
 el.style.color = '#00ff88';
 el.style.fontSize = '0.75rem';

 const randomX = (Math.random() - 0.5) * 24;
 const randomDriftX = (Math.random() - 0.5) * 20;
 el.style.setProperty('--drift-x', `${randomDriftX}px`);
 el.style.left = `${rect.left + rect.width / 2 + randomX}px`;
 el.style.top = `${rect.top + 5}px`;

 document.body.appendChild(el);
 setTimeout(() => el.remove(), 2500);
}

let stitchPatternToggle = false;

let stitchInterval1 = null;
let stitchInterval2 = null;

function startStitchAnimation() {
  if (stitchInterval1) return;
  stitchInterval1 = setInterval(() => {
    spawnCraftingStitches('|');
  }, 200);
  stitchInterval2 = setInterval(() => {
    spawnCraftingStitches(['/', '\\'][Math.floor(Math.random() * 2)]);
  }, 300);
}

function stopStitchAnimation() {
  clearInterval(stitchInterval1);
  clearInterval(stitchInterval2);
  stitchInterval1 = null;
  stitchInterval2 = null;
}

function spawnCraftingStitches(char) {
  const craftBtn = document.getElementById('nav-crafting');
  if (!craftBtn) return;
  const rect = craftBtn.getBoundingClientRect();
  const offsetX = (Math.random() - 0.5) * (rect.width * 0.8);

  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];

  const el = document.createElement('div');
  el.className = 'crafting-stitch-floater';
  el.textContent = char;

  el.style.left = `${rect.left + rect.width / 2 + offsetX}px`;
  el.style.top = `${rect.top + 15}px`;
  el.style.color = randomColor;
  el.style.fontWeight = 'bold';
  el.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.8)';

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 400);
}

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

 if (e) spawnFloatingText(e, `+${clickPower}`);

 updateUI();
});

function getBonusDescription(bonus) {
 if (!bonus || bonus.length < 2) return "None";
 const [type, val] = bonus;
 const types = ["Click Multiplier", "Cheaper Crafting", "Faster Crafting", "Cheaper Shop", "Timed SPM Boost"];
 if (type === 0) return `+${val * 100}% ${types[type]}`;
 return `${val * 100}% ${types[type]}`;
}

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
 void tooltip.offsetWidth;
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

function renderShopNotions() {
 const container = document.getElementById('shop-notions-container');
 const tooltip = document.getElementById('global-card-tooltip');
 if (!container || !tooltip) return;
 container.innerHTML = '';

 const craftNames = ["Coasters", "Std Bowls", "Rainbowls", "Large Bowls", "Fabrics"];

 for (const [key, tool] of Object.entries(GAME_DATA.notions)) {
 ['bronze', 'silver', 'gold'].forEach(tier => {
 const card = tool[tier];
 if (!card) return;

 const cardId = `${key}_${tier}`;
 const maxLimit = 1;
 const currentOwned = craftInventory[cardId] || 0;
 const isMaxed = currentOwned >= maxLimit;

 const el = document.createElement('div');
 el.className = `notion-card ${tier}`;

 if (isMaxed) {
 el.style.opacity = '0.35';
 el.style.pointerEvents = 'none';
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
 el.onclick = () => showCardTooltip(key, tier, 'shop');
 container.appendChild(el);
 });
 }
}

function renderShopBlueprints() {
  const container = document.getElementById('shop-category-blueprints');
  if (!container) return;
  container.innerHTML = '';

  const craftNames = ["Coasters", "Std Bowls", "Rainbowls", "Large Bowls", "Fabrics"];
  let hasItems = false;

  for (const [key, item] of Object.entries(GAME_DATA.decor)) {
    const isOwned = (ownedBlueprints[key] || 0) > 0;
    if (isOwned) continue;
    hasItems = true;

    const costItemsHTML = item.cost
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

    const row = document.createElement('div');
    row.className = 'crafting-item';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'stretch';
    row.innerHTML = `
      <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
        <img src="${item.image}" style="width:50px; height:35px; object-fit:cover; border-radius:4px; border:1px solid #46464f;">
        <div class="craft-info" style="flex:1;">
          <strong>${item.name} Blueprint</strong>
          <small>Category: ${item.category || 'decor'}</small>
        </div>
        <div class="craft-controls">
          <button class="craft-btn" onclick="buyBlueprint('${key}')">Buy</button>
        </div>
      </div>
      <div class="card-cost-section" style="margin-top: 6px;">
        <div class="cost-header">
          <span>Blueprint Cost</span>
          <span>Needed/Owned</span>
        </div>
        <ul class="cost-list">
          ${costItemsHTML}
        </ul>
      </div>
    `;
    container.appendChild(row);
  }

  if (!hasItems) {
    container.innerHTML = '<div style="text-align:center; color:#adadb8; font-size:0.75rem; padding:20px;">All blueprints unlocked!</div>';
  }
}

function buyBlueprint(key) {
 const item = GAME_DATA.decor[key];
 if (!item || (ownedBlueprints[key] || 0) > 0) return;

 const [c0, c1, c2, c3, c4] = item.cost;
 const c = craftInventory;

 if ((c.coaster || 0) >= c0 && (c.stdBowl || 0) >= c1 && (c.rainbowl || 0) >= c2 && (c.largeBowl || 0) >= c3 && (c.fabric || 0) >= c4) {
 c.coaster = (c.coaster || 0) - c0;
 c.stdBowl = (c.stdBowl || 0) - c1;
 c.rainbowl = (c.rainbowl || 0) - c2;
 c.largeBowl = (c.largeBowl || 0) - c3;
 c.fabric = (c.fabric || 0) - c4;
 ropeBowlsCount = c.stdBowl;

 ownedBlueprints[key] = 1;

 showNotify(`Unlocked blueprint for ${item.name}!`);
 updateUI();
 renderShopBlueprints();
 renderCrafting();
 saveUserData();
 } else {
 showNotify("Missing required crafted items for blueprint!", true);
 }
}

function buyNotionCard(key, tier) {
 const card = GAME_DATA.notions[key]?.[tier];
 if (!card) return;

 const cardId = `${key}_${tier}`;
 const maxLimit = 1;
 const currentOwned = craftInventory[cardId] || 0;

 if (currentOwned >= maxLimit) {
 showNotify(`Max ${tier.toUpperCase()} ${GAME_DATA.notions[key].name} already owned (${maxLimit}/${maxLimit})!`, true);
 return;
 }

 const [c0, c1, c2, c3, c4] = card.cost;
 const c = craftInventory;

 if ((c.coaster || 0) >= c0 && (c.stdBowl || 0) >= c1 && (c.rainbowl || 0) >= c2 && (c.largeBowl || 0) >= c3 && (c.fabric || 0) >= c4) {
 c.coaster = (c.coaster || 0) - c0;
 c.stdBowl = (c.stdBowl || 0) - c1;
 c.rainbowl = (c.rainbowl || 0) - c2;
 c.largeBowl = (c.largeBowl || 0) - c3;
 c.fabric = (c.fabric || 0) - c4;
 ropeBowlsCount = c.stdBowl;

 craftInventory[cardId] = currentOwned + 1;

 showNotify(`Traded for ${GAME_DATA.notions[key].name} (${tier.toUpperCase()})!`);
 updateUI();
 renderShopNotions();
 saveUserData();
 } else {
 showNotify("Missing required crafted items!", true);
 }
}

function updateUI() {
 const totalSpm = getTotalSPM();

 if (scoreEl) scoreEl.innerText = score;
 if (ppsEl) ppsEl.innerText = totalSpm;
 if (document.getElementById('crafting-tab-score')) {
 document.getElementById('crafting-tab-score').innerText = score;
 }
 if (document.getElementById('shop-tab-score')) {
 document.getElementById('shop-tab-score').innerText = score;
 }
 if (document.getElementById('stat-user')) document.getElementById('stat-user').innerText = userId;
 if (document.getElementById('stat-total-stitches')) document.getElementById('stat-total-stitches').innerText = totalPointsEarned;
 if (document.getElementById('stat-total-spm')) document.getElementById('stat-total-spm').innerText = totalSpm;
 
 for (const key of Object.keys(GAME_DATA.craftables)) {
 const count = craftInventory[key] || 0;
 document.querySelectorAll(`#owned-${key}`).forEach(el => el.innerText = count);
 document.querySelectorAll(`#shop-owned-${key}`).forEach(el => el.innerText = count);
 }

 for (const key of Object.keys(GAME_DATA.shopItems)) {
 const el = document.getElementById(`owned-shop-${key}`);
 if (el) el.innerText = shopInventory[key] || 0;

 const notionEl = document.getElementById(`owned-machines-${key}`);
 if (notionEl) notionEl.innerText = shopInventory[key] || 0;
 }
}

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
 void target.offsetWidth;
 target.classList.add('slide-in');
 if (btn) btn.classList.add("active");

 if (tabId === 'tab-notions') {
     renderNotionsTab();
     renderNotionsDecor();
 }
 if (tabId === 'tab-crafting') {
 renderCrafting();
 updateCraftingProgress();
 }
 if (tabId === 'tab-shop') {
 renderShop();
 renderShopNotions();
 renderShopBlueprints();
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

 const rawTotal = item.cost * qty;
 const totalCost = Math.max(1, Math.floor(rawTotal * (1 - perks.shopCostDiscount)));
 const currentBowls = craftInventory.stdBowl || 0;

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
 if ((item.category || 'rope') !== currentCraftCategory) continue;
 hasItems = true;

 const discountedCost = Math.max(1, Math.floor(item.cost * (1 - perks.craftCostDiscount)));
 const discountedTime = Math.max(1, Math.floor(item.craftTime * (1 - perks.craftTimeDiscount)));

 const costText = perks.craftCostDiscount > 0
 ? `<span style="color:#00ff88;">Costs ${discountedCost} Stitches</span> <s style="color:#adadb8; font-size:0.65rem;">(${item.cost})</s>`
 : `Costs ${item.cost} Stitches`;

 const isCrafting = !!activeCrafts[key];

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
 <input type="number" id="qty-${key}" value="1" min="1" class="craft-qty-input" ${isCrafting ? 'disabled' : ''}>
 <button id="btn-craft-${key}" class="craft-btn" ${isCrafting ? 'disabled style="opacity:0.5;"' : ''} onclick="startCrafting('${key}')">Craft</button>
 </div>
 </div>
 <div id="progress-box-${key}" class="craft-progress-container" style="display: ${isCrafting ? 'block' : 'none'};">
 <div id="progress-bar-${key}" class="craft-progress-bar"></div>
 </div>
 <div id="timer-text-${key}" class="craft-timer-text" style="display: ${isCrafting ? 'block' : 'none'};">Crafting...</div>
 `;
 container.appendChild(row);
 }

 if (currentCraftCategory === 'decor' || currentCraftCategory === 'buttons') {
 for (const [key, item] of Object.entries(GAME_DATA.decor)) {
 if ((item.category || 'decor') !== currentCraftCategory) continue;

 const hasBlueprint = (ownedBlueprints[key] || 0) > 0;
 if (!hasBlueprint) continue;

 const isAlreadyCrafted = (craftedDecor[key] || 0) > 0;
 if (isAlreadyCrafted) continue;
 hasItems = true;

 const isCrafting = !!activeCrafts[`decor_${key}`];
 const stitchCost = 500;

 const row = document.createElement('div');
 row.className = 'crafting-item';
 row.style.flexDirection = 'column';
 row.style.alignItems = 'stretch';
 row.innerHTML = `
 <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
 <img src="${item.image}" style="width:50px; height:35px; object-fit:cover; border-radius:4px; border:1px solid #46464f;">
 <div class="craft-info" style="flex:1;">
 <strong>${item.name}</strong>
 <span>Costs ${stitchCost} Stitches (${item.craftTime}s)</span>
 </div>
 <div class="craft-controls">
 <button id="btn-craft-decor_${key}" class="craft-btn" ${isCrafting ? 'disabled style="opacity:0.5;"' : `onclick="startCraftingDecor('${key}')"`}>
 ${isCrafting ? 'Crafting...' : 'Craft'}
 </button>
 </div>
 </div>
 <div id="progress-box-decor_${key}" class="craft-progress-container" style="display: ${isCrafting ? 'block' : 'none'};">
 <div id="progress-bar-decor_${key}" class="craft-progress-bar"></div>
 </div>
 <div id="timer-text-decor_${key}" class="craft-timer-text" style="display: ${isCrafting ? 'block' : 'none'};">Crafting...</div>
 `;
 container.appendChild(row);
 }
 }

 if (!hasItems) {
 container.innerHTML = '<div style="text-align:center; color:#adadb8; font-size:0.75rem; padding:20px;">No recipes in this category yet! (Unlock blueprints in the Shop)</div>';
 }
}

function startCrafting(key) {
 const item = GAME_DATA.craftables[key];
 if (!item || activeCrafts[key]) return;

 const perks = getActiveNotionBonuses();
 const qtyInput = document.getElementById(`qty-${key}`);
 const qty = parseInt(qtyInput?.value) || 1;

 const discountedCost = Math.max(1, Math.floor(item.cost * (1 - perks.craftCostDiscount)));
 const totalCost = discountedCost * qty;
 activeCrafts[key] = {
  totalBaseSeconds: item.craftTime * qty,
  completedSeconds: 0,
  lastUpdate: Date.now(),
  qty: qty
};
 startStitchAnimation();
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

function startCraftingDecor(key) {
 const item = GAME_DATA.decor[key];
 if (!item || activeCrafts[`decor_${key}`]) return;

 const stitchCost = 500;
 activeCrafts[`decor_${key}`] = {
  totalBaseSeconds: item.craftTime,
  completedSeconds: 0,
  lastUpdate: Date.now(),
  qty: 1,
  isDecor: true,
  decorKey: key
};
 startStitchAnimation();
 if (score >= stitchCost) {
 score -= stitchCost;
 activeCrafts[`decor_${key}`] = {
    totalBaseSeconds: item.craftTime,
    completedSeconds: 0,
    lastUpdate: Date.now(),
    qty: 1,
    isDecor: true,
    decorKey: key
};

 showNotify(`Crafting ${item.name}...`);
 updateUI();
 saveUserData();
 } else {
 showNotify(`Need ${stitchCost} Stitches!`, true);
 }
}

function updateCraftingProgress() {
 const now = Date.now();
 const perks = getActiveNotionBonuses();
 const speed = 1 / Math.max(0.1, (1 - perks.craftTimeDiscount));

 for (const [key, craft] of Object.entries(activeCrafts)) {
 const isDecor = craft.isDecor;
 const suffixKey = isDecor ? `decor_${craft.decorKey}` : key;

 if (craft.totalBaseSeconds === undefined) {
 craft.totalBaseSeconds = (craft.totalDuration || 10000) / 1000;
 craft.completedSeconds = Math.max(0, (now - (craft.startTime || now)) / 1000);
 craft.lastUpdate = now;
 }

 const delta = (now - craft.lastUpdate) / 1000;
 craft.lastUpdate = now;
 craft.completedSeconds += delta * speed;

 const pBox = document.getElementById(`progress-box-${suffixKey}`);
 const pBar = document.getElementById(`progress-bar-${suffixKey}`);
 const pTimer = document.getElementById(`timer-text-${suffixKey}`);
 const craftBtn = document.getElementById(`btn-craft-${suffixKey}`);

 if (craft.completedSeconds >= craft.totalBaseSeconds) {
 if (isDecor) {
 craftedDecor[craft.decorKey] = 1;
 delete activeCrafts[key];
 if (Object.keys(activeCrafts).length === 0) {
 stopStitchAnimation();
 }
 showNotify(`Completed ${GAME_DATA.decor[craft.decorKey].name}!`);
 updateUI();
 renderCrafting();
 renderNotionsDecor();
 saveUserData();
 return;
 }

 craftInventory[key] = (craftInventory[key] || 0) + craft.qty;
 lifetimeCrafted[key] = (lifetimeCrafted[key] || 0) + craft.qty;
 delete activeCrafts[key];

 if (Object.keys(activeCrafts).length === 0) {
 stopStitchAnimation();
 }

 if (pBox) pBox.style.display = 'none';
 if (pTimer) pTimer.style.display = 'none';
 if (craftBtn) craftBtn.disabled = false;

 showNotify(`Completed ${craft.qty}x ${GAME_DATA.craftables[key].name}!`);
 updateUI();
 saveUserData();
 } else if (pBox && pBar && pTimer) {
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

function isCardActive(cardId) {
 if (!cardId) return false;
 const [key] = cardId.split('_');
 const tool = GAME_DATA.notions[key];
 if (!tool) return false;

 const timed = tool.Timed || tool.timed || [0, 0];
 if (timed[0] === 0) return true;

 const now = Date.now();
 const timer = cardTimers[cardId];
 return timer && now < timer.activeUntil;
}

function getActiveNotionBonuses() {
 const perks = {
 flatSpm: 0,
 spmMultiplier: 0,
 clickMultiplier: 1.0,
 craftCostDiscount: 0,
 craftTimeDiscount: 0,
 shopCostDiscount: 0
 };

 equippedSlots.forEach(cardId => {
 if (!cardId || !isCardActive(cardId)) return;
 const [key, tier] = cardId.split('_');
 const card = GAME_DATA.notions[key]?.[tier];
 if (!card) return;

 if (card.spm) perks.flatSpm += card.spm;

 if (card.bonus && card.bonus.length === 2) {
 const [type, val] = card.bonus;
 if (type === 0) perks.clickMultiplier += val;
 if (type === 1) perks.craftCostDiscount += val;
 if (type === 2) perks.craftTimeDiscount += val;
 if (type === 3) perks.shopCostDiscount += val;
 if (type === 4) perks.spmMultiplier += val;
 }
 });

 return perks;
}

function renderNotionsTab() {
 const slotsGrid = document.querySelector('.slots-grid');
 const ownedList = document.getElementById('owned-notions-list');
 if (!slotsGrid || !ownedList) return;

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
 const defaultTiers = ['Bronze', 'Bronze', 'Silver', 'Gold'];
 const slotTier = defaultTiers[index].toLowerCase();
 slotEl.className = `slot ${slotTier}`;
 slotEl.innerHTML = `<span>${defaultTiers[index]}<br><small>Empty</small></span>`;
 slotEl.onclick = null;
 slotEl.onmouseenter = null;
 slotEl.onmouseleave = null;
 }
 });

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
 cardEl.style.position = 'relative';

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
 ${availableToEquip === 0 ? 'OWNED' : tier}
 </div>
 ${cooldownBadge}
 <div class="card-tier-label" style="color: #adadb8; margin-top: 2px;">
 ${availableToEquip === 0 ? 'EQUIPPED' : `Owned: ${totalOwned}`}
 </div>
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

let equippedWallpaper = null;
let equippedButton = null;
let buttonGlowColor = '#00f0ff';

function renderNotionsDecor(filterCategory = 'decor') {
 const containerId = filterCategory === 'buttons' ? 'notions-category-buttons' : 'notions-category-decor';
 const container = document.getElementById(containerId);
 if (!container) return;
 container.innerHTML = '';

 // If category is buttons, add a global glow color picker section at the top
 if (filterCategory === 'buttons') {
 const controlBox = document.createElement('div');
 controlBox.style.cssText = 'background:#1f1f23; border:1px solid #46464f; border-radius:6px; padding:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; font-size:0.7rem;';
 controlBox.innerHTML = `
   <span>Clicker Glow Color:</span>
   <input type="color" id="global-glow-picker" value="${buttonGlowColor || '#00f0ff'}" style="width:50px; height:22px; border:1px solid #46464f; background:transparent; cursor:pointer; border-radius:3px;">
 `;
 
 controlBox.querySelector('input').addEventListener('input', (e) => {
   const val = e.target.value;
   buttonGlowColor = val;
   document.documentElement.style.setProperty('--btn-glow-color', val);
   saveUserData();
 });
 
 container.appendChild(controlBox);
 }

 const grid = document.createElement('div');
 grid.className = 'notions-grid';

 let hasItems = false;

 for (const [key, item] of Object.entries(GAME_DATA.decor)) {
 if ((item.category || 'decor') !== filterCategory) continue;
 const owned = (craftedDecor[key] || 0) > 0;
 if (!owned) continue;
 hasItems = true;

 const isEquipped = filterCategory === 'buttons' ? equippedButton === key : equippedWallpaper === key;

 const cardEl = document.createElement('div');
 cardEl.className = 'notion-card';
 cardEl.style.position = 'relative';
 cardEl.style.overflow = 'visible';
 cardEl.style.borderColor = isEquipped ? '#00f0ff' : '#46464f';
 cardEl.innerHTML = `
 <img src="${item.image}" style="width:100%; height:60px; object-fit:cover; border-radius:2px; margin-bottom:2px;">
 <div class="card-name">${item.name}</div>
 <div class="card-tier-label" style="color: ${isEquipped ? '#00f0ff' : '#adadb8'}">
 ${isEquipped ? 'EQUIPPED' : 'OWNED'}
 </div>
 `;

 if (isEquipped) {
 const unequipBadge = document.createElement('div');
 unequipBadge.innerHTML = '✕ Unequip';
 unequipBadge.style.cssText = 'position:absolute; top:-6px; right:-6px; background:rgba(255,68,68,0.95); color:white; font-size:0.65rem; padding:4px 8px; border-radius:6px; cursor:pointer; font-weight:bold; z-index:10; box-shadow:0 2px 6px rgba(0,0,0,0.5);';
 unequipBadge.onclick = (e) => {
 e.stopPropagation();
 equipDecor(null, filterCategory);
 };
 cardEl.appendChild(unequipBadge);
 cardEl.onclick = () => {};
 } else {
 cardEl.onclick = () => equipDecor(key, filterCategory);
 }

 grid.appendChild(cardEl);
 }

 if (!hasItems && filterCategory !== 'buttons') {
 container.innerHTML = `<div style="text-align:center; color:#adadb8; font-size:0.75rem; padding:20px;">No ${filterCategory} crafted yet! Buy blueprints in the Shop and craft them.</div>`;
 } else {
 container.appendChild(grid);
 }
}

function equipDecor(key, category = 'decor') {
  if (category === 'buttons') {
    if (key === null) {
      equippedButton = null;
      showNotify("Unequipped button!");
    } else {
      equippedButton = key;
      showNotify(`Equipped ${GAME_DATA.decor[key].name}!`);
    }
  } else {
    if (key === null) {
      equippedWallpaper = null;
      showNotify("Unequipped wallpaper!");
    } else {
      equippedWallpaper = key;
      showNotify(`Equipped ${GAME_DATA.decor[key].name}!`);
    }
  }

  applyEquippedWallpaper();
  renderNotionsDecor('decor');
  renderNotionsDecor('buttons');
  updateUI();
  saveUserData();
}

function applyEquippedWallpaper() {
 const container = document.querySelector('.container');
 const clickerBtn = document.getElementById('click-btn');
 document.documentElement.style.setProperty('--btn-glow-color', buttonGlowColor);
 if (!container) return;

 if (equippedWallpaper && GAME_DATA.decor[equippedWallpaper]) {
 const wallItem = GAME_DATA.decor[equippedWallpaper];
 container.style.backgroundImage = `url('${wallItem.image}')`;
 container.style.backgroundSize = 'cover';
 container.style.backgroundPosition = 'center';
 } else {
 container.style.backgroundImage = '';
 }

 if (equippedButton && GAME_DATA.decor[equippedButton]) {
 const btnItem = GAME_DATA.decor[equippedButton];
 if (clickerBtn) {
 clickerBtn.style.backgroundImage = `url('${btnItem.image}')`;
 clickerBtn.style.backgroundSize = 'contain';
 const scale = btnItem.scale || 1.0;
 clickerBtn.style.setProperty('--btn-scale', scale);
 }
 } else {
 if (clickerBtn) {
 clickerBtn.style.backgroundImage = "url('images/clickerbutton.png')";
 clickerBtn.style.backgroundSize = 'contain';
 clickerBtn.style.setProperty('--btn-scale', '1');
 }
 }
}

function equipCard(cardId, tier) {
 const [key] = cardId.split('_');
 const tool = GAME_DATA.notions[key];
 const card = tool?.[tier];
 if (!card) return;

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

function unequipCard(slotIndex) {
 const cardId = equippedSlots[slotIndex];
 if (!cardId) return;

 const [key] = cardId.split('_');
 const tool = GAME_DATA.notions[key];
 const timed = tool?.Timed || tool?.timed || [0, 0];
 const isTimed = timed[0] > 0;

 if (isTimed && isCardActive(cardId)) {
 showNotify("Cannot unequip while active timer is running!", true);
 return;
 }
 hideCardTooltip();
 equippedSlots[slotIndex] = null;
 showNotify(`Unequipped Slot ${slotIndex + 1}!`);
 updateUI();
 renderNotionsTab();
 renderCrafting();
 renderShop();
 saveUserData();
}

function activateTimedCard(cardId, timed) {
 const [duration, cooldown] = timed;
 const now = Date.now();
 const [key, tier] = cardId.split('_');
 const tool = GAME_DATA.notions[key];
 const card = tool?.[tier];

 cardTimers[cardId] = {
 activeUntil: now + (duration * 1000),
 readyAt: now + ((duration + cooldown) * 1000)
 };

 const perkText = getBonusDescription(card?.bonus);
 showPerkBanner(`${tool?.name || 'Card'} Activated!`, perkText);

 updateUI();
 renderNotionsTab();
 saveUserData();
}

function showPerkBanner(title, perkDetail) {
 const existing = document.getElementById("perk-activation-banner");
 if (existing) existing.remove();

 const el = document.createElement("div");
 el.id = "perk-activation-banner";
 el.innerHTML = `
 <div style="font-size:0.85rem; font-weight:900; color:#00f0ff;">✨ ${title} ✨</div>
 <div style="font-size:0.7rem; color:#ffffff; margin-top:2px;">${perkDetail}</div>
 `;

 el.style.position = "absolute";
 el.style.top = "180px";
 el.style.left = "50%";
 el.style.transform = "translateX(-50%) scale(0.8)";
 el.style.background = "rgba(18, 18, 20, 0.95)";
 el.style.border = "2px solid #00f0ff";
 el.style.borderRadius = "10px";
 el.style.padding = "10px 16px";
 el.style.zIndex = "999999";
 el.style.boxShadow = "0 0 20px rgba(0, 240, 255, 0.6)";
 el.style.pointerEvents = "none";
 el.style.textAlign = "center";
 el.style.whiteSpace = "nowrap";
 el.style.transition = "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
 el.style.opacity = "0";

 const container = document.querySelector(".container");
 if (container) container.appendChild(el);

 requestAnimationFrame(() => {
 el.style.opacity = "1";
 el.style.transform = "translateX(-50%) scale(1)";
 });

 setTimeout(() => {
 el.style.opacity = "0";
 el.style.transform = "translateX(-50%) scale(0.8)";
 setTimeout(() => el.remove(), 300);
 }, 2500);
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