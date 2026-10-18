import { getDatabase } from './client.ts';
import {
  users,
  locations,
  workAssignments,
  organizations,
  vehicles,
  fuelSessions,
  fuelPrices,
  fuelAllocations,
  distributionOrders,
  distributionOrderItems,
  fuelDistributions,
  contracts,
} from './schema.ts';
import { hashPassword, hashAdminPin } from '../auth/password.ts';
import { eq } from 'drizzle-orm';

/**
 * Seeds the development database with Admin, Worker, initial batch, and organizations.
 */
export async function seedDevelopmentDatabase() {
  const { db } = await getDatabase();

  // Check if already seeded
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    console.log('[SEED] Database already contains data. Skipping seed.');
    return;
  }

  console.log('[SEED] Seeding development database...');

  const adminPasswordHash = await hashPassword('Admin123!');
  const adminPinHash = await hashAdminPin('4589'); // Real Admin PIN (NOT 1234)
  const workerPasswordHash = await hashPassword('Worker123!');

  // 1. Users
  const adminUser = {
    id: 'user-admin-01',
    email: 'admin@consolateoil.bi',
    passwordHash: adminPasswordHash,
    adminPinHash: adminPinHash,
    name: 'Alexis Nkurunziza (Directeur)',
    role: 'ADMIN' as const,
    isActive: true,
  };

  const workerUser = {
    id: 'user-worker-01',
    email: 'pompiste@consolateoil.bi',
    passwordHash: workerPasswordHash,
    adminPinHash: null,
    name: 'Jean-Pierre Minani (Chef de Dépôt)',
    role: 'WORKER' as const,
    isActive: true,
  };

  await db.insert(users).values([adminUser, workerUser]);

  // 2. Locations
  const depotCentral = {
    id: 'loc-01',
    name: 'Dépôt Central - Bujumbura',
    code: 'DEPOT-CENTRAL',
    city: 'Bujumbura',
    isActive: true,
  };
  await db.insert(locations).values([depotCentral]);

  // 3. Worker Assignment (active current assignment)
  await db.insert(workAssignments).values([
    {
      id: 'assign-01',
      workerId: workerUser.id,
      locationId: depotCentral.id,
      startAt: new Date(),
      endAt: null,
    },
  ]);

  // 4. Fuel Prices
  await db.insert(fuelPrices).values([
    {
      id: 'price-01',
      pricePerLiter: 3950,
      effectiveFrom: new Date('2026-09-01'),
      effectiveTo: null,
      createdBy: adminUser.id,
    },
  ]);

  // 5. Active Session 004 & Historical Sessions
  const session4 = {
    id: 'session-004',
    number: 'Session #004',
    fuelIn: 10000,
    fuelOut: 7250,
    pricePerLiter: 3950,
    status: 'Active' as const,
    notes: 'Arrivage citerne Nord - Cuve principale Dépôt 1',
  };

  const session3 = {
    id: 'session-003',
    number: 'Session #003',
    fuelIn: 12000,
    fuelOut: 12000,
    pricePerLiter: 3950,
    status: 'Terminée' as const,
    notes: 'Distribution complète achevée le 26/09/2026',
  };

  await db.insert(fuelSessions).values([session4, session3]);

  // 6. Organizations & Individual Customer
  const orgs = [
    {
      id: 'org-abc',
      name: 'Hôpital ABC',
      type: 'Hôpital' as const,
      customerType: 'ORGANIZATION' as const,
      location: 'Bujumbura',
      contactPerson: 'Dr. Alexis Nkurunziza',
      phone: '+257 79 123 456',
      actualPrepaidMoney: 5925000,
      isActive: true,
    },
    {
      id: 'org-xyz',
      name: 'Company XYZ',
      type: 'Entreprise' as const,
      customerType: 'ORGANIZATION' as const,
      location: 'Gitega',
      contactPerson: 'M. Jean-Claude Hakizimana',
      phone: '+257 71 889 900',
      actualPrepaidMoney: 9875000,
      isActive: true,
    },
    {
      id: 'org-def',
      name: 'ONG Santé Plus',
      type: 'ONG' as const,
      customerType: 'ORGANIZATION' as const,
      location: 'Ngozi',
      contactPerson: 'Mme. Blandine Kaneza',
      phone: '+257 76 345 678',
      actualPrepaidMoney: 3160000,
      isActive: true,
    },
    {
      id: 'org-pl',
      name: 'Hôpital Prince Louis',
      type: 'Hôpital' as const,
      customerType: 'ORGANIZATION' as const,
      location: 'Bujumbura',
      contactPerson: 'Dr. Pierre Ndikumana',
      phone: '+257 79 555 444',
      actualPrepaidMoney: 7110000,
      isActive: true,
    },
    {
      id: 'cust-ind-01',
      name: 'Pasteur Éphrem Ndikumana',
      type: 'Service Public' as const,
      customerType: 'INDIVIDUAL' as const,
      location: 'Rohero, Bujumbura',
      contactPerson: 'Pasteur Éphrem Ndikumana',
      phone: '+257 79 999 111',
      actualPrepaidMoney: 1975000,
      isActive: true,
    },
  ];
  await db.insert(organizations).values(orgs);

  // 7. Allocations (Legacy, preserved for backward compatibility)
  const allocs = [
    {
      id: 'alloc-abc',
      organizationId: 'org-abc',
      requestedLiters: 1500,
      receivedLiters: 1200, // 300 L waiting
      notes: 'Dotation ambulances urgences',
    },
    {
      id: 'alloc-xyz',
      organizationId: 'org-xyz',
      requestedLiters: 2500,
      receivedLiters: 2000, // 500 L waiting
      notes: 'Transport chaîne logistique',
    },
    {
      id: 'alloc-def',
      organizationId: 'org-def',
      requestedLiters: 800,
      receivedLiters: 650, // 150 L waiting
      notes: 'Missions santé mobile Ngozi',
    },
    {
      id: 'alloc-pl',
      organizationId: 'org-pl',
      requestedLiters: 1800,
      receivedLiters: 1800, // 0 L waiting
      notes: 'Dotation complétée',
    },
  ];
  await db.insert(fuelAllocations).values(allocs);

  // 8. CONTRACTS (Source of Truth for Customer Prepaid Fuel Entitlement)
  // Contract Price = 3950 FBU/L
  await db.insert(contracts).values([
    {
      id: 'contract-abc-01',
      organizationId: 'org-abc',
      customerType: 'ORGANIZATION',
      startDate: new Date('2026-09-01'),
      contractedLiters: 1500,
      amountPaidFBU: 5925000,
      contractPricePerLiter: 3950,
      consumedLiters: 100,
      consumedAmountFBU: 395000,
      remainingLiters: 1400,
      remainingAmountFBU: 5530000,
      status: 'ACTIVE',
      createdBy: adminUser.id,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date(),
    },
    {
      id: 'contract-xyz-01',
      organizationId: 'org-xyz',
      customerType: 'ORGANIZATION',
      startDate: new Date('2026-09-05'),
      contractedLiters: 2500,
      amountPaidFBU: 9875000,
      contractPricePerLiter: 3950,
      consumedLiters: 0,
      consumedAmountFBU: 0,
      remainingLiters: 2500,
      remainingAmountFBU: 9875000,
      status: 'ACTIVE',
      createdBy: adminUser.id,
      createdAt: new Date('2026-09-05'),
      updatedAt: new Date(),
    },
    {
      id: 'contract-def-01',
      organizationId: 'org-def',
      customerType: 'ORGANIZATION',
      startDate: new Date('2026-09-10'),
      contractedLiters: 800,
      amountPaidFBU: 3160000,
      contractPricePerLiter: 3950,
      consumedLiters: 0,
      consumedAmountFBU: 0,
      remainingLiters: 800,
      remainingAmountFBU: 3160000,
      status: 'ACTIVE',
      createdBy: adminUser.id,
      createdAt: new Date('2026-09-10'),
      updatedAt: new Date(),
    },
    {
      id: 'contract-pl-01',
      organizationId: 'org-pl',
      customerType: 'ORGANIZATION',
      startDate: new Date('2026-09-01'),
      contractedLiters: 1800,
      amountPaidFBU: 7110000,
      contractPricePerLiter: 3950,
      consumedLiters: 1800,
      consumedAmountFBU: 7110000,
      remainingLiters: 0,
      remainingAmountFBU: 0,
      status: 'EXHAUSTED',
      createdBy: adminUser.id,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date(),
    },
    {
      id: 'contract-ind-01',
      organizationId: 'cust-ind-01',
      customerType: 'INDIVIDUAL',
      startDate: new Date('2026-09-15'),
      contractedLiters: 500,
      amountPaidFBU: 1975000,
      contractPricePerLiter: 3950,
      consumedLiters: 0,
      consumedAmountFBU: 0,
      remainingLiters: 500,
      remainingAmountFBU: 1975000,
      status: 'ACTIVE',
      createdBy: adminUser.id,
      createdAt: new Date('2026-09-15'),
      updatedAt: new Date(),
    },
  ]);

  // 9. Vehicles (Organizations have multiple, Individual has exactly one)
  const vehList = [
    {
      id: 'veh-1',
      registration: 'AB 1234',
      type: 'Ambulance',
      organizationId: 'org-abc',
      driverName: 'J. Bizimana',
      totalReceivedLiters: 450,
      isActive: true,
    },
    {
      id: 'veh-2',
      registration: 'AB 5678',
      type: 'Ambulance',
      organizationId: 'org-abc',
      driverName: 'E. Ndayishimiye',
      totalReceivedLiters: 420,
      isActive: true,
    },
    {
      id: 'veh-3',
      registration: 'AB 9012',
      type: 'Véhicule de Liaison',
      organizationId: 'org-abc',
      driverName: 'D. Ntahorwamiye',
      totalReceivedLiters: 330,
      isActive: true,
    },
    {
      id: 'veh-4',
      registration: 'CD 5678',
      type: 'Pickup 4x4',
      organizationId: 'org-xyz',
      driverName: 'M. Kwizera',
      totalReceivedLiters: 850,
      isActive: true,
    },
    {
      id: 'veh-5',
      registration: 'CD 4321',
      type: 'Camion Plateau',
      organizationId: 'org-xyz',
      driverName: 'S. Nduwimana',
      totalReceivedLiters: 1150,
      isActive: true,
    },
    {
      id: 'veh-6',
      registration: 'BG 9012',
      type: 'Land Cruiser Tout-Terrain',
      organizationId: 'org-def',
      driverName: 'A. Bukuru',
      totalReceivedLiters: 650,
      isActive: true,
    },
    // Vehicle for Individual Customer (exactly one vehicle)
    {
      id: 'veh-ind-01',
      registration: 'IT 7788',
      type: 'Toyota RAV4',
      organizationId: 'cust-ind-01',
      driverName: 'Pasteur Éphrem Ndikumana',
      totalReceivedLiters: 0,
      isActive: true,
    },
  ];
  await db.insert(vehicles).values(vehList);

  // 9. Scheduled Distribution Programs (Past, Today, and Upcoming)
  const pastOrder = {
    id: 'order-past-01',
    title: 'Programme du 03/10/2026',
    scheduledDate: '2026-10-03',
    sessionId: session4.id,
    locationId: depotCentral.id,
    status: 'COMPLETED' as const,
    createdBy: adminUser.id,
  };

  const todayOrder = {
    id: 'order-today-01',
    title: 'Programme du 05/10/2026',
    scheduledDate: '2026-10-05',
    sessionId: session4.id,
    locationId: depotCentral.id,
    status: 'ACTIVE' as const,
    createdBy: adminUser.id,
  };

  const upcomingOrder = {
    id: 'order-upcoming-01',
    title: 'Programme du 06/10/2026',
    scheduledDate: '2026-10-06',
    sessionId: session4.id,
    locationId: depotCentral.id,
    status: 'ACTIVE' as const,
    createdBy: adminUser.id,
  };

  await db.insert(distributionOrders).values([pastOrder, todayOrder, upcomingOrder]);

  await db.insert(distributionOrderItems).values([
    // Past Program Items (all served)
    {
      id: 'item-past-01',
      orderId: pastOrder.id,
      vehicleId: 'veh-2', // AB 5678
      sequenceOrder: 1,
      suggestedLiters: 120,
      status: 'SERVED',
      isServed: true,
      servedAt: new Date('2026-10-03T09:15:00'),
    },
    {
      id: 'item-past-02',
      orderId: pastOrder.id,
      vehicleId: 'veh-5', // CD 4321
      sequenceOrder: 2,
      suggestedLiters: 300,
      status: 'SERVED',
      isServed: true,
      servedAt: new Date('2026-10-03T11:45:00'),
    },

    // Today Program Items
    {
      id: 'item-01',
      orderId: todayOrder.id,
      vehicleId: 'veh-1', // AB 1234
      sequenceOrder: 1,
      suggestedLiters: 100,
      status: 'SERVED',
      isServed: true,
      servedAt: new Date('2026-10-05T08:30:00'),
    },
    {
      id: 'item-02',
      orderId: todayOrder.id,
      vehicleId: 'veh-4', // CD 5678
      sequenceOrder: 2,
      suggestedLiters: 250,
      status: 'CURRENT',
      isServed: false,
    },
    {
      id: 'item-03',
      orderId: todayOrder.id,
      vehicleId: 'veh-6', // BG 9012
      sequenceOrder: 3,
      suggestedLiters: 80,
      status: 'WAITING',
      isServed: false,
    },

    // Upcoming Program Items
    {
      id: 'item-up-01',
      orderId: upcomingOrder.id,
      vehicleId: 'veh-3', // AB 9012
      sequenceOrder: 1,
      suggestedLiters: 150,
      status: 'WAITING',
      isServed: false,
    },
    {
      id: 'item-up-02',
      orderId: upcomingOrder.id,
      vehicleId: 'veh-ind-01', // IT 7788
      sequenceOrder: 2,
      suggestedLiters: 50,
      status: 'WAITING',
      isServed: false,
    },
  ]);

  // 10. Sample historical distributions
  await db.insert(fuelDistributions).values([
    {
      id: 'dist-001',
      contractId: 'contract-abc-01',
      sessionId: session4.id,
      organizationId: 'org-abc',
      vehicleId: 'veh-1',
      locationId: depotCentral.id,
      recordedBy: workerUser.id,
      quantityLiters: 100,
      pricePerLiter: 3950,
      totalCostFBU: 395000,
      vehicleRegistrationSnapshot: 'AB 1234',
      organizationNameSnapshot: 'Hôpital ABC',
      createdAt: new Date('2026-10-05T08:30:00'),
    },
    {
      id: 'dist-002',
      contractId: 'contract-abc-01',
      sessionId: session4.id,
      organizationId: 'org-abc',
      vehicleId: 'veh-2',
      locationId: depotCentral.id,
      recordedBy: workerUser.id,
      quantityLiters: 120,
      pricePerLiter: 3950,
      totalCostFBU: 474000,
      vehicleRegistrationSnapshot: 'AB 5678',
      organizationNameSnapshot: 'Hôpital ABC',
      createdAt: new Date('2026-10-03T09:15:00'),
    },
    {
      id: 'dist-003',
      contractId: 'contract-xyz-01',
      sessionId: session4.id,
      organizationId: 'org-xyz',
      vehicleId: 'veh-5',
      locationId: depotCentral.id,
      recordedBy: workerUser.id,
      quantityLiters: 300,
      pricePerLiter: 3950,
      totalCostFBU: 1185000,
      vehicleRegistrationSnapshot: 'CD 4321',
      organizationNameSnapshot: 'Company XYZ',
      createdAt: new Date('2026-10-03T11:45:00'),
    },
  ]);

  console.log('[SEED] Database seeded successfully!');
  console.log('  Admin:  admin@consolateoil.bi  / Admin123! (PIN: 4589)');
  console.log('  Worker: pompiste@consolateoil.bi / Worker123!');
}
