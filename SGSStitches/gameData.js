const GAME_DATA = {
  // Base Starting Values
  baseSPM: 1,

  // --- CRAFTABLES ---
  // [Stitch Cost]
  craftables: {
    coaster:   { name: "Rope Coaster",       cost: 50,    craftTime: 10 },   // 30 seconds
    stdBowl:   { name: "Standard Rope Bowl", cost: 200,   craftTime: 30 },   // 1 minute
    rainbowl:  { name: "Rainbowl Rope Bowl", cost: 1000,  craftTime: 300 },  // 5 minutes
    largeBowl: { name: "Large Rope Bowl",    cost: 5000,  craftTime: 900 },  // 15 minutes
    fabric:    { name: "Fabric",             cost: 20000, craftTime: 1800 }  // 30 minutes
  },

  // --- SHOP (MACHINES & POWER-UPS) ---
  // [SPM Boost, Standard Bowl Cost, Cap Rule]
  shopItems: {
    stdMachine:   { name: "Standard Machine",    spm: 1,  cost: 1,  cap: null },
    hdMachine:    { name: "Heavy Duty Machine",  spm: 5,  cost: 5,  cap: null },
    comMachine:   { name: "Commercial Machine",  spm: 20, cost: 20, cap: null },
    bobbinWinder: { name: "Auto Bobbin Winder", spm: 2,  cost: 30,  cap: "machinesOwned" },
    Threadtower:  { name: "Thread Tower", spm:2, cost: 30, cap: "machinesOwned"}
  },

// --- NOTIONS ---
  // Craft index: [0: Coaster, 1: Std Bowl, 2: Rainbowl, 3: Large Bowl, 4: Fabric]
  // Bonus: [0: click multiplier, 1: cheaper crafting %, 2: shorter craft time %, 3: cheaper shop %, 4: timed SPM boost]
  
  notions: {
    thimble: {
      name: "Thimble",
      bronze: { spm: 1, cost: [50, 5, 1, 0, 1] },                       // No bonus on Bronze
      silver: { spm: 2, bonus: [0, 5.0],  cost: [15, 8, 5, 0, 2] },     // +500% Click (5x)
      gold:   { spm: 4, bonus: [0, 10.0], cost: [40, 20, 4, 1, 0] }     // +1000% Click (10x)
    },

    shears: {
      name: "Fabric Shears",
      bronze: { spm: 2, cost: [100, 10, 2, 1, 0] },                     // No bonus on Bronze
      silver: { spm: 5,  bonus: [2, 0.25], cost: [250, 50, 10, 5, 0] }, // 25% faster crafting
      gold:   { spm: 10, bonus: [2, 0.50], cost: [500, 150, 20, 10, 0] } // 50% faster crafting
    }
  }
};