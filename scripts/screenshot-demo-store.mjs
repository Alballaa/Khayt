/** Demo store for README screenshots — rich but self-contained. */

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

export function buildScreenshotDemoStore() {
  const today = isoDate(new Date());
  const clients = [
    { id: 'C1', nameEn: 'Najd Robotics', nameAr: 'نجد للروبotics', phone: '+966 50 111 2233', email: 'ops@najd.example', tier: 'Gold', creditLimit: 5000 },
    { id: 'C2', nameEn: 'Tuwaiq Models', nameAr: 'نماذج طويق', phone: '+966 55 444 5566', email: 'print@tuwaiq.example', tier: 'Gold', creditLimit: 8000 },
    { id: 'C3', nameEn: 'Atelier Hessa', nameAr: 'أتelier حصة', phone: '+966 54 777 8899', tier: 'Silver' },
    { id: 'C4', nameEn: 'Coastal Drones', nameAr: 'درونز الساحل', phone: '+966 56 222 3344', tier: 'Silver' },
    { id: 'C5', nameEn: 'Khalid M.', phone: '+966 53 999 0011', tier: 'Bronze' },
  ];

  const machines = [
    { id: 'M1', name: 'Bambu Lab X1C', tech: 'FDM', hourlyRate: 12, serviceInterval: 500, lastServiceHours: 120 },
    { id: 'M2', name: 'Prusa MK4S', tech: 'FDM', hourlyRate: 10, serviceInterval: 400, lastServiceHours: 80 },
    { id: 'M3', name: 'Creality K1 Max', tech: 'FDM', hourlyRate: 8, serviceInterval: 350, lastServiceHours: 200 },
    { id: 'M4', name: 'Saturn 4 Ultra', tech: 'Resin', hourlyRate: 9, serviceInterval: 300, lastServiceHours: 40 },
  ];

  const inventory = [
    { id: 'S1', material: 'PLA+ Black', brand: 'Polymaker', weight: 2840, cost: 75, reorderPoint: 500, color: '#1a1a1a' },
    { id: 'S2', material: 'PETG White', brand: 'eSUN', weight: 640, cost: 82, reorderPoint: 400, color: '#f0f0f0' },
    { id: 'S3', material: 'PLA Silk Gold', brand: 'SUNLU', weight: 210, cost: 95, reorderPoint: 300, color: '#c9a227' },
    { id: 'S4', material: 'ASA Black', brand: 'Prusament', weight: 1450, cost: 110, reorderPoint: 400, color: '#222222' },
    { id: 'S5', material: 'TPU 95A', brand: 'Polymaker', weight: 380, cost: 130, reorderPoint: 250, color: '#2a2a2a' },
    { id: 'S6', material: 'Resin Grey 8K', brand: 'Siraya Tech', weight: 1100, cost: 145, reorderPoint: 500, color: '#8a8f99' },
  ];

  const mkOrder = (id, project, clientId, status, daysBack, extra = {}) => ({
    id,
    project,
    clientId,
    client: clients.find(c => c.id === clientId)?.nameEn || '',
    date: daysAgo(daysBack),
    dueDate: status === 'completed' ? daysAgo(daysBack - 1) : daysAgo(-2),
    status,
    machineId: extra.machineId || 'M1',
    machine: machines.find(m => m.id === (extra.machineId || 'M1'))?.name || 'Bambu Lab X1C',
    price: extra.price ?? 480,
    paidAmount: extra.paidAmount ?? (status === 'completed' ? 0 : 0),
    printTime: extra.printTime ?? 6,
    material: extra.material ?? 'PLA+ Black',
    parts: [{ name: project, printWeight: 120, printTime: 4, filamentId: 'S1' }],
    ...extra,
  });

  const printLog = [
    mkOrder('O-1042', 'Gearbox housing batch', 'C1', 'printing', 1, { machineId: 'M1', price: 480, printTime: 6.1 }),
    mkOrder('O-1041', 'Figurine batch ×12', 'C2', 'printing', 2, { machineId: 'M1', price: 1240, material: 'PETG White' }),
    mkOrder('O-1040', 'Ring masters (resin)', 'C3', 'printing', 1, { machineId: 'M4', price: 720, material: 'Resin Grey 8K', printTime: 5.2 }),
    mkOrder('O-1039', 'Drone arm prototype', 'C4', 'pending', 3, { machineId: 'M3', price: 360 }),
    mkOrder('O-1038', 'Cable clip set', 'C5', 'pending', 4, { machineId: 'M2', price: 95, printTime: 1.6 }),
    mkOrder('O-1037', 'Bracket redesign', 'C2', 'pending', 4, { machineId: 'M2', price: 210 }),
    mkOrder('O-1036', 'Enclosure panels', 'C2', 'post', 5, { machineId: 'M1', price: 640, printTime: 9 }),
    mkOrder('O-1035', 'TPU gaskets', 'C1', 'post', 5, { machineId: 'M2', price: 180, material: 'TPU 95A' }),
    mkOrder('O-1034', 'Display stand', 'C3', 'qc', 6, { machineId: 'M4', price: 540 }),
    mkOrder('O-1033', 'ASA propeller', 'C4', 'qc', 6, { machineId: 'M3', price: 420, material: 'ASA Black' }),
    mkOrder('O-1032', 'White PLA trophies', 'C2', 'completed', 8, { price: 980, paidAmount: 980, printTime: 11 }),
    mkOrder('O-1031', 'Phone stand', 'C5', 'completed', 9, { price: 110, paidAmount: 110 }),
    mkOrder('O-1030', 'Sensor mount', 'C1', 'completed', 12, { price: 320, paidAmount: 200 }),
    mkOrder('O-1029', 'Lens cap', 'C3', 'completed', 15, { price: 85, paidAmount: 85 }),
    mkOrder('O-1028', 'Batch hooks', 'C4', 'completed', 18, { price: 240, paidAmount: 0 }),
    ...Array.from({ length: 8 }, (_, i) =>
      mkOrder(`O-10${10 - i}`, `Production job ${10 - i}`, 'C1', 'completed', 20 + i, {
        price: 400 + i * 50,
        paidAmount: i % 2 === 0 ? 400 + i * 50 : 0,
        date: daysAgo(22 + i),
      })
    ),
  ];

  // Revenue in current month for dashboard goal bar
  for (let i = 0; i < 20; i++) {
    printLog.push(mkOrder(`O-R${i}`, `May order ${i + 1}`, 'C2', 'completed', i % 28, {
      price: 280 + (i * 37) % 420,
      paidAmount: 280 + (i * 37) % 420,
      date: daysAgo(i % 28),
    }));
  }

  return {
    version: 5,
    settings: {
      lang: 'en',
      theme: 'dark',
      mode: 'professional',
      firstRun: false,
      firstRunDone: true,
      businessName: 'Khayt Studio Demo',
      bizEn: 'Al-Athar 3D Print Studio',
      bizAr: 'استوديو الأثر للطباعة ثلاثية الأبعاد',
      taglineEn: 'Production · Invoicing · Analytics',
      currency: 'SAR',
      monthlyGoal: 8000,
      lowStockThreshold: 400,
      loyaltyEnabled: true,
      loyaltyTiers: [
        { name: 'Bronze', minOrders: 1, minSpend: 0 },
        { name: 'Silver', minOrders: 10, minSpend: 3000 },
        { name: 'Gold', minOrders: 25, minSpend: 10000 },
      ],
      dismissedNotifs: {},
      staleHours: { pending: 72, printing: 48 },
    },
    printLog,
    clients,
    machines,
    inventory,
    templates: [],
    products: [],
    printers: [],
    expenses: [
      { id: 'E1', date: daysAgo(5), category: 'Filament', amount: 450, note: 'Polymaker restock' },
      { id: 'E2', date: daysAgo(12), category: 'Maintenance', amount: 120, note: 'Nozzle kit' },
    ],
    waTemplates: [],
    wasteLog: [],
    machMaintLog: [],
    consumables: [],
    suppliers: [],
    purchaseOrders: [],
    testPrints: [],
    locations: [{ id: 'L1', name: 'Main workshop', isDefault: true }],
    operators: [],
    waitingList: [],
    waitingListHistory: [],
    timeEntries: [],
    shiftLogs: [],
    giftCards: [],
    slicerProfiles: [],
    envLogs: [],
  };
}
