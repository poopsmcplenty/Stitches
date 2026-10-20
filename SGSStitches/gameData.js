const GAME_DATA = {
  // Base Starting Values
  baseSPM: 1,

  // --- CRAFTABLES ---
  // [Stitch Cost, Craft Time, Category]
  craftables: {
    coaster:    { name: "Coaster",     cost: 50,    craftTime: 10,   category: "rope" },
    stdBowl:    { name: "Rope Bowl",   cost: 200,   craftTime: 30,   category: "rope" },
    rainbowl:   { name: "Rainbowl",    cost: 1000,  craftTime: 300,  category: "rope" },
    largeBowl:  { name: "Rope Basket", cost: 5000,  craftTime: 900,  category: "rope" },
    fabric:     { name: "Fabric",      cost: 20000, craftTime: 1800, category: "fabric" }
  },

  // --- SHOP (MACHINES & POWER-UP single use items) ---
  // [SPM Boost, Standard Bowl Cost, Cap Rule]
  shopItems: {
    stdMachine:   { name: "Standard Machine",    spm: 1,  cost: 1,  cap: null },
    hdMachine:    { name: "Heavy Duty Machine",  spm: 5,  cost: 5,  cap: null },
    comMachine:   { name: "Commercial Machine",  spm: 20, cost: 20, cap: null },
    bobbinWinder: { name: "Bobbin Winder",       spm: 2,  cost: 30, cap: "machinesOwned" },
    Threadtower:  { name: "Thread Tower",        spm:2,   cost: 30, cap: "machinesOwned"}
  },

  // --- DECOR ---
  // Craft index: [0: Coaster, 1: Std Bowl, 2: Rainbowl, 3: Large Bowl, 4: Fabric]
  // [Name, Cost, Craft Time, Category, Image, scale]
  decor: {
    sewingWallpaper: { name: "Sewing Wallpaper", cost: [5, 2, 0, 0, 0], craftTime: 1200, category: "decor", image: "images/wallpaper_sewing.png" },
    daisyWallpaper: { name: "Daisy Wallpaper", cost: [5, 2, 0, 0, 0], craftTime: 1200, category: "decor", image: "images/wallpaper_daisy.png" },
    sunsetWallpaper: { name: "Sunset Wallpaper", cost: [5, 2, 0, 0, 0], craftTime: 1200, category: "decor", image: "images/wallpaper_sunset.png" },
    yarnballButton: { name: "Yarn Ball Button", cost: [5, 2, 0, 0, 0], craftTime: 1200, category: "buttons", image: "images/buttons_yarnball.png", scale: 1.4}
  },

 

// --- NOTIONS ---
  // Craft index: [0: Coaster, 1: Std Bowl, 2: Rainbowl, 3: Large Bowl, 4: Fabric]
  // Bonus: [0: click multiplier, 1: cheaper crafting %, 2: shorter craft time %, 3: cheaper shop %, 4: timed SPM boost]
  // Timed: [ time, cooldown time]
  notions: {
    thimble: {
      name: "Thimble", Timed: [0,0], Description: "Power up your clicker finger!",
      bronze: { spm: 1, bonus: [0, 2.0],  cost: [10, 5, 2, 0, 0] },     // +200% Click (2X)
      silver: { spm: 2, bonus: [0, 5.0],  cost: [20, 10, 5, 0, 0] },     // +500% Click (5x)
      gold:   { spm: 4, bonus: [0, 10.0], cost: [40, 15, 10, 0, 0] }     // +1000% Click (10x)
    },

    shears: {
      name: "Fabric Shears", Timed: [0,0], Description: "Snip your shop costs!",
      bronze: { spm: 2,  bonus: [3, 0.05], cost: [50, 10, 4, 2, 0] },   // 5% cheaper shop
      silver: { spm: 5,  bonus: [3, 0.10], cost: [100, 20, 8, 5, 0] },  // 10% cheaper shop
      gold:   { spm: 10, bonus: [3, 0.15], cost: [200, 30, 16, 10, 0] }  // 15% cheaper shop
    },

    Needles: {
      name: "Ultra Needle", Timed: [600, 5400], Description: "Ultra Needle will boost your crafting, but tire quickly!",
      bronze: { spm: 10,  bonus: [2, 0.25], cost: [500, 50, 40, 10, 1] },   // 25% faster crafting
      silver: { spm: 25,  bonus: [2, 0.50], cost: [750, 75, 60, 20, 2] },   // 50% faster crafting
      gold:   { spm: 50,  bonus: [2, 0.75], cost: [1000, 150, 80, 40, 3] }  // 75% faster crafting
    },

    Bobbin: {
      name: "Super Bobbin", Timed: [900, 6000], Description: "The Super Bobbin boosts your spin speed, but overheats!",
      bronze: { spm: 10,  bonus: [1, 0.25], cost: [500, 50, 40, 10, 1] },   // 15% cheaper crafting
      silver: { spm: 25, bonus: [1, 0.50], cost: [750, 75, 60, 20, 2] },    // 30% cheaper crafting
      gold:   { spm: 50, bonus: [1, 0.75], cost: [1000, 150, 80, 40, 3] }   // 75% cheaper crafting
    }
}
};