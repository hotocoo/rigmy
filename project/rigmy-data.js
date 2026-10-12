// RigMY prototype data + business logic. ALL prices, stock, offers and retailers are illustrative prototype content.
(function () {
  const REGIONS = [
    { id: 'kv', name: 'Klang Valley', short: 'KV' },
    { id: 'pen', name: 'Penang', short: 'PNG' },
    { id: 'jhr', name: 'Johor', short: 'JHR' },
    { id: 'east', name: 'Sabah & Sarawak', short: 'E. MY' },
  ];
  const ETA_RANK = { 'Same day': 0, 'Next day': 1, '1–2 days': 2, '2–3 days': 3, '3–5 days': 4, '5–7 days': 5 };
  const RETAILERS = [
    { id: 'lowyat', name: 'Lowyat Circuit', city: 'Kuala Lumpur', rating: 4.8, reviews: 3120, pickup: 'Pickup · Bukit Bintang', del: { kv: [0, 'Same day'], pen: [15, '2–3 days'], jhr: [15, '2–3 days'], east: [45, '5–7 days'] }, pay: '0% instalment · 12 mo' },
    { id: 'kompu', name: 'Kompu Prima', city: 'Petaling Jaya', rating: 4.7, reviews: 2210, pickup: 'Pickup · SS2', del: { kv: [0, 'Next day'], pen: [12, '2–3 days'], jhr: [12, '2–3 days'], east: [40, '5–7 days'] }, pay: '0% instalment · 6 mo' },
    { id: 'pulau', name: 'Silicon Pulau', city: 'George Town', rating: 4.6, reviews: 980, pickup: 'Pickup · Bayan Lepas', del: { kv: [12, '1–2 days'], pen: [0, 'Same day'], jhr: [18, '2–3 days'], east: [42, '5–7 days'] }, pay: 'FPX · card' },
    { id: 'rigbay', name: 'RigBay JB', city: 'Johor Bahru', rating: 4.5, reviews: 640, pickup: 'Pickup · Skudai', del: { kv: [12, '1–2 days'], pen: [18, '2–3 days'], jhr: [0, 'Same day'], east: [45, '5–7 days'] }, pay: 'FPX · BNPL' },
    { id: 'borneo', name: 'Borneo Byte', city: 'Kota Kinabalu', rating: 4.7, reviews: 1150, pickup: 'Pickup · Lintas', del: { kv: [35, '3–5 days'], pen: [35, '3–5 days'], jhr: [35, '3–5 days'], east: [0, 'Next day'] }, pay: '0% instalment · 12 mo' },
    { id: 'nexus', name: 'Nexus Komputer', city: 'Shah Alam · online', rating: 4.4, reviews: 4870, pickup: 'Online only', del: { kv: [0, '2–3 days'], pen: [0, '3–5 days'], jhr: [0, '3–5 days'], east: [38, '5–7 days'] }, pay: 'FPX · card · BNPL' },
  ];
  const CATS = [
    { id: 'cpu', label: 'CPU', long: 'Processor', idx: '01' },
    { id: 'cooler', label: 'Cooler', long: 'CPU cooler', idx: '02' },
    { id: 'mobo', label: 'Motherboard', long: 'Motherboard', idx: '03' },
    { id: 'ram', label: 'Memory', long: 'Memory', idx: '04' },
    { id: 'ssd', label: 'Storage', long: 'Storage', idx: '05' },
    { id: 'gpu', label: 'Graphics', long: 'Graphics card', idx: '06' },
    { id: 'case', label: 'Case', long: 'Case', idx: '07' },
    { id: 'psu', label: 'Power', long: 'Power supply', idx: '08' },
  ];
  const P = (o) => o;
  const PRODUCTS = [
    // CPU
    P({ id: 'cpu-9800x3d', cat: 'cpu', brand: 'AMD', name: 'AMD Ryzen 7 9800X3D', glyph: '9800X3D', price: 2249, socket: 'AM5', tdp: 120, facet: 'AM5', warrantyY: 3, specs: { cores: 8, threads: 16, boost: 5.2, l3: 96, tdp: 120, socket: 'AM5', igpu: 'Radeon 2 CU' }, perf: 100 }),
    P({ id: 'cpu-9950x3d', cat: 'cpu', brand: 'AMD', name: 'AMD Ryzen 9 9950X3D', glyph: '9950X3D', price: 3499, socket: 'AM5', tdp: 170, facet: 'AM5', warrantyY: 3, specs: { cores: 16, threads: 32, boost: 5.7, l3: 128, tdp: 170, socket: 'AM5', igpu: 'Radeon 2 CU' }, perf: 98 }),
    P({ id: 'cpu-9600x', cat: 'cpu', brand: 'AMD', name: 'AMD Ryzen 5 9600X', glyph: '9600X', price: 949, socket: 'AM5', tdp: 65, facet: 'AM5', warrantyY: 3, specs: { cores: 6, threads: 12, boost: 5.4, l3: 32, tdp: 65, socket: 'AM5', igpu: 'Radeon 2 CU' }, perf: 78 }),
    P({ id: 'cpu-265k', cat: 'cpu', brand: 'Intel', name: 'Intel Core Ultra 7 265K', glyph: '265K', price: 1649, socket: 'LGA1851', tdp: 125, facet: 'LGA1851', warrantyY: 3, specs: { cores: 20, threads: 20, boost: 5.5, l3: 30, tdp: 125, socket: 'LGA1851', igpu: 'Intel Graphics 4 Xe' }, perf: 84 }),
    P({ id: 'cpu-245k', cat: 'cpu', brand: 'Intel', name: 'Intel Core Ultra 5 245K', glyph: '245K', price: 1199, socket: 'LGA1851', tdp: 125, facet: 'LGA1851', warrantyY: 3, specs: { cores: 14, threads: 14, boost: 5.2, l3: 24, tdp: 125, socket: 'LGA1851', igpu: 'Intel Graphics 4 Xe' }, perf: 76 }),
    // Coolers
    P({ id: 'cool-kraken360', cat: 'cooler', brand: 'NZXT', name: 'NZXT Kraken Elite 360 RGB', glyph: '360 LCD', price: 1199, ctype: 'aio', rad: 360, maxTdp: 280, facet: 'Liquid', warrantyY: 6, specs: { type: '360 mm AIO', rad: 360, fans: '3 × 120 mm', noise: 32, display: '2.36" LCD' }, vis: { type: 'aio' } }),
    P({ id: 'cool-lf3', cat: 'cooler', brand: 'Arctic', name: 'Arctic Liquid Freezer III Pro 360', glyph: 'LF III 360', price: 459, ctype: 'aio', rad: 360, maxTdp: 300, facet: 'Liquid', warrantyY: 6, specs: { type: '360 mm AIO', rad: 360, fans: '3 × 120 mm', noise: 31, display: '—' }, vis: { type: 'aio' } }),
    P({ id: 'cool-kraken240w', cat: 'cooler', brand: 'NZXT', name: 'NZXT Kraken 240 RGB White', glyph: '240 W', price: 549, ctype: 'aio', rad: 240, maxTdp: 200, facet: 'Liquid', warrantyY: 6, specs: { type: '240 mm AIO', rad: 240, fans: '2 × 120 mm', noise: 30, display: '—' }, vis: { type: 'aio', color: 'white' } }),
    P({ id: 'cool-pa120', cat: 'cooler', brand: 'Thermalright', name: 'Thermalright Peerless Assassin 120 SE', glyph: 'PA120', price: 169, ctype: 'air', height: 155, maxTdp: 150, facet: 'Air', warrantyY: 3, specs: { type: 'Dual-tower air', height: 155, fans: '2 × 120 mm', noise: 26, display: '—' }, vis: { type: 'air', height: 0.155 } }),
    P({ id: 'cool-nhd15', cat: 'cooler', brand: 'Noctua', name: 'Noctua NH-D15 G2', glyph: 'NH-D15', price: 699, ctype: 'air', height: 168, maxTdp: 220, facet: 'Air', warrantyY: 6, specs: { type: 'Dual-tower air', height: 168, fans: '2 × 140 mm', noise: 25, display: '—' }, vis: { type: 'air', height: 0.168 } }),
    // Motherboards
    P({ id: 'mb-b850f', cat: 'mobo', brand: 'ASUS', name: 'ASUS ROG Strix B850-F Gaming WiFi', glyph: 'B850-F', price: 1299, socket: 'AM5', ff: 'ATX', mem: 'DDR5', facet: 'AM5', warrantyY: 3, specs: { socket: 'AM5', ff: 'ATX', chipset: 'B850', mem: 'DDR5 · 4 slots', m2: 4, wifi: 'Wi-Fi 7' }, vis: { ff: 'atx' } }),
    P({ id: 'mb-x870tom', cat: 'mobo', brand: 'MSI', name: 'MSI MAG X870 Tomahawk WiFi', glyph: 'X870', price: 1349, socket: 'AM5', ff: 'ATX', mem: 'DDR5', facet: 'AM5', warrantyY: 3, specs: { socket: 'AM5', ff: 'ATX', chipset: 'X870', mem: 'DDR5 · 4 slots', m2: 4, wifi: 'Wi-Fi 7' }, vis: { ff: 'atx' } }),
    P({ id: 'mb-b650m', cat: 'mobo', brand: 'Gigabyte', name: 'Gigabyte B650M Aorus Elite AX', glyph: 'B650M', price: 749, socket: 'AM5', ff: 'mATX', mem: 'DDR5', facet: 'AM5', warrantyY: 3, specs: { socket: 'AM5', ff: 'Micro-ATX', chipset: 'B650', mem: 'DDR5 · 4 slots', m2: 2, wifi: 'Wi-Fi 6E' }, vis: { ff: 'matx' } }),
    P({ id: 'mb-z890', cat: 'mobo', brand: 'ASUS', name: 'ASUS TUF Gaming Z890-Plus WiFi', glyph: 'Z890', price: 1249, socket: 'LGA1851', ff: 'ATX', mem: 'DDR5', facet: 'LGA1851', warrantyY: 3, specs: { socket: 'LGA1851', ff: 'ATX', chipset: 'Z890', mem: 'DDR5 · 4 slots', m2: 4, wifi: 'Wi-Fi 7' }, vis: { ff: 'atx' } }),
    P({ id: 'mb-b860m', cat: 'mobo', brand: 'MSI', name: 'MSI MAG B860M Mortar WiFi', glyph: 'B860M', price: 799, socket: 'LGA1851', ff: 'mATX', mem: 'DDR5', facet: 'LGA1851', warrantyY: 3, specs: { socket: 'LGA1851', ff: 'Micro-ATX', chipset: 'B860', mem: 'DDR5 · 4 slots', m2: 3, wifi: 'Wi-Fi 6E' }, vis: { ff: 'matx' } }),
    // Memory
    P({ id: 'ram-tz5', cat: 'ram', brand: 'G.Skill', name: 'G.Skill Trident Z5 Neo RGB 32GB (2×16) DDR5-6000 CL30', glyph: '32GB', price: 899, mem: 'DDR5', facet: '32 GB', warrantyY: 99, specs: { cap: 32, kit: '2 × 16 GB', speed: 6000, cl: 30, type: 'DDR5', expo: 'EXPO' }, vis: {} }),
    P({ id: 'ram-fury', cat: 'ram', brand: 'Kingston', name: 'Kingston Fury Beast RGB 32GB (2×16) DDR5-6000 CL36', glyph: '32GB', price: 749, mem: 'DDR5', facet: '32 GB', warrantyY: 99, specs: { cap: 32, kit: '2 × 16 GB', speed: 6000, cl: 36, type: 'DDR5', expo: 'EXPO / XMP' }, vis: {} }),
    P({ id: 'ram-veng64', cat: 'ram', brand: 'Corsair', name: 'Corsair Vengeance RGB 64GB (2×32) DDR5-6000 CL30', glyph: '64GB', price: 1799, mem: 'DDR5', facet: '64 GB', warrantyY: 99, specs: { cap: 64, kit: '2 × 32 GB', speed: 6000, cl: 30, type: 'DDR5', expo: 'XMP' }, vis: {} }),
    P({ id: 'ram-deltaw', cat: 'ram', brand: 'TeamGroup', name: 'T-Force Delta RGB 32GB (2×16) DDR5-6400 White', glyph: '32GB W', price: 859, mem: 'DDR5', facet: '32 GB', warrantyY: 99, specs: { cap: 32, kit: '2 × 16 GB', speed: 6400, cl: 32, type: 'DDR5', expo: 'XMP' }, vis: { color: 'white' } }),
    // Storage
    P({ id: 'ssd-990', cat: 'ssd', brand: 'Samsung', name: 'Samsung 990 Pro 2TB NVMe', glyph: '990 PRO', price: 899, facet: 'PCIe 4.0', warrantyY: 5, specs: { cap: '2 TB', iface: 'PCIe 4.0 ×4', read: 7450, write: 6900, tbw: 1200 }, vis: {} }),
    P({ id: 'ssd-sn850x', cat: 'ssd', brand: 'WD', name: 'WD_Black SN850X 2TB NVMe', glyph: 'SN850X', price: 829, facet: 'PCIe 4.0', warrantyY: 5, specs: { cap: '2 TB', iface: 'PCIe 4.0 ×4', read: 7300, write: 6600, tbw: 1200 }, vis: {} }),
    P({ id: 'ssd-t705', cat: 'ssd', brand: 'Crucial', name: 'Crucial T705 2TB Gen5 NVMe', glyph: 'T705', price: 1399, facet: 'PCIe 5.0', warrantyY: 5, specs: { cap: '2 TB', iface: 'PCIe 5.0 ×4', read: 14500, write: 12700, tbw: 1200 }, vis: {} }),
    P({ id: 'ssd-nm790', cat: 'ssd', brand: 'Lexar', name: 'Lexar NM790 2TB NVMe', glyph: 'NM790', price: 599, facet: 'PCIe 4.0', warrantyY: 5, specs: { cap: '2 TB', iface: 'PCIe 4.0 ×4', read: 7400, write: 6500, tbw: 1500 }, vis: {} }),
    // GPUs
    P({ id: 'gpu-5070', cat: 'gpu', brand: 'MSI', name: 'MSI GeForce RTX 5070 Ventus 2X OC 12GB', glyph: '5070', short: 'RTX 5070', price: 2899, length: 242, tgp: 250, facet: '12 GB', warrantyY: 3, specs: { vram: 12, mem: 'GDDR7', boost: 2557, tgp: 250, length: 242, slots: 2, conn: '1 × 16-pin' }, perf: 58, vis: { L: 0.242, T: 0.052, H: 0.124, fans: 2 } }),
    P({ id: 'gpu-5070ti', cat: 'gpu', brand: 'Gigabyte', name: 'Gigabyte GeForce RTX 5070 Ti Windforce OC 16GB', glyph: '5070 Ti', short: 'RTX 5070 Ti', price: 4099, length: 304, tgp: 300, facet: '16 GB', warrantyY: 3, specs: { vram: 16, mem: 'GDDR7', boost: 2588, tgp: 300, length: 304, slots: 2.5, conn: '1 × 16-pin' }, perf: 74, vis: { L: 0.304, T: 0.058, H: 0.126, fans: 3 } }),
    P({ id: 'gpu-5080', cat: 'gpu', brand: 'ASUS', name: 'ASUS TUF Gaming GeForce RTX 5080 16GB', glyph: '5080', short: 'RTX 5080', price: 5999, length: 348, tgp: 360, facet: '16 GB', warrantyY: 3, specs: { vram: 16, mem: 'GDDR7', boost: 2730, tgp: 360, length: 348, slots: 3.6, conn: '1 × 16-pin' }, perf: 86, vis: { L: 0.348, T: 0.072, H: 0.14, fans: 3 } }),
    P({ id: 'gpu-5090', cat: 'gpu', brand: 'ASUS', name: 'ASUS ROG Astral GeForce RTX 5090 32GB', glyph: '5090', short: 'RTX 5090', price: 13499, length: 358, tgp: 575, facet: '32 GB', warrantyY: 3, specs: { vram: 32, mem: 'GDDR7', boost: 2610, tgp: 575, length: 358, slots: 3.8, conn: '1 × 16-pin' }, perf: 100, vis: { L: 0.358, T: 0.076, H: 0.15, fans: 4, rgb: true } }),
    P({ id: 'gpu-9070xt', cat: 'gpu', brand: 'Sapphire', name: 'Sapphire Pure Radeon RX 9070 XT 16GB', glyph: '9070 XT', short: 'RX 9070 XT', price: 3299, length: 320, tgp: 304, facet: '16 GB', warrantyY: 2, specs: { vram: 16, mem: 'GDDR6', boost: 2970, tgp: 304, length: 320, slots: 3, conn: '2 × 8-pin' }, perf: 72, vis: { L: 0.32, T: 0.064, H: 0.132, fans: 3, color: 'white' } }),
    // Cases
    P({ id: 'case-903', cat: 'case', brand: 'Montech', name: 'Montech Air 903 Max', glyph: 'AIR 903', short: 'Air 903 Max', price: 399, ffs: ['ATX', 'mATX'], maxGpu: 400, maxCooler: 180, radTop: 360, facet: 'Mid tower', warrantyY: 1, specs: { type: 'Mid tower · mesh', ffs: 'E-ATX, ATX, mATX', maxGpu: 400, maxCooler: 180, radTop: '360 mm', fans: '4 × 140 mm incl.' }, vis: { style: 'mesh', color: 'black', w: 0.235, h: 0.49, d: 0.46 } }),
    P({ id: 'case-o11vc', cat: 'case', brand: 'Lian Li', name: 'Lian Li O11 Vision Compact', glyph: 'O11 VC', short: 'O11 Vision C', price: 549, ffs: ['ATX', 'mATX'], maxGpu: 380, maxCooler: 167, radTop: 360, facet: 'Mid tower', warrantyY: 1, specs: { type: 'Mid tower · panoramic glass', ffs: 'ATX, mATX', maxGpu: 380, maxCooler: 167, radTop: '360 mm', fans: 'None incl.' }, vis: { style: 'glass', color: 'black', w: 0.25, h: 0.47, d: 0.47 } }),
    P({ id: 'case-popmini', cat: 'case', brand: 'Fractal', name: 'Fractal Design Pop Mini Air White', glyph: 'POP MINI', short: 'Pop Mini Air', price: 349, ffs: ['mATX'], maxGpu: 335, maxCooler: 170, radTop: 240, facet: 'Micro tower', warrantyY: 2, specs: { type: 'Micro tower · mesh', ffs: 'mATX, Mini-ITX', maxGpu: 335, maxCooler: 170, radTop: '240 mm', fans: '3 × 120 mm incl.' }, vis: { style: 'mesh', color: 'white', w: 0.215, h: 0.465, d: 0.4 } }),
    // PSU
    P({ id: 'psu-a750', cat: 'psu', brand: 'MSI', name: 'MSI MAG A750GL PCIE5 750W', glyph: '750W', price: 389, watt: 750, facet: '750 W', warrantyY: 7, specs: { watt: 750, eff: '80+ Gold', std: 'ATX 3.1', mod: 'Fully modular', fan: '120 mm' }, vis: {} }),
    P({ id: 'psu-rm850e', cat: 'psu', brand: 'Corsair', name: 'Corsair RM850e (2025) 850W', glyph: '850W', price: 529, watt: 850, facet: '850 W', warrantyY: 7, specs: { watt: 850, eff: '80+ Gold', std: 'ATX 3.1', mod: 'Fully modular', fan: '120 mm' }, vis: {} }),
    P({ id: 'psu-gx1000', cat: 'psu', brand: 'Seasonic', name: 'Seasonic Focus GX-1000 ATX 3.1', glyph: '1000W', price: 799, watt: 1000, facet: '1000 W', warrantyY: 10, specs: { watt: 1000, eff: '80+ Gold', std: 'ATX 3.1', mod: 'Fully modular', fan: '135 mm' }, vis: {} }),
    P({ id: 'psu-hx1500', cat: 'psu', brand: 'Corsair', name: 'Corsair HX1500i 1500W', glyph: '1500W', price: 1699, watt: 1500, facet: '1500 W', warrantyY: 10, specs: { watt: 1500, eff: '80+ Platinum', std: 'ATX 3.1', mod: 'Fully modular', fan: '140 mm' }, vis: {} }),
  ];
  PRODUCTS.forEach(p => { if (!p.vis) p.vis = {}; });
  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

  const SPECDEF = {
    cpu: [['cores', 'Cores', '', 'high'], ['threads', 'Threads', '', 'high'], ['boost', 'Max boost', 'GHz', 'high'], ['l3', 'L3 cache', 'MB', 'high'], ['tdp', 'TDP', 'W', 'low'], ['socket', 'Socket'], ['igpu', 'Integrated graphics']],
    cooler: [['type', 'Type'], ['rad', 'Radiator', 'mm'], ['height', 'Height', 'mm', 'low'], ['fans', 'Fans'], ['noise', 'Noise (max)', 'dBA', 'low'], ['display', 'Display']],
    mobo: [['socket', 'Socket'], ['ff', 'Form factor'], ['chipset', 'Chipset'], ['mem', 'Memory'], ['m2', 'M.2 slots', '', 'high'], ['wifi', 'Wireless']],
    ram: [['cap', 'Capacity', 'GB', 'high'], ['kit', 'Kit'], ['speed', 'Speed', 'MT/s', 'high'], ['cl', 'CAS latency', 'CL', 'low'], ['type', 'Type'], ['expo', 'Profile']],
    ssd: [['cap', 'Capacity'], ['iface', 'Interface'], ['read', 'Seq. read', 'MB/s', 'high'], ['write', 'Seq. write', 'MB/s', 'high'], ['tbw', 'Endurance', 'TBW', 'high']],
    gpu: [['vram', 'Memory', 'GB', 'high'], ['mem', 'Memory type'], ['boost', 'Boost clock', 'MHz', 'high'], ['tgp', 'Board power', 'W', 'low'], ['length', 'Length', 'mm', 'low'], ['slots', 'Thickness', 'slots', 'low'], ['conn', 'Power connector']],
    case: [['type', 'Type'], ['ffs', 'Motherboards'], ['maxGpu', 'Max GPU length', 'mm', 'high'], ['maxCooler', 'Max cooler height', 'mm', 'high'], ['radTop', 'Top radiator'], ['fans', 'Included fans']],
    psu: [['watt', 'Wattage', 'W', 'high'], ['eff', 'Efficiency'], ['std', 'Standard'], ['mod', 'Cabling'], ['fan', 'Fan']],
  };
  const FACET = { cpu: 'Socket', cooler: 'Type', mobo: 'Socket', ram: 'Capacity', ssd: 'Interface', gpu: 'Memory', case: 'Size', psu: 'Wattage' };

  // deterministic pseudo-random
  function h(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return ((x >>> 0) % 10000) / 10000; }
  const STOCK = ['In stock', 'In stock', 'In stock', 'In stock', 'In stock', 'Low stock', 'Low stock', 'Pre-order', 'Out of stock'];
  function offers(p, region) {
    region = region || 'kv';
    return RETAILERS.map((r, i) => {
      const k = h(p.id + r.id);
      const varr = -0.035 + k * 0.095;
      let price = Math.round(p.price * (1 + varr) / 10) * 10 - 1;
      if (price < 50) price = p.price;
      let stock = STOCK[Math.floor(h(r.id + p.id + 's') * STOCK.length)];
      if (region === 'east' && r.id !== 'borneo' && (p.cat === 'case' || p.cat === 'psu') && k > 0.55) stock = 'No East MY shipping';
      const d = r.del[region];
      const big = p.cat === 'case' ? 2 : 1;
      let fee = d[0] * big;
      if (r.id === 'nexus' && region !== 'east') fee = 0;
      const warranty = (p.warrantyY >= 99 ? 'Lifetime' : p.warrantyY + ' yr' + (p.warrantyY > 1 ? 's' : '')) + (r.id === 'nexus' ? ' · ship-in' : r.id === 'lowyat' || r.id === 'kompu' ? ' · walk-in' : ' · distributor');
      const avail = stock !== 'Out of stock' && stock !== 'No East MY shipping';
      return { rid: r.id, retailer: r, price, stock, avail, fee, eta: stock === 'Pre-order' ? '5–7 days' : d[1], warranty, left: stock === 'Low stock' ? 1 + Math.floor(k * 4) : null };
    });
  }
  function lowest(p, region) { const o = offers(p, region).filter(x => x.avail); if (!o.length) return null; return o.reduce((a, b) => (b.price < a.price ? b : a)); }
  function history(p) { const pts = []; let v = p.price * (1.07 + h(p.id + 'h') * 0.05); for (let i = 0; i < 12; i++) { v = v * (0.985 + h(p.id + i) * 0.022); pts.push(Math.round(v)); } pts[11] = lowest(p, 'kv') ? lowest(p, 'kv').price : p.price; return pts; }

  function power(b) {
    const cpu = byId[b.cpu], gpu = byId[b.gpu];
    const est = (cpu ? cpu.tdp : 0) + (gpu ? gpu.tgp : 0) + 95;
    const rec = Math.ceil(est * 1.3 / 50) * 50;
    return { est, rec, psu: b.psu ? byId[b.psu].watt : 0 };
  }
  function cheapest(filter) { return PRODUCTS.filter(filter).sort((a, b) => a.price - b.price)[0]; }
  function compat(b) {
    const g = c => (b[c] ? byId[b[c]] : null);
    const cpu = g('cpu'), mobo = g('mobo'), ram = g('ram'), gpu = g('gpu'), cs = g('case'), psu = g('psu'), cool = g('cooler');
    const out = [];
    const add = (o) => out.push(Object.assign({ status: 'ok', parts: [], fix: null }, o));
    if (cpu && mobo) {
      const ok = cpu.socket === mobo.socket;
      const fx = ok ? null : cheapest(p => p.cat === 'mobo' && p.socket === cpu.socket && (!cs || cs.ffs.includes(p.ff)));
      add({ id: 'socket', label: 'CPU socket', value: ok ? cpu.socket + ' = ' + mobo.socket : cpu.socket + ' ≠ ' + mobo.socket, status: ok ? 'ok' : 'error', parts: ok ? [] : ['cpu', 'mobo'], detail: ok ? 'The ' + cpu.glyph + ' drops straight into the ' + mobo.glyph + ' socket.' : 'The ' + cpu.name + ' needs an ' + cpu.socket + ' board. The ' + mobo.glyph + ' is ' + mobo.socket + ', so the CPU will not physically fit.', fix: fx ? { cat: 'mobo', id: fx.id, text: 'Use ' + fx.name } : null });
    } else add({ id: 'socket', label: 'CPU socket', value: 'Waiting', status: 'pending', detail: 'Add a CPU and a motherboard to check the socket.' });
    if (ram && mobo) add({ id: 'mem', label: 'Memory type', value: ram.mem + ' = ' + mobo.mem, status: 'ok', detail: 'DDR5 kit on a DDR5 board. Enable ' + ram.specs.expo + ' in BIOS for ' + ram.specs.speed + ' MT/s.' });
    else add({ id: 'mem', label: 'Memory type', value: 'Waiting', status: 'pending', detail: 'Add memory and a motherboard.' });
    if (mobo && cs) {
      const ok = cs.ffs.includes(mobo.ff);
      const fx = ok ? null : cheapest(p => p.cat === 'mobo' && p.socket === mobo.socket && cs.ffs.includes(p.ff));
      add({ id: 'ff', label: 'Board form factor', value: ok ? mobo.ff + ' in ' + cs.short : mobo.ff + ' ✕ ' + cs.short, status: ok ? 'ok' : 'error', parts: ok ? [] : ['mobo', 'case'], detail: ok ? 'Standoffs line up for ' + mobo.ff + '.' : 'The ' + cs.name + ' only takes ' + cs.ffs.join(' / ') + ' boards. An ' + mobo.ff + ' board is about 61 mm taller than the tray.', fix: fx ? { cat: 'mobo', id: fx.id, text: 'Use ' + fx.name } : null });
    } else add({ id: 'ff', label: 'Board form factor', value: 'Waiting', status: 'pending', detail: 'Add a motherboard and a case.' });
    if (gpu && cs) {
      const spare = cs.maxGpu - gpu.length;
      const st = spare < 0 ? 'error' : spare < 15 ? 'warn' : 'ok';
      const fx = st === 'error' ? cheapest(p => p.cat === 'case' && p.maxGpu >= gpu.length + 15 && (!mobo || p.ffs.includes(mobo.ff))) : null;
      add({ id: 'gpu', label: 'GPU clearance', value: gpu.length + ' / ' + cs.maxGpu + ' mm', status: st, parts: st === 'ok' ? [] : ['gpu', 'case'], detail: st === 'error' ? 'The ' + gpu.short + ' is ' + gpu.length + ' mm long. The ' + cs.short + ' has ' + cs.maxGpu + ' mm, so the card hits the front fans by ' + (-spare) + ' mm.' : st === 'warn' ? 'Fits with ' + spare + ' mm spare. Front fans and cables will be tight.' : spare + ' mm spare in front of the card.', fix: fx ? { cat: 'case', id: fx.id, text: 'Use ' + fx.name } : null });
    } else add({ id: 'gpu', label: 'GPU clearance', value: 'Waiting', status: 'pending', detail: 'Add a graphics card and a case.' });
    if (cool && cs) {
      let st = 'ok', val, det, fx = null;
      if (cool.ctype === 'aio') { val = cool.rad + ' / ' + cs.radTop + ' mm top'; if (cool.rad > cs.radTop) { st = 'error'; det = 'A ' + cool.rad + ' mm radiator will not mount. The ' + cs.short + ' supports up to ' + cs.radTop + ' mm at the top.'; fx = cheapest(p => p.cat === 'cooler' && ((p.ctype === 'aio' && p.rad <= cs.radTop) || (p.ctype === 'air' && p.height <= cs.maxCooler)) && (!cpu || p.maxTdp >= cpu.tdp)); } else det = cool.rad + ' mm radiator mounts at the top as exhaust.'; }
      else { val = cool.height + ' / ' + cs.maxCooler + ' mm'; if (cool.height > cs.maxCooler) { st = 'error'; det = 'Tower is ' + (cool.height - cs.maxCooler) + ' mm too tall for the side panel.'; } else det = (cs.maxCooler - cool.height) + ' mm between tower and glass.'; }
      add({ id: 'cool', label: 'Cooler fit', value: val, status: st, parts: st === 'ok' ? [] : ['cooler', 'case'], detail: det, fix: fx ? { cat: 'cooler', id: fx.id, text: 'Use ' + fx.name } : null });
    } else add({ id: 'cool', label: 'Cooler fit', value: 'Waiting', status: 'pending', detail: 'Add a cooler and a case.' });
    if (cool && cpu && cool.maxTdp < cpu.tdp) add({ id: 'therm', label: 'Thermal headroom', value: cpu.tdp + ' W on ' + cool.maxTdp + ' W', status: 'warn', parts: ['cooler'], detail: 'The ' + cool.glyph + ' is rated for about ' + cool.maxTdp + ' W. Expect clock drops under long all-core loads.', fix: { cat: 'cooler', id: 'cool-lf3', text: 'Use Arctic Liquid Freezer III Pro 360' } });
    const pw = power(b);
    if (psu) {
      const st = psu.watt < pw.est ? 'error' : psu.watt < pw.rec ? 'warn' : 'ok';
      const fx = st === 'ok' ? null : cheapest(p => p.cat === 'psu' && p.watt >= pw.rec);
      add({ id: 'psu', label: 'Power headroom', value: pw.est + ' W of ' + psu.watt + ' W', status: st, parts: st === 'ok' ? [] : ['psu'], detail: st === 'error' ? 'Estimated load is ' + pw.est + ' W, above the ' + psu.watt + ' W rating.' : st === 'warn' ? 'Works, but leaves little margin for transient GPU spikes. ' + pw.rec + ' W recommended.' : Math.round((1 - pw.est / psu.watt) * 100) + '% headroom at estimated full load.', fix: fx ? { cat: 'psu', id: fx.id, text: 'Use ' + fx.name } : null });
    } else add({ id: 'psu', label: 'Power headroom', value: 'Waiting', status: 'pending', detail: 'Add a power supply.' });
    return out;
  }
  function plan(b, region, picks) {
    picks = picks || {};
    const items = CATS.map(c => b[c.id] ? byId[b[c.id]] : null).filter(Boolean);
    const rows = items.map(p => ({ p, offers: offers(p, region) }));
    const feeOf = (rid) => { const r = RETAILERS.find(x => x.id === rid); return r.id === 'nexus' && region !== 'east' ? 0 : r.del[region][0]; };
    const sumPlan = (choice) => { let s = 0; const shops = new Set(); let missing = 0; rows.forEach(r => { const o = choice[r.p.id]; if (!o) { missing++; return; } s += o.price; shops.add(o.rid); }); let fee = 0; shops.forEach(rid => { fee += feeOf(rid); }); return { parts: s, fee, total: s + fee, shops: shops.size, missing, choice }; };
    const best = {}; rows.forEach(r => { const av = r.offers.filter(o => o.avail); best[r.p.id] = av.length ? av.reduce((a, c) => (c.price < a.price ? c : a)) : null; });
    const fast = {}; rows.forEach(r => { const av = r.offers.filter(o => o.avail); fast[r.p.id] = av.length ? av.sort((a, c) => (ETA_RANK[a.eta] - ETA_RANK[c.eta]) || (a.price - c.price))[0] : null; });
    const shopTotals = RETAILERS.map(rt => { const ch = {}; rows.forEach(r => { const o = r.offers.find(o => o.rid === rt.id); if (o && o.avail) ch[r.p.id] = o; }); return Object.assign({ rid: rt.id, retailer: rt }, sumPlan(ch)); });
    const full = shopTotals.filter(s => s.missing === 0).sort((a, c) => a.total - c.total);
    const single = full[0] || shopTotals.sort((a, c) => a.missing - c.missing || a.total - c.total)[0];
    const custom = {}; rows.forEach(r => { const pk = picks[r.p.id]; custom[r.p.id] = pk ? r.offers.find(o => o.rid === pk && o.avail) || best[r.p.id] : best[r.p.id]; });
    return { rows, best: sumPlan(best), fast: sumPlan(fast), single: Object.assign({}, single, { choice: single.choice }), custom: sumPlan(custom), shopTotals, maxEta: (ch) => Object.values(ch).reduce((m, o) => o && ETA_RANK[o.eta] > ETA_RANK[m] ? o.eta : m, 'Same day') };
  }
  const PRESETS = [
    { id: 'kancil', name: 'Kancil', tier: '1080p esports', note: 'Small white tower, high frame rates in Valorant and CS2.', build: { cpu: 'cpu-9600x', cooler: 'cool-pa120', mobo: 'mb-b650m', ram: 'ram-fury', ssd: 'ssd-nm790', gpu: 'gpu-5070', case: 'case-popmini', psu: 'psu-a750' } },
    { id: 'harimau', name: 'Harimau', tier: '1440p all-rounder', note: 'Panoramic glass, white Radeon, quiet 360 mm loop.', build: { cpu: 'cpu-9800x3d', cooler: 'cool-lf3', mobo: 'mb-x870tom', ram: 'ram-tz5', ssd: 'ssd-sn850x', gpu: 'gpu-9070xt', case: 'case-o11vc', psu: 'psu-rm850e' } },
    { id: 'helang', name: 'Helang', tier: '4K flagship', note: 'The fastest gaming CPU with an RTX 5080 in a high-airflow mesh tower.', build: { cpu: 'cpu-9800x3d', cooler: 'cool-kraken360', mobo: 'mb-b850f', ram: 'ram-tz5', ssd: 'ssd-990', gpu: 'gpu-5080', case: 'case-903', psu: 'psu-rm850e' } },
  ];
  const fmt = (n) => 'RM ' + Math.round(n).toLocaleString('en-MY');

  // ---------- physical stores ----------
  const BRANCHES = [
    { id: 'ly-plaza', rid: 'lowyat', name: 'Plaza Low Yat', addr: 'Lot 3-12, Plaza Low Yat, Jalan Bintang, 55100 Kuala Lumpur', lat: 3.1442, lon: 101.7104, hours: [10, 22], phone: '03-2148 6610', services: ['Walk-in warranty', 'Same-day assembly', 'Trade-in'] },
    { id: 'ly-mvm', rid: 'lowyat', name: 'Mid Valley Megamall', addr: 'Lot S-021, Mid Valley Megamall, 59200 Kuala Lumpur', lat: 3.1176, lon: 101.6774, hours: [10, 22], phone: '03-2287 1402', services: ['Walk-in warranty', 'Display builds'] },
    { id: 'kp-ss2', rid: 'kompu', name: 'SS2 Flagship', addr: '21, Jalan SS 2/67, 47300 Petaling Jaya', lat: 3.1187, lon: 101.6205, hours: [11, 21], phone: '03-7865 2290', services: ['Assembly bench', 'Walk-in warranty', 'Parking'] },
    { id: 'kp-cyber', rid: 'kompu', name: 'Cyberjaya', addr: 'G-08, Shaftsbury Square, 63000 Cyberjaya', lat: 2.9230, lon: 101.6560, hours: [11, 21], phone: '03-8322 0715', services: ['Pickup counter'] },
    { id: 'kp-ipoh', rid: 'kompu', name: 'Ipoh Parade', addr: 'Level 2, Ipoh Parade, Jalan Sultan Abdul Jalil, 30450 Ipoh', lat: 4.5946, lon: 101.0908, hours: [10, 22], phone: '05-241 9930', services: ['Pickup counter', 'Walk-in warranty'] },
    { id: 'sp-bayan', rid: 'pulau', name: 'Bayan Lepas', addr: '1-G, Lebuh Bukit Kecil 6, 11900 Bayan Lepas', lat: 5.3290, lon: 100.2865, hours: [10, 21], phone: '04-642 1188', services: ['Assembly bench', 'Walk-in warranty'] },
    { id: 'sp-komtar', rid: 'pulau', name: 'Komtar', addr: 'Level 3, Komtar, Jalan Penang, 10000 George Town', lat: 5.4145, lon: 100.3297, hours: [10, 22], phone: '04-261 7705', services: ['Pickup counter'] },
    { id: 'sp-sjaya', rid: 'pulau', name: 'Seberang Jaya', addr: 'Sunway Carnival Mall, 13700 Seberang Jaya', lat: 5.3970, lon: 100.3985, hours: [10, 22], phone: '04-397 2240', services: ['Pickup counter', 'Display builds'] },
    { id: 'rb-skudai', rid: 'rigbay', name: 'Skudai', addr: '45, Jalan Hang Tuah 3, Taman Universiti, 81300 Skudai', lat: 1.5405, lon: 103.6296, hours: [11, 21], phone: '07-520 3381', services: ['Assembly bench', 'Walk-in warranty'] },
    { id: 'rb-jbcc', rid: 'rigbay', name: 'JB City Square', addr: 'Level 4, City Square, Jalan Wong Ah Fook, 80000 Johor Bahru', lat: 1.4612, lon: 103.7637, hours: [10, 22], phone: '07-226 0914', services: ['Pickup counter'] },
    { id: 'rb-melaka', rid: 'rigbay', name: 'Melaka Raya', addr: '12, Jalan Melaka Raya 8, 75000 Melaka', lat: 2.1880, lon: 102.2510, hours: [11, 20], phone: '06-288 4410', services: ['Pickup counter'] },
    { id: 'bb-kk', rid: 'borneo', name: 'Lintas, Kota Kinabalu', addr: 'Lot 8, Lintas Square, 88300 Kota Kinabalu', lat: 5.9450, lon: 116.1010, hours: [10, 21], phone: '088-25 7710', services: ['Assembly bench', 'Walk-in warranty'] },
    { id: 'bb-kch', rid: 'borneo', name: 'Kuching', addr: 'Saradise, Jalan Stutong, 93350 Kuching', lat: 1.5110, lon: 110.3545, hours: [10, 21], phone: '082-36 4402', services: ['Pickup counter', 'Walk-in warranty'] },
    { id: 'bb-miri', rid: 'borneo', name: 'Miri', addr: 'Bintang Megamall, 98000 Miri', lat: 4.3955, lon: 113.9890, hours: [10, 22], phone: '085-41 8803', services: ['Pickup counter'] },
    { id: 'nx-wh', rid: 'nexus', name: 'Shah Alam warehouse', addr: 'Lot 5, Jalan Pelabur 23/1, Seksyen 23, 40300 Shah Alam', lat: 3.0405, lon: 101.5390, hours: [9, 18], closedSun: true, phone: '03-5541 2200', services: ['Online orders', 'Collection counter'] },
  ];
  const COURIER = { lowyat: 'Lalamove', kompu: 'J&T Express', pulau: 'Pos Laju', rigbay: 'Ninja Van', borneo: 'GDex', nexus: 'DHL eCommerce' };
  const POSTCODES = { '01': ['Kangar', 6.44, 100.2], '02': ['Kangar', 6.44, 100.2], '05': ['Alor Setar', 6.12, 100.37], '06': ['Alor Setar', 6.12, 100.37], '08': ['Sungai Petani', 5.65, 100.49], '09': ['Kulim', 5.37, 100.56], '10': ['George Town', 5.414, 100.329], '11': ['Bayan Lepas', 5.33, 100.29], '12': ['Butterworth', 5.4, 100.37], '13': ['Seberang Perai', 5.39, 100.4], '14': ['Bukit Mertajam', 5.36, 100.46], '15': ['Kota Bharu', 6.125, 102.238], '16': ['Kota Bharu', 6.125, 102.238], '20': ['Kuala Terengganu', 5.33, 103.14], '21': ['Kuala Terengganu', 5.33, 103.14], '25': ['Kuantan', 3.81, 103.33], '26': ['Kuantan', 3.81, 103.33], '28': ['Temerloh', 3.45, 102.42], '30': ['Ipoh', 4.6, 101.09], '31': ['Ipoh', 4.6, 101.09], '34': ['Taiping', 4.85, 100.74], '35': ['Tapah', 4.2, 101.26], '36': ['Teluk Intan', 4.02, 101.02], '40': ['Shah Alam', 3.073, 101.518], '41': ['Klang', 3.04, 101.45], '42': ['Port Klang', 3.0, 101.39], '43': ['Kajang', 2.99, 101.79], '45': ['Kuala Selangor', 3.34, 101.25], '46': ['Petaling Jaya', 3.1, 101.64], '47': ['Petaling Jaya', 3.107, 101.607], '48': ['Rawang', 3.32, 101.58], '50': ['Kuala Lumpur', 3.147, 101.695], '51': ['Kuala Lumpur', 3.17, 101.69], '52': ['Kepong', 3.21, 101.64], '53': ['Setapak', 3.2, 101.72], '54': ['Kuala Lumpur', 3.16, 101.71], '55': ['Bukit Bintang', 3.14, 101.71], '56': ['Cheras', 3.09, 101.74], '57': ['Bukit Jalil', 3.06, 101.69], '58': ['Old Klang Road', 3.1, 101.67], '59': ['Bangsar', 3.12, 101.67], '60': ['Taman Tun Dr Ismail', 3.14, 101.63], '62': ['Putrajaya', 2.926, 101.696], '63': ['Cyberjaya', 2.922, 101.656], '64': ['Sepang', 2.69, 101.75], '68': ['Ampang', 3.15, 101.76], '70': ['Seremban', 2.726, 101.938], '71': ['Nilai', 2.82, 101.8], '75': ['Melaka', 2.189, 102.25], '76': ['Melaka', 2.22, 102.24], '78': ['Alor Gajah', 2.38, 102.21], '79': ['Iskandar Puteri', 1.43, 103.62], '80': ['Johor Bahru', 1.492, 103.741], '81': ['Skudai', 1.536, 103.66], '83': ['Batu Pahat', 1.85, 102.93], '84': ['Muar', 2.04, 102.57], '86': ['Kluang', 2.03, 103.32], '87': ['Labuan', 5.28, 115.24], '88': ['Kota Kinabalu', 5.98, 116.073], '89': ['Penampang', 5.92, 116.11], '90': ['Sandakan', 5.84, 118.12], '91': ['Tawau', 4.24, 117.89], '93': ['Kuching', 1.553, 110.359], '94': ['Kota Samarahan', 1.46, 110.49], '96': ['Sibu', 2.29, 111.83], '97': ['Bintulu', 3.17, 113.04], '98': ['Miri', 4.399, 113.991] };
  function regionOf(lat, lon) { if (lon > 109) return 'east'; if (lat > 3.9) return 'pen'; if (lat < 2.6) return 'jhr'; return 'kv'; }
  function postcode(pc) { pc = String(pc || '').replace(/\D/g, ''); if (pc.length !== 5) return null; const e = POSTCODES[pc.slice(0, 2)]; if (!e) return null; return { lat: e[1], lon: e[2], label: e[0], postcode: pc, region: regionOf(e[1], e[2]), source: 'postcode', acc: 3000 }; }
  function dist(a, b) { const R = 6371, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lon - a.lon) * t; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  const fmtKm = (k) => k < 1 ? Math.round(k * 1000) + ' m' : k < 20 ? k.toFixed(1) + ' km' : Math.round(k).toLocaleString('en-MY') + ' km';
  function openState(b, now) {
    now = now || new Date(); const hr = now.getHours() + now.getMinutes() / 60, sun = now.getDay() === 0;
    const h12 = (x) => (x % 12 || 12) + (x < 12 || x === 24 ? ' am' : ' pm');
    if (b.closedSun && sun) return { open: false, text: 'Closed today · opens Mon ' + h12(b.hours[0]) };
    if (hr >= b.hours[0] && hr < b.hours[1]) return { open: true, text: 'Open until ' + h12(b.hours[1]), closing: b.hours[1] - hr < 1 };
    return { open: false, text: hr < b.hours[0] ? 'Opens ' + h12(b.hours[0]) : 'Closed · opens ' + h12(b.hours[0]) + ' tomorrow' };
  }
  function branchStock(p, b) {
    const o = offers(p, 'kv').find(x => x.rid === b.rid);
    if (!o || o.stock === 'Out of stock') return { qty: 0, text: 'Out of stock', tone: 'error', price: o ? o.price : null };
    if (o.stock === 'Pre-order') return { qty: 0, text: 'Pre-order', tone: 'info', price: o.price };
    const q = Math.floor(h(p.id + b.id + 'q') * 8);
    if (q === 0) return { qty: 0, text: 'Transfer in 2 days', tone: 'warn', price: o.price };
    return { qty: q, text: q <= 2 ? q + ' left on shelf' : q + ' on shelf', tone: q <= 2 ? 'warn' : 'ok', price: o.price };
  }
  function nearby(loc, p) { return BRANCHES.map(b => Object.assign({ b, r: RETAILERS.find(r => r.id === b.rid), km: loc ? dist(loc, b) : null, st: p ? branchStock(p, b) : null, open: openState(b) })).sort((a, c) => (a.km == null ? 0 : a.km) - (c.km == null ? 0 : c.km)); }

  // ---------- long price history + trends ----------
  const DAY = 864e5;
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const EVDEF = [[1, 11, 11, '11.11'], [1, 12, 12, '12.12'], [0, 2, 17, 'CNY'], [0, 3, 20, 'Raya'], [0, 6, 6, '6.6'], [0, 7, 7, '7.7'], [0, 8, 8, '8.8'], [0, 9, 9, '9.9'], [0, 10, 10, '10.10'], [0, 11, 11, '11.11'], [0, 12, 12, '12.12']];
  function events() { const y = today().getFullYear(), out = []; [y - 1, y, y + 1].forEach(yy => EVDEF.forEach(([_, m, d, l]) => out.push({ t: new Date(yy, m - 1, d).getTime(), label: l }))); const seen = {}; return out.filter(e => { const k = e.t; if (seen[k]) return false; seen[k] = 1; return true; }).sort((a, b) => a.t - b.t); }
  const HC = {};
  function historyLong(p) {
    if (HC[p.id]) return HC[p.id];
    const N = 365, end = today().getTime(), lo = lowest(p, 'kv'), cur = lo ? lo.price : p.price, evs = events();
    const raw = []; let v = 1.09 + h(p.id + 's0') * 0.09;
    for (let i = 0; i < N; i++) {
      const t = end - (N - 1 - i) * DAY;
      v *= 1 - 0.00026 + (h(p.id + 'd' + i) - 0.5) * 0.0055;
      const j = h(p.id + 'j' + i); if (j > 0.994) v *= 0.968; else if (j < 0.004) v *= 1.028;
      let sale = 0, ev = null;
      for (const e of evs) { const dd = (t - e.t) / DAY; if (dd >= -1 && dd <= 1) { sale = (0.05 + h(p.id + e.label) * 0.07) * (dd === 0 ? 1 : 0.6); ev = dd === 0 ? e.label : null; } }
      raw.push({ t, r: v * (1 - sale), ev, sale: sale > 0 });
    }
    const k = cur / raw[N - 1].r;
    const pts = raw.map((x, i) => ({ t: x.t, low: Math.round(x.r * k), avg: Math.round(x.r * k * (1.03 + h(p.id + 'a' + i) * 0.025)), ev: x.ev, sale: x.sale }));
    pts[N - 1].low = cur;
    return (HC[p.id] = pts);
  }
  function stats(p) {
    const H = historyLong(p), N = H.length, cur = H[N - 1].low;
    let low = H[0], high = H[0]; H.forEach(x => { if (x.low <= low.low) low = x; if (x.low > high.low) high = x; });
    const avg90 = Math.round(H.slice(-90).reduce((a, x) => a + x.low, 0) / 90);
    const d7 = (cur - H[N - 8].low) / H[N - 8].low, d30 = (cur - H[N - 31].low) / H[N - 31].low;
    const nx = events().find(e => e.t > today().getTime());
    const nxIn = nx ? Math.round((nx.t - today().getTime()) / DAY) : null;
    let verdict, tone;
    if (cur <= low.low * 1.005) { verdict = 'At its 12-month low'; tone = 'ok'; }
    else if (cur < avg90 * 0.975) { verdict = Math.round((1 - cur / avg90) * 100) + '% below its 90-day average'; tone = 'ok'; }
    else if (cur > avg90 * 1.02) { verdict = 'Above its 90-day average' + (nx && nxIn < 45 ? ' · ' + nx.label + ' sale in ' + nxIn + ' days' : ''); tone = 'warn'; }
    else { verdict = 'Close to its 90-day average'; tone = 'info'; }
    const builds = 30 + Math.floor(h(p.id + 'b') * 880), views = 400 + Math.floor(h(p.id + 'v') * 9000);
    return { cur, low: low.low, lowT: low.t, high: high.low, avg90, d7, d30, verdict, tone, next: nx, nextIn: nxIn, builds, views, score: h(p.id + 'pop') * 60 + Math.max(0, -d7) * 900 + builds / 30 };
  }
  function catIndex(cat) {
    const ps = PRODUCTS.filter(p => !cat || cat === 'all' || p.cat === cat); const N = 365, out = new Array(N).fill(0);
    ps.forEach(p => { const H = historyLong(p), b = H[0].low; H.forEach((x, i) => { out[i] += x.low / b; }); });
    const H0 = historyLong(ps[0]);
    return out.map((v, i) => ({ t: H0[i].t, v: (v / ps.length) * 100, ev: H0[i].ev }));
  }
  const PROMOS = {
    RIGMY50: { label: 'RM 50 off orders above RM 3,000', calc: (sub) => (sub >= 3000 ? 50 : 0), need: 'Needs an order above RM 3,000.' },
    MERDEKA3: { label: '3% off parts, up to RM 300', calc: (sub) => Math.min(300, Math.round(sub * 0.03)), need: '' },
    FPX20: { label: 'RM 20 off when paying with FPX', calc: (sub, pay) => (pay === 'fpx' ? 20 : 0), need: 'Only applies to FPX payments.' },
  };
  window.RigMY = { REGIONS, RETAILERS, CATS, PRODUCTS, byId, SPECDEF, FACET, PRESETS, ETA_RANK, offers, lowest, history, compat, power, plan, fmt, BRANCHES, COURIER, regionOf, postcode, dist, fmtKm, openState, branchStock, nearby, historyLong, stats, catIndex, events, PROMOS, DAY, today };
})();
