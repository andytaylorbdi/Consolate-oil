import { Router, Response } from 'express';
import { getDatabase } from '../db/client.ts';
import {
  organizations,
  vehicles,
  fuelSessions,
  fuelPrices,
  fuelAllocations,
  distributionOrders,
  distributionOrderItems,
  fuelDistributions,
  correctionRequests,
  auditLogs,
  users,
  locations,
  workAssignments,
  contracts,
} from '../db/schema.ts';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middleware/auth.ts';
import {
  validateBody,
  organizationSchema,
  updateOrganizationSchema,
  vehicleSchema,
  updateVehicleSchema,
  createSessionSchema,
  updateSessionSchema,
  createPriceSchema,
  createOrderSchema,
  reorderItemsSchema,
  updateItemStatusSchema,
  workerSchema,
  updateWorkerSchema,
  recordDistributionSchema,
  createContractSchema,
  suspendContractSchema,
} from '../validators/index.ts';
import { eq, desc, and, isNull, inArray, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword, verifyAdminPin } from '../auth/password.ts';
import { executeFuelDistribution } from '../services/fuelDistribution.ts';

export const adminRouter = Router();

// Apply admin authorization to all endpoints in this router
adminRouter.use(requireAuth, requireAdmin);

/**
 * Format YYYY-MM-DD into "Programme du DD/MM/YYYY"
 */
function formatProgramTitle(scheduledDateStr: string): string {
  const parts = (scheduledDateStr || '').split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `Programme du ${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return `Programme du ${scheduledDateStr || ''}`;
}

/**
 * Returns today's date in YYYY-MM-DD format (local server time)
 */
function getTodayDateStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 1. ACCUEIL — ADMIN DASHBOARD OVERVIEW (READ-ONLY MONITORING)
 * Answers: "What is the situation right now?"
 * Shows:
 * - Active fuel stock, remaining liters, fuel received, fuel distributed
 * - Current fuel price, all active sessions across locations
 * - Today's operations: served vehicles count, waiting vehicles, current, absent, today's liters, today's total FBU
 * - Workers: active workers, current assigned location
 * - Pending corrections count
 */
adminRouter.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await getDatabase();

    // 1. Fuel Sessions (supports multiple active locations)
    const allSessions = await db.select().from(fuelSessions).orderBy(desc(fuelSessions.startedAt), desc(fuelSessions.createdAt));
    const activeSessionsWithFuel = allSessions.filter((s) => s.status === 'Active' && s.fuelIn - s.fuelOut > 0);
    const currentSession = activeSessionsWithFuel[0] || allSessions[0] || null;

    const totalFuelReceived = allSessions.reduce((acc, s) => acc + s.fuelIn, 0);
    const totalFuelDistributed = allSessions.reduce((acc, s) => acc + s.fuelOut, 0);
    const activeStockLiters = activeSessionsWithFuel.reduce((acc, s) => acc + (s.fuelIn - s.fuelOut), 0);

    // Current price (active price row with effectiveTo IS NULL)
    const activePrices = await db
      .select()
      .from(fuelPrices)
      .where(isNull(fuelPrices.effectiveTo))
      .orderBy(desc(fuelPrices.effectiveFrom))
      .limit(1);
    const currentPrice = activePrices[0]?.pricePerLiter ?? null;

    // 2. Active Distribution Order & Operational Situation Today
    const todayStr = getTodayDateStr();
    const activeOrders = await db
      .select()
      .from(distributionOrders)
      .where(and(eq(distributionOrders.status, 'ACTIVE'), eq(distributionOrders.scheduledDate, todayStr)))
      .orderBy(desc(distributionOrders.createdAt))
      .limit(1);

    const fallbackActiveOrder = (await db
      .select()
      .from(distributionOrders)
      .where(eq(distributionOrders.status, 'ACTIVE'))
      .orderBy(desc(distributionOrders.scheduledDate), desc(distributionOrders.createdAt))
      .limit(1))[0] || null;

    const primaryOrder = activeOrders[0] || fallbackActiveOrder;

    let queueItems: any[] = [];
    if (primaryOrder) {
      queueItems = await db
        .select({
          item: distributionOrderItems,
          vehicle: vehicles,
          organization: organizations,
        })
        .from(distributionOrderItems)
        .innerJoin(vehicles, eq(distributionOrderItems.vehicleId, vehicles.id))
        .innerJoin(organizations, eq(vehicles.organizationId, organizations.id))
        .where(eq(distributionOrderItems.orderId, primaryOrder.id))
        .orderBy(distributionOrderItems.sequenceOrder);
    }

    const waitingVehiclesCount = queueItems.filter((i) => i.item.status === 'WAITING').length;
    const currentVehiclesCount = queueItems.filter((i) => i.item.status === 'CURRENT').length;
    const servedVehiclesCount = queueItems.filter((i) => i.item.status === 'SERVED' || i.item.isServed).length;
    const absentVehiclesCount = queueItems.filter((i) => i.item.status === 'ABSENT').length;

    // Today's Distributions
    const allDistributions = await db
      .select()
      .from(fuelDistributions)
      .orderBy(desc(fuelDistributions.createdAt))
      .limit(50);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayDistributions = allDistributions.filter((d) => new Date(d.createdAt) >= todayStart);
    const todayLiters = todayDistributions.reduce((acc, d) => acc + d.quantityLiters, 0);
    const todayFBU = todayDistributions.reduce((acc, d) => acc + d.totalCostFBU, 0);

    // 3. Workers & Current Assigned Locations
    const workerUsers = await db.select().from(users).where(eq(users.role, 'WORKER'));
    const allAssignments = await db
      .select({
        assignment: workAssignments,
        location: locations,
      })
      .from(workAssignments)
      .innerJoin(locations, eq(workAssignments.locationId, locations.id))
      .where(isNull(workAssignments.endAt));

    const workersWithLocation = workerUsers.map((w) => {
      const activeAssign = allAssignments.find((a) => a.assignment.workerId === w.id);
      return {
        id: w.id,
        name: w.name,
        email: w.email,
        isActive: w.isActive,
        currentLocation: activeAssign?.location?.name || 'Non assigné',
      };
    });

    // 4. Pending Corrections
    const pendingCorrections = await db
      .select()
      .from(correctionRequests)
      .where(eq(correctionRequests.status, 'PENDING'));

    // 5. Contracts Summary
    const allContracts = await db.select().from(contracts);
    const activeContracts = allContracts.filter((c) => c.status === 'ACTIVE');
    const totalRemainingContractLiters = activeContracts.reduce((sum, c) => sum + c.remainingLiters, 0);
    const totalRemainingContractFBU = activeContracts.reduce((sum, c) => sum + c.remainingAmountFBU, 0);

    const currentSessionRemaining = currentSession ? Math.max(0, currentSession.fuelIn - currentSession.fuelOut) : 0;
    const isCurrentSessionTerminated = currentSession ? (currentSession.status === 'Terminée' || currentSessionRemaining === 0) : true;

    return res.json({
      success: true,
      data: {
        fuel: {
          currentSession: currentSession
            ? {
                ...currentSession,
                fuelRemaining: currentSessionRemaining,
                isTerminated: isCurrentSessionTerminated,
              }
            : null,
          activeSessions: activeSessionsWithFuel,
          activeStockLiters,
          totalFuelReceived,
          totalFuelDistributed,
          currentPricePerLiter: currentPrice,
        },
        contracts: {
          totalActiveContracts: activeContracts.length,
          totalRemainingLiters: totalRemainingContractLiters,
          totalRemainingAmountFBU: totalRemainingContractFBU,
        },
        operations: {
          activeOrder: primaryOrder
            ? {
                ...primaryOrder,
                displayName: primaryOrder.title || formatProgramTitle(primaryOrder.scheduledDate),
              }
            : null,
          servedVehiclesCount,
          waitingVehiclesCount,
          currentVehiclesCount,
          absentVehiclesCount,
          totalVehiclesInOrder: queueItems.length,
          todayLiters,
          todayFBU,
        },
        workers: workersWithLocation,
        pendingCorrectionsCount: pendingCorrections.length,
      },
    });
  } catch (error) {
    console.error('[ADMIN] Overview error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors du chargement de la situation opérationnelle.' },
    });
  }
});

/**
 * 2. DISTRIBUTION — DAILY OPERATIONAL WORKFLOW & PROGRAM MANAGEMENT
 */
adminRouter.get('/distribution-orders', async (req: AuthenticatedRequest, res: Response) => {
  const { orderId } = req.query;
  try {
    const { db } = await getDatabase();
    const todayStr = getTodayDateStr();

    const allOrders = await db
      .select()
      .from(distributionOrders)
      .orderBy(desc(distributionOrders.scheduledDate), desc(distributionOrders.createdAt));

    const formattedOrders = allOrders.map((o) => {
      const category = o.scheduledDate > todayStr ? 'UPCOMING' : o.scheduledDate === todayStr ? 'TODAY' : 'PAST';
      const categoryLabel = category === 'UPCOMING' ? 'À venir' : category === 'TODAY' ? "Aujourd'hui" : 'Passé';
      return {
        ...o,
        displayName: o.title || formatProgramTitle(o.scheduledDate),
        category,
        categoryLabel,
      };
    });

    const operationalOrders = formattedOrders.filter((o) => o.category !== 'PAST');

    // Determine active order to load queue items for
    let selectedOrder: any = null;
    if (orderId && typeof orderId === 'string') {
      selectedOrder = formattedOrders.find((o) => o.id === orderId) || null;
    }
    if (!selectedOrder) {
      selectedOrder = operationalOrders.find((o) => o.category === 'TODAY') || operationalOrders[0] || formattedOrders[0] || null;
    }

    let itemsWithDetails: any[] = [];
    if (selectedOrder) {
      itemsWithDetails = await db
        .select({
          item: distributionOrderItems,
          vehicle: vehicles,
          organization: organizations,
        })
        .from(distributionOrderItems)
        .innerJoin(vehicles, eq(distributionOrderItems.vehicleId, vehicles.id))
        .innerJoin(organizations, eq(vehicles.organizationId, organizations.id))
        .where(eq(distributionOrderItems.orderId, selectedOrder.id))
        .orderBy(distributionOrderItems.sequenceOrder);
    }

    return res.json({
      success: true,
      data: {
        activeOrder: selectedOrder,
        operationalOrders,
        allOrders: formattedOrders,
        todayDate: todayStr,
        items: itemsWithDetails.map((i) => ({
          id: i.item.id,
          orderId: i.item.orderId,
          vehicleId: i.item.vehicleId,
          sequenceOrder: i.item.sequenceOrder,
          suggestedLiters: i.item.suggestedLiters,
          status: i.item.status || (i.item.isServed ? 'SERVED' : 'WAITING'),
          isServed: i.item.isServed,
          servedAt: i.item.servedAt,
          registration: i.vehicle.registration,
          vehicleType: i.vehicle.type,
          driverName: i.vehicle.driverName,
          organizationId: i.organization.id,
          organizationName: i.organization.name,
        })),
      },
    });
  } catch (error) {
    console.error('[ADMIN] Distribution orders fetch error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur chargement des programmes de distribution.' },
    });
  }
});

adminRouter.get('/distribution-orders/:id', async (req: AuthenticatedRequest, res: Response) => {
  const orderId = req.params.id;
  try {
    const { db } = await getDatabase();
    const orderRecords = await db.select().from(distributionOrders).where(eq(distributionOrders.id, orderId)).limit(1);
    if (orderRecords.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Programme introuvable.' } });
    }

    const order = orderRecords[0];
    const session = (await db.select().from(fuelSessions).where(eq(fuelSessions.id, order.sessionId)).limit(1))[0] || null;
    const location = (await db.select().from(locations).where(eq(locations.id, order.locationId)).limit(1))[0] || null;

    const itemsWithDetails = await db
      .select({
        item: distributionOrderItems,
        vehicle: vehicles,
        organization: organizations,
      })
      .from(distributionOrderItems)
      .innerJoin(vehicles, eq(distributionOrderItems.vehicleId, vehicles.id))
      .innerJoin(organizations, eq(vehicles.organizationId, organizations.id))
      .where(eq(distributionOrderItems.orderId, order.id))
      .orderBy(distributionOrderItems.sequenceOrder);

    const todayStr = getTodayDateStr();
    const category = order.scheduledDate > todayStr ? 'UPCOMING' : order.scheduledDate === todayStr ? 'TODAY' : 'PAST';

    return res.json({
      success: true,
      data: {
        order: {
          ...order,
          displayName: order.title || formatProgramTitle(order.scheduledDate),
          category,
          sessionNumber: session?.number || 'Session',
          locationName: location?.name || 'Dépôt Central',
        },
        session,
        location,
        items: itemsWithDetails.map((i) => ({
          id: i.item.id,
          orderId: i.item.orderId,
          vehicleId: i.item.vehicleId,
          sequenceOrder: i.item.sequenceOrder,
          suggestedLiters: i.item.suggestedLiters,
          status: i.item.status || (i.item.isServed ? 'SERVED' : 'WAITING'),
          isServed: i.item.isServed,
          servedAt: i.item.servedAt,
          registration: i.vehicle.registration,
          vehicleType: i.vehicle.type,
          driverName: i.vehicle.driverName,
          organizationId: i.organization.id,
          organizationName: i.organization.name,
        })),
      },
    });
  } catch (error) {
    console.error('[ADMIN] Distribution order detail error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Erreur chargement du programme.' } });
  }
});

adminRouter.post('/distribution-orders', validateBody(createOrderSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { scheduledDate, sessionId, locationId, vehicleIds } = req.body;
  const adminId = req.user!.id;

  try {
    const { db } = await getDatabase();

    // Check session stock vs requested total vehicles
    const sessionRecords = await db.select().from(fuelSessions).where(eq(fuelSessions.id, sessionId));
    if (sessionRecords.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session de carburant introuvable.' },
      });
    }

    const currentSession = sessionRecords[0];
    if (currentSession.status !== 'Active') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SESSION_NOT_ACTIVE',
          message: 'Impossible de baser un programme sur une session clôturée ou terminée. Veuillez sélectionner une session active.',
        },
      });
    }

    const availableStock = Math.max(0, currentSession.fuelIn - currentSession.fuelOut);
    if (availableStock <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SESSION_EMPTY',
          message: 'La session sélectionnée est épuisée (0 L disponible). Veuillez choisir une session approvisionnée.',
        },
      });
    }

    // Automatic naming: "Programme du DD/MM/YYYY" based on scheduledDate
    const autoTitle = formatProgramTitle(scheduledDate);
    const orderId = uuidv4();
    const newOrder = {
      id: orderId,
      title: autoTitle,
      scheduledDate,
      sessionId,
      locationId,
      status: 'ACTIVE' as const,
      createdBy: adminId,
      createdAt: new Date(),
    };

    await db.insert(distributionOrders).values(newOrder);

    // Insert items in sequence order with explicit initial status WAITING (or CURRENT for item 1)
    for (let index = 0; index < vehicleIds.length; index++) {
      await db.insert(distributionOrderItems).values({
        id: uuidv4(),
        orderId,
        vehicleId: vehicleIds[index],
        sequenceOrder: index + 1,
        suggestedLiters: 100,
        status: index === 0 ? 'CURRENT' : 'WAITING',
        isServed: false,
      });
    }

    return res.json({
      success: true,
      data: { order: newOrder, totalVehicles: vehicleIds.length },
      message: `${autoTitle} créé avec succès (${vehicleIds.length} véhicules).`,
    });
  } catch (error) {
    console.error('[ADMIN] Create distribution order error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur création du programme de distribution.' },
    });
  }
});

/**
 * Drag-and-drop Reordering endpoint for distribution items
 */
adminRouter.patch('/distribution-orders/items/reorder', validateBody(reorderItemsSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { orderedItemIds } = req.body;

  try {
    const { db } = await getDatabase();

    // Persist new position order in database
    for (let index = 0; index < orderedItemIds.length; index++) {
      await db
        .update(distributionOrderItems)
        .set({ sequenceOrder: index + 1 })
        .where(eq(distributionOrderItems.id, orderedItemIds[index]));
    }

    return res.json({ success: true, message: 'Ordre de passage mis à jour avec succès.' });
  } catch (error) {
    console.error('[ADMIN] Reorder error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: "Erreur lors du réordonnancement de la file d'attente." },
    });
  }
});

/**
 * Mark a vehicle item status (e.g. ABSENT, WAITING, CURRENT)
 */
adminRouter.patch('/distribution-orders/items/:id/status', validateBody(updateItemStatusSchema), async (req: AuthenticatedRequest, res: Response) => {
  const itemId = req.params.id;
  const { status } = req.body;

  try {
    const { db } = await getDatabase();

    await db
      .update(distributionOrderItems)
      .set({
        status,
        isServed: status === 'SERVED',
        servedAt: status === 'SERVED' ? new Date() : null,
      })
      .where(eq(distributionOrderItems.id, itemId));

    return res.json({ success: true, message: `Statut du véhicule mis à jour : ${status}.` });
  } catch (error) {
    console.error('[ADMIN] Update item status error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors de la mise à jour du statut.' },
    });
  }
});

/**
 * Authoritative Fuel Recording by Admin (calls shared executeFuelDistribution)
 */
adminRouter.post('/record-distribution', validateBody(recordDistributionSchema), async (req: AuthenticatedRequest, res: Response) => {
  const adminId = req.user!.id;
  const { vehicleId, quantityLiters, idempotencyKey, itemId, orderId } = req.body;

  try {
    const result = await executeFuelDistribution({
      userId: adminId,
      role: 'ADMIN',
      vehicleId,
      quantityLiters,
      idempotencyKey,
      itemId,
      orderId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: result.errorCode, message: result.errorMessage },
      });
    }

    return res.json({
      success: true,
      data: {
        distribution: result.distribution,
        remainingFuel: result.remainingFuel,
        message: result.message,
      },
    });
  } catch (error) {
    console.error('[ADMIN] Record fuel error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: "Erreur lors de l'enregistrement de la distribution." },
    });
  }
});

/**
 * 3. GESTION — ORGANIZATIONS
 */
adminRouter.get('/organizations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await getDatabase();
    const orgs = await db.select().from(organizations);
    const allocs = await db.select().from(fuelAllocations);
    const vehs = await db.select().from(vehicles);

    const merged = orgs.map((org) => {
      const alloc = allocs.find((a) => a.organizationId === org.id);
      const orgVehs = vehs.filter((v) => v.organizationId === org.id);
      return {
        ...org,
        vehiclesCount: orgVehs.length,
        requestedLiters: alloc?.requestedLiters || 0,
        receivedLiters: alloc?.receivedLiters || 0,
        waitingLiters: Math.max(0, (alloc?.requestedLiters || 0) - (alloc?.receivedLiters || 0)),
      };
    });

    return res.json({ success: true, data: { organizations: merged } });
  } catch (error) {
    console.error('[ADMIN] Organizations error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur chargement organisations.' },
    });
  }
});

adminRouter.post('/organizations', validateBody(organizationSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { name, type, customerType, location, contactPerson, phone, requestedLiters, vehicle } = req.body;
  const adminId = req.user!.id;

  const normalizedCustomerType: 'ORGANIZATION' | 'INDIVIDUAL' = customerType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'ORGANIZATION';

  if (normalizedCustomerType === 'INDIVIDUAL') {
    const { pool } = await getDatabase();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Check phone uniqueness
      const existingPhone = await client.query(
        'SELECT id, name FROM organizations WHERE phone = $1 LIMIT 1',
        [phone.trim()]
      );
      if (existingPhone.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: {
            code: 'PHONE_ALREADY_EXISTS',
            message: `Ce numéro de téléphone est déjà associé au client existant "${existingPhone.rows[0].name}". Veuillez sélectionner ce client dans la liste au lieu d'en créer un nouveau.`,
          },
        });
      }

      // 2. Check vehicle registration uniqueness
      const regUpper = vehicle.registration.trim().toUpperCase();
      const existingVeh = await client.query(
        'SELECT id FROM vehicles WHERE registration = $1 LIMIT 1',
        [regUpper]
      );
      if (existingVeh.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: {
            code: 'VEHICLE_ALREADY_EXISTS',
            message: `L'immatriculation ${regUpper} est déjà enregistrée.`,
          },
        });
      }

      const orgId = uuidv4();
      const now = new Date();

      // 3. Insert individual organization
      await client.query(
        `INSERT INTO organizations (
          id, name, type, customer_type, location, contact_person, phone,
          actual_prepaid_money, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, true, $8, $8)`,
        [
          orgId,
          name.trim(),
          type,
          'INDIVIDUAL',
          location.trim(),
          contactPerson.trim(),
          phone.trim(),
          now,
        ]
      );

      // 4. Insert vehicle
      const vehId = uuidv4();
      const driverName = vehicle.driverName?.trim() || contactPerson.trim() || name.trim();
      const vehType = vehicle.type?.trim() || 'Véhicule Particulier';

      await client.query(
        `INSERT INTO vehicles (
          id, registration, type, organization_id, driver_name,
          total_received_liters, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 0, true, $6, $6)`,
        [
          vehId,
          regUpper,
          vehType,
          orgId,
          driverName,
          now,
        ]
      );

      // 5. Optional allocation
      if (requestedLiters) {
        await client.query(
          `INSERT INTO fuel_allocations (
            id, organization_id, requested_liters, received_liters, created_at, updated_at
          ) VALUES ($1, $2, $3, 0, $4, $4)`,
          [uuidv4(), orgId, requestedLiters, now]
        );
      }

      await client.query('COMMIT');

      const newOrg = {
        id: orgId,
        name: name.trim(),
        type,
        customerType: 'INDIVIDUAL' as const,
        location: location.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        actualPrepaidMoney: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      const newVeh = {
        id: vehId,
        registration: regUpper,
        type: vehType,
        organizationId: orgId,
        driverName,
        totalReceivedLiters: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      return res.json({ success: true, data: { organization: newOrg, vehicle: newVeh } });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
      console.error('[ADMIN] Create individual customer error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: "Erreur création du client individuel." },
      });
    } finally {
      client.release();
    }
  }

  // ORGANIZATION flow (keeps working exactly as today)
  try {
    const { db } = await getDatabase();
    const orgId = uuidv4();

    const newOrg = {
      id: orgId,
      name,
      type,
      customerType: 'ORGANIZATION' as const,
      location,
      contactPerson,
      phone: phone.trim(),
      actualPrepaidMoney: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(organizations).values(newOrg);

    if (requestedLiters) {
      await db.insert(fuelAllocations).values({
        id: uuidv4(),
        organizationId: orgId,
        requestedLiters,
        receivedLiters: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return res.json({ success: true, data: { organization: newOrg } });
  } catch (error) {
    console.error('[ADMIN] Create org error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: "Erreur création d'organisation." },
    });
  }
});

adminRouter.patch('/organizations/:id', validateBody(updateOrganizationSchema), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.params.id;
  const { name, type, location, contactPerson, phone, requestedLiters, isActive } = req.body;

  try {
    const { db } = await getDatabase();
    const existing = await db.select().from(organizations).where(eq(organizations.id, orgId));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Organisation introuvable.' } });
    }

    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (location !== undefined) updates.location = location;
    if (contactPerson !== undefined) updates.contactPerson = contactPerson;
    if (phone !== undefined) updates.phone = phone;
    if (isActive !== undefined) updates.isActive = isActive;

    await db.update(organizations).set(updates).where(eq(organizations.id, orgId));

    if (requestedLiters !== undefined) {
      const allocs = await db.select().from(fuelAllocations).where(eq(fuelAllocations.organizationId, orgId));
      if (allocs.length > 0) {
        await db.update(fuelAllocations).set({ requestedLiters, updatedAt: new Date() }).where(eq(fuelAllocations.id, allocs[0].id));
      } else {
        await db.insert(fuelAllocations).values({
          id: uuidv4(),
          organizationId: orgId,
          requestedLiters,
          receivedLiters: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return res.json({ success: true, message: 'Organisation mise à jour avec succès.' });
  } catch (error) {
    console.error('[ADMIN] Update org error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Erreur mise à jour organisation.' } });
  }
});

adminRouter.patch('/organizations/:id/toggle-active', async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.params.id;

  try {
    const { db } = await getDatabase();
    const existing = await db.select().from(organizations).where(eq(organizations.id, orgId));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Organisation introuvable.' } });
    }

    const updated = !existing[0].isActive;
    await db.update(organizations).set({ isActive: updated, updatedAt: new Date() }).where(eq(organizations.id, orgId));

    return res.json({ success: true, message: `Organisation ${updated ? 'activée' : 'désactivée'}.` });
  } catch (error) {
    console.error('[ADMIN] Toggle org error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Erreur mise à jour.' } });
  }
});

/**
 * 3. GESTION — VEHICLES
 */
adminRouter.get('/vehicles', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await getDatabase();
    const vehs = await db
      .select({
        vehicle: vehicles,
        organization: organizations,
      })
      .from(vehicles)
      .innerJoin(organizations, eq(vehicles.organizationId, organizations.id));

    return res.json({
      success: true,
      data: {
        vehicles: vehs.map((v) => ({
          ...v.vehicle,
          organizationName: v.organization.name,
        })),
      },
    });
  } catch (error) {
    console.error('[ADMIN] Vehicles error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur chargement des véhicules.' },
    });
  }
});

adminRouter.post('/vehicles', validateBody(vehicleSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { registration, type, organizationId, driverName } = req.body;

  try {
    const { db } = await getDatabase();

    // Check if customer is INDIVIDUAL - an individual must have exactly ONE vehicle
    const customer = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (customer.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'CUSTOMER_NOT_FOUND', message: 'Client introuvable.' } });
    }

    if (customer[0].customerType === 'INDIVIDUAL') {
      const existingVehicles = await db.select().from(vehicles).where(eq(vehicles.organizationId, organizationId));
      if (existingVehicles.length >= 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INDIVIDUAL_SINGLE_VEHICLE_LIMIT',
            message: 'Un client individuel ne peut avoir qu’un seul véhicule rattaché.',
          },
        });
      }
    }

    const vehId = uuidv4();

    const newVeh = {
      id: vehId,
      registration: registration.toUpperCase(),
      type,
      organizationId,
      driverName: driverName || 'Non assigné',
      totalReceivedLiters: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(vehicles).values(newVeh);

    return res.json({ success: true, data: { vehicle: newVeh } });
  } catch (error) {
    console.error('[ADMIN] Create vehicle error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur création du véhicule.' },
    });
  }
});

adminRouter.patch('/vehicles/:id', validateBody(updateVehicleSchema), async (req: AuthenticatedRequest, res: Response) => {
  const vehId = req.params.id;
  const { registration, type, organizationId, driverName, isActive } = req.body;

  try {
    const { db } = await getDatabase();
    const existing = await db.select().from(vehicles).where(eq(vehicles.id, vehId));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Véhicule introuvable.' } });
    }

    const updates: any = { updatedAt: new Date() };
    if (registration !== undefined) updates.registration = registration.toUpperCase();
    if (type !== undefined) updates.type = type;
    if (organizationId !== undefined) updates.organizationId = organizationId;
    if (driverName !== undefined) updates.driverName = driverName;
    if (isActive !== undefined) updates.isActive = isActive;

    await db.update(vehicles).set(updates).where(eq(vehicles.id, vehId));

    return res.json({ success: true, message: 'Véhicule mis à jour avec succès.' });
  } catch (error) {
    console.error('[ADMIN] Update vehicle error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Erreur mise à jour véhicule.' } });
  }
});

adminRouter.patch('/vehicles/:id/toggle-active', async (req: AuthenticatedRequest, res: Response) => {
  const vehId = req.params.id;

  try {
    const { db } = await getDatabase();
    const existing = await db.select().from(vehicles).where(eq(vehicles.id, vehId));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Véhicule introuvable.' } });
    }

    const updated = !existing[0].isActive;
    await db.update(vehicles).set({ isActive: updated, updatedAt: new Date() }).where(eq(vehicles.id, vehId));

    return res.json({ success: true, message: `Véhicule ${updated ? 'activé' : 'désactivé'}.` });
  } catch (error) {
    console.error('[ADMIN] Toggle vehicle error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Erreur mise à jour.' } });
  }
});

/**
 * 3. GESTION — WORKERS & LOCATIONS
 */
adminRouter.get('/workers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await getDatabase();
    const workers = await db.select().from(users).where(eq(users.role, 'WORKER'));
    const allAssignments = await db
      .select({
        assignment: workAssignments,
        location: locations,
      })
      .from(workAssignments)
      .innerJoin(locations, eq(workAssignments.locationId, locations.id))
      .where(isNull(workAssignments.endAt));

    const allLocations = await db.select().from(locations).where(eq(locations.isActive, true));

    const result = workers.map((w) => {
      const activeAssign = allAssignments.find((a) => a.assignment.workerId === w.id);
      return {
        id: w.id,
        name: w.name,
        email: w.email,
        isActive: w.isActive,
        createdAt: w.createdAt,
        locationId: activeAssign?.location?.id || null,
        locationName: activeAssign?.location?.name || 'Non assigné',
      };
    });

    return res.json({
      success: true,
      data: {
        workers: result,
        locations: allLocations,
      },
    });
  } catch (error) {
    console.error('[ADMIN] Workers error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur chargement des pompistes.' },
    });
  }
});

adminRouter.post('/workers', validateBody(workerSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { name, email, password, locationId } = req.body;

  try {
    const { db } = await getDatabase();
    const workerId = uuidv4();
    const passwordHash = await hashPassword(password || 'Worker123!');

    const newWorker = {
      id: workerId,
      name,
      email: email.toLowerCase(),
      passwordHash,
      adminPinHash: null,
      role: 'WORKER' as const,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(users).values(newWorker);

    // Create assignment
    await db.insert(workAssignments).values({
      id: uuidv4(),
      workerId,
      locationId,
      startAt: new Date(),
      endAt: null,
      createdAt: new Date(),
    });

    return res.json({ success: true, data: { worker: newWorker } });
  } catch (error) {
    console.error('[ADMIN] Create worker error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur création du pompiste.' },
    });
  }
});

adminRouter.patch('/workers/:id', validateBody(updateWorkerSchema), async (req: AuthenticatedRequest, res: Response) => {
  const workerId = req.params.id;
  const { name, email, isActive, locationId } = req.body;

  try {
    const { db } = await getDatabase();
    const existing = await db.select().from(users).where(eq(users.id, workerId));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pompiste introuvable.' } });
    }

    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.toLowerCase();
    if (isActive !== undefined) updates.isActive = isActive;

    await db.update(users).set(updates).where(eq(users.id, workerId));

    // If location changed, end old assignment and create new assignment
    if (locationId) {
      await db
        .update(workAssignments)
        .set({ endAt: new Date() })
        .where(and(eq(workAssignments.workerId, workerId), isNull(workAssignments.endAt)));

      await db.insert(workAssignments).values({
        id: uuidv4(),
        workerId,
        locationId,
        startAt: new Date(),
        endAt: null,
        createdAt: new Date(),
      });
    }

    return res.json({ success: true, message: 'Pompiste mis à jour avec succès.' });
  } catch (error) {
    console.error('[ADMIN] Update worker error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur mise à jour du pompiste.' },
    });
  }
});

/**
 * 3. GESTION — FUEL PRICES & FUEL SESSIONS
 */
adminRouter.get('/prices', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await getDatabase();
    const prices = await db.select().from(fuelPrices).orderBy(desc(fuelPrices.effectiveFrom));
    return res.json({ success: true, data: { prices } });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Erreur prix.' } });
  }
});

adminRouter.post('/prices', validateBody(createPriceSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { pricePerLiter } = req.body;
  const adminId = req.user!.id;

  const { pool } = await getDatabase();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Read current active price with row lock
    const activePriceRes = await client.query(
      'SELECT price_per_liter FROM fuel_prices WHERE effective_to IS NULL ORDER BY effective_from DESC LIMIT 1 FOR UPDATE'
    );

    if (
      activePriceRes.rows.length > 0 &&
      (activePriceRes.rows[0].price_per_liter === pricePerLiter ||
        Number(activePriceRes.rows[0].price_per_liter) === pricePerLiter)
    ) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { code: 'SAME_PRICE', message: 'Ce prix est déjà le prix actif.' },
      });
    }

    const now = new Date();
    const newPriceId = uuidv4();

    // 2. Close all currently active prices
    await client.query(
      'UPDATE fuel_prices SET effective_to = $1 WHERE effective_to IS NULL',
      [now]
    );

    // 3. Insert new price record
    await client.query(
      `INSERT INTO fuel_prices (
        id, price_per_liter, effective_from, effective_to, created_by, created_at
      ) VALUES ($1, $2, $3, NULL, $4, $5)`,
      [newPriceId, pricePerLiter, now, adminId, now]
    );

    await client.query('COMMIT');

    const newPrice = {
      id: newPriceId,
      pricePerLiter,
      effectiveFrom: now,
      effectiveTo: null,
      createdBy: adminId,
      createdAt: now,
    };

    return res.json({ success: true, data: { price: newPrice } });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    console.error('[ADMIN] Update price error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur enregistrement prix.' },
    });
  } finally {
    client.release();
  }
});

adminRouter.get('/sessions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await getDatabase();
    const sessions = await db.select().from(fuelSessions).orderBy(desc(fuelSessions.startedAt), desc(fuelSessions.createdAt));
    const formatted = sessions.map((s) => ({
      ...s,
      fuelRemaining: Math.max(0, s.fuelIn - s.fuelOut),
    }));
    return res.json({ success: true, data: { sessions: formatted } });
  } catch (error) {
    console.error('[ADMIN] Sessions fetch error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Erreur sessions.' } });
  }
});

adminRouter.get('/sessions/:id', async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.id;
  try {
    const { db } = await getDatabase();
    const sessionRecords = await db.select().from(fuelSessions).where(eq(fuelSessions.id, sessionId)).limit(1);
    if (sessionRecords.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session introuvable.' } });
    }

    const session = sessionRecords[0];
    const fuelRemaining = Math.max(0, session.fuelIn - session.fuelOut);

    // Get all distribution programs that used this session
    const sessionOrders = await db
      .select()
      .from(distributionOrders)
      .where(eq(distributionOrders.sessionId, sessionId))
      .orderBy(desc(distributionOrders.scheduledDate), desc(distributionOrders.createdAt));

    const allOrderItems = await db.select().from(distributionOrderItems);
    const sessionDistributions = await db.select().from(fuelDistributions).where(eq(fuelDistributions.sessionId, sessionId));

    const todayStr = getTodayDateStr();

    const programs = sessionOrders.map((o) => {
      const items = allOrderItems.filter((i) => i.orderId === o.id);
      const servedItems = items.filter((i) => i.isServed || i.status === 'SERVED');
      const orderDists = sessionDistributions.filter((d) => items.some((it) => it.vehicleId === d.vehicleId));
      const distLiters = orderDists.reduce((acc, d) => acc + d.quantityLiters, 0);

      const category = o.scheduledDate > todayStr ? 'UPCOMING' : o.scheduledDate === todayStr ? 'TODAY' : 'PAST';

      return {
        id: o.id,
        title: o.title || formatProgramTitle(o.scheduledDate),
        scheduledDate: o.scheduledDate,
        status: o.status,
        category,
        totalVehicles: items.length,
        servedVehicles: servedItems.length,
        totalDistributedLiters: distLiters,
        createdAt: o.createdAt,
      };
    });

    // Count unique vehicles served in this session by their license plate (plaque ID)
    const distinctPlaques = new Set(
      sessionDistributions
        .map((d) => d.vehicleRegistrationSnapshot?.trim().toUpperCase() || d.vehicleId)
        .filter(Boolean)
    );
    const totalVehiclesServed = distinctPlaques.size;
    const totalValueDistributedFBU = sessionDistributions.reduce((acc, d) => acc + d.totalCostFBU, 0);

    return res.json({
      success: true,
      data: {
        session: {
          ...session,
          fuelRemaining,
        },
        programs,
        analytics: {
          participatingProgramsCount: programs.length,
          totalVehiclesServed,
          uniqueVehiclesServed: distinctPlaques.size,
          totalDistributionsCount: sessionDistributions.length,
          totalValueDistributedFBU,
        },
      },
    });
  } catch (error) {
    console.error('[ADMIN] Session detail error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Erreur lors du chargement des détails de la session.' } });
  }
});

adminRouter.post('/sessions', validateBody(createSessionSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { fuelIn, pricePerLiter, number, notes } = req.body;

  try {
    const { db } = await getDatabase();
    const sessionId = uuidv4();
    const now = new Date();

    // Mark previous active sessions as Terminée to respect the single active session rule
    await db
      .update(fuelSessions)
      .set({
        status: 'Terminée',
        endedAt: now,
      })
      .where(eq(fuelSessions.status, 'Active'));

    const newSession = {
      id: sessionId,
      number,
      fuelIn,
      fuelOut: 0,
      pricePerLiter,
      status: 'Active' as const,
      startedAt: now,
      endedAt: null,
      notes: notes || 'Nouvel arrivage citerne',
      createdAt: now,
    };

    await db.insert(fuelSessions).values(newSession);

    return res.json({
      success: true,
      data: { session: newSession },
      message: `${number} créée avec succès (${fuelIn} L disponibles).`,
    });
  } catch (error) {
    console.error('[ADMIN] Create session error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur création de la session.' },
    });
  }
});

adminRouter.patch('/sessions/:id', validateBody(updateSessionSchema), async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = req.params.id;
  const { status, notes, pricePerLiter } = req.body;

  try {
    const { db } = await getDatabase();
    const existing = await db.select().from(fuelSessions).where(eq(fuelSessions.id, sessionId));
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session introuvable.' } });
    }

    const updates: any = {};
    if (status) {
      if (status === 'Active' && existing[0].status === 'Terminée') {
        const remaining = Math.max(0, existing[0].fuelIn - existing[0].fuelOut);
        if (remaining <= 0) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'SESSION_EXHAUSTED',
              message: 'Impossible de réactiver une session épuisée (0 L restant). Créez une nouvelle session.',
            },
          });
        }
      }

      updates.status = status;
      if (status === 'Terminée') {
        updates.endedAt = new Date();
      } else if (status === 'Active') {
        updates.endedAt = null;
      }
    }
    if (notes !== undefined) updates.notes = notes;
    if (pricePerLiter !== undefined) updates.pricePerLiter = pricePerLiter;

    await db.update(fuelSessions).set(updates).where(eq(fuelSessions.id, sessionId));

    return res.json({ success: true, message: 'Session mise à jour avec succès.' });
  } catch (error) {
    console.error('[ADMIN] Update session error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Erreur mise à jour session.' } });
  }
});

/**
 * 3. GESTION — CONTRACTS (Customer Prepaid Fuel Entitlements)
 */
adminRouter.get('/contracts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await getDatabase();
    const { status, customerType, search } = req.query;

    const allContracts = await db
      .select({
        contract: contracts,
        customer: organizations,
        creator: users,
      })
      .from(contracts)
      .innerJoin(organizations, eq(contracts.organizationId, organizations.id))
      .leftJoin(users, eq(contracts.createdBy, users.id))
      .orderBy(desc(contracts.createdAt));

    const allVehicles = await db.select().from(vehicles);

    let filtered = allContracts.map((c) => {
      const custVehicles = allVehicles.filter((v) => v.organizationId === c.customer.id);
      return {
        ...c.contract,
        customerName: c.customer.name,
        customerOrgType: c.customer.type,
        customerLocation: c.customer.location,
        customerContact: c.customer.contactPerson,
        customerPhone: c.customer.phone,
        customerIsActive: c.customer.isActive,
        creatorName: c.creator?.name || 'Direction',
        vehiclesCount: custVehicles.length,
        vehicles: custVehicles.map((v) => ({
          id: v.id,
          registration: v.registration,
          type: v.type,
          driverName: v.driverName,
          isActive: v.isActive,
        })),
      };
    });

    if (status && status !== 'ALL') {
      filtered = filtered.filter((c) => c.status === status);
    }

    if (customerType && customerType !== 'ALL') {
      filtered = filtered.filter((c) => c.customerType === customerType);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.customerName.toLowerCase().includes(q) ||
          c.vehicles.some((v) => v.registration.toLowerCase().includes(q))
      );
    }

    const activeContracts = allContracts.filter((c) => c.contract.status === 'ACTIVE');
    const totalContractedLiters = allContracts.reduce((sum, c) => sum + c.contract.contractedLiters, 0);
    const totalRemainingLiters = activeContracts.reduce((sum, c) => sum + c.contract.remainingLiters, 0);
    const totalConsumedLiters = allContracts.reduce((sum, c) => sum + c.contract.consumedLiters, 0);
    const totalAmountPaidFBU = allContracts.reduce((sum, c) => sum + c.contract.amountPaidFBU, 0);
    const totalRemainingAmountFBU = activeContracts.reduce((sum, c) => sum + c.contract.remainingAmountFBU, 0);

    return res.json({
      success: true,
      data: {
        contracts: filtered,
        summary: {
          totalContracts: allContracts.length,
          totalActiveContracts: activeContracts.length,
          totalSuspendedContracts: allContracts.filter((c) => c.contract.status === 'SUSPENDED').length,
          totalExhaustedContracts: allContracts.filter((c) => c.contract.status === 'EXHAUSTED').length,
          totalContractedLiters,
          totalRemainingLiters,
          totalConsumedLiters,
          totalAmountPaidFBU,
          totalRemainingAmountFBU,
        },
      },
    });
  } catch (error) {
    console.error('[ADMIN] Contracts fetch error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors du chargement des contrats.' },
    });
  }
});

adminRouter.get('/contracts/:id', async (req: AuthenticatedRequest, res: Response) => {
  const contractId = req.params.id;

  try {
    const { db } = await getDatabase();

    const contractResult = await db
      .select({
        contract: contracts,
        customer: organizations,
        creator: users,
      })
      .from(contracts)
      .innerJoin(organizations, eq(contracts.organizationId, organizations.id))
      .leftJoin(users, eq(contracts.createdBy, users.id))
      .where(eq(contracts.id, contractId))
      .limit(1);

    if (contractResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contrat introuvable.' },
      });
    }

    const { contract, customer, creator } = contractResult[0];

    const customerVehicles = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.organizationId, customer.id));

    const contractDistributions = await db
      .select({
        distribution: fuelDistributions,
        vehicle: vehicles,
        recorder: users,
        session: fuelSessions,
      })
      .from(fuelDistributions)
      .innerJoin(vehicles, eq(fuelDistributions.vehicleId, vehicles.id))
      .leftJoin(users, eq(fuelDistributions.recordedBy, users.id))
      .leftJoin(fuelSessions, eq(fuelDistributions.sessionId, fuelSessions.id))
      .where(eq(fuelDistributions.contractId, contractId))
      .orderBy(desc(fuelDistributions.createdAt))
      .limit(50);

    return res.json({
      success: true,
      data: {
        contract: {
          ...contract,
          customerName: customer.name,
          customerLocation: customer.location,
          customerContact: customer.contactPerson,
          customerPhone: customer.phone,
          customerIsActive: customer.isActive,
          creatorName: creator?.name || 'Direction',
        },
        customer,
        vehicles: customerVehicles,
        distributions: contractDistributions.map((d) => ({
          id: d.distribution.id,
          createdAt: d.distribution.createdAt,
          quantityLiters: d.distribution.quantityLiters,
          pricePerLiter: d.distribution.pricePerLiter,
          totalCostFBU: d.distribution.totalCostFBU,
          vehicleRegistration: d.vehicle.registration,
          vehicleType: d.vehicle.type,
          driverName: d.vehicle.driverName,
          recordedByName: d.recorder?.name || 'Pompiste',
          sessionNumber: d.session?.number || 'Session',
        })),
      },
    });
  } catch (error) {
    console.error('[ADMIN] Contract details fetch error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors du chargement des détails du contrat.' },
    });
  }
});

adminRouter.post('/contracts', validateBody(createContractSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { customerType, organizationId, contractedLiters, startDate } = req.body;
  const adminId = req.user!.id;

  // 1. Validate contractedLiters
  if (!Number.isInteger(contractedLiters) || contractedLiters <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_LITERS', message: 'Les litres contractés doivent être un nombre entier strictement positif.' },
    });
  }

  // 2. Validate startDate: parse and ensure not more than 30 days from today
  const parsedStartDate = new Date(startDate);
  if (isNaN(parsedStartDate.getTime())) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_START_DATE', message: 'La date de début du contrat est invalide.' },
    });
  }
  const now = new Date();
  const diffDays = Math.abs(parsedStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 30) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_START_DATE',
        message: 'La date de début ne peut pas différer de plus de 30 jours par rapport à la date du jour.',
      },
    });
  }

  const { pool } = await getDatabase();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 3. PRICE: Read current official price from fuel_prices (effective_to IS NULL)
    const priceRes = await client.query(
      'SELECT price_per_liter FROM fuel_prices WHERE effective_to IS NULL ORDER BY effective_from DESC LIMIT 1'
    );
    if (priceRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PRICE_SET',
          message: 'Aucun prix par litre défini. Définissez-le dans Plus > Tarification.',
        },
      });
    }

    const currentPrice = priceRes.rows[0].price_per_liter;
    const amountPaidFBU = contractedLiters * currentPrice;

    if (amountPaidFBU > 2000000000) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: {
          code: 'AMOUNT_TOO_LARGE',
          message: 'Le montant du contrat est trop élevé. Réduisez la quantité de litres.',
        },
      });
    }

    const targetOrgId = organizationId;

    if (!targetOrgId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { code: 'ORGANIZATION_REQUIRED', message: 'Veuillez sélectionner un client.' },
      });
    }

    // 5. CONCURRENCY: Lock customer row with FOR UPDATE before checking active contracts
    const custRes = await client.query(
      'SELECT id, name, customer_type, is_active FROM organizations WHERE id = $1 FOR UPDATE',
      [targetOrgId]
    );
    if (custRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Client introuvable.' },
      });
    }
    const customer = custRes.rows[0];
    if (!customer.is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { code: 'CUSTOMER_INACTIVE', message: 'Le compte client sélectionné est actuellement désactivé.' },
      });
    }

    // Check ONE ACTIVE contract per customer
    const activeContractRes = await client.query(
      'SELECT id, remaining_liters FROM contracts WHERE organization_id = $1 AND status = $2 LIMIT 1',
      [targetOrgId, 'ACTIVE']
    );
    if (activeContractRes.rows.length > 0) {
      await client.query('ROLLBACK');
      const existingRemaining = activeContractRes.rows[0].remaining_liters;
      return res.status(400).json({
        success: false,
        error: {
          code: 'ACTIVE_CONTRACT_EXISTS',
          message: `Ce client dispose déjà d'un contrat ACTIF en cours avec ${existingRemaining} L restants. Veuillez épuiser ou suspendre le contrat précédent avant d'en créer un nouveau.`,
        },
      });
    }

    // Enforce individual single vehicle rule
    if (customer.customer_type === 'INDIVIDUAL') {
      const vehsRes = await client.query(
        'SELECT id FROM vehicles WHERE organization_id = $1',
        [targetOrgId]
      );
      if (vehsRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: {
            code: 'INDIVIDUAL_NEEDS_VEHICLE',
            message: 'Un client individuel doit posséder exactement un véhicule immatriculé pour contracter.',
          },
        });
      }
      if (vehsRes.rows.length > 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: {
            code: 'INDIVIDUAL_VEHICLE_LIMIT',
            message: 'Un client individuel ne peut posséder qu’un seul véhicule.',
          },
        });
      }
    }

    // 6. Insert new contract
    const contractId = uuidv4();
    await client.query(
      `INSERT INTO contracts (
        id, organization_id, customer_type, start_date, contracted_liters,
        amount_paid_fbu, contract_price_per_liter, consumed_liters,
        consumed_amount_fbu, remaining_liters, remaining_amount_fbu,
        status, created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, 0,
        0, $5, $6,
        'ACTIVE', $8, $9, $9
      )`,
      [
        contractId,
        targetOrgId,
        customer.customer_type,
        parsedStartDate,
        contractedLiters,
        amountPaidFBU,
        currentPrice,
        adminId,
        now,
      ]
    );

    // 7. Increase actualPrepaidMoney directly in the database (SET x = x + amount)
    await client.query(
      `UPDATE organizations
       SET actual_prepaid_money = actual_prepaid_money + $1,
           updated_at = $2
       WHERE id = $3`,
      [amountPaidFBU, now, targetOrgId]
    );

    await client.query('COMMIT');

    const newContract = {
      id: contractId,
      organizationId: targetOrgId,
      customerType: customer.customer_type,
      startDate: parsedStartDate,
      contractedLiters,
      amountPaidFBU,
      contractPricePerLiter: currentPrice,
      consumedLiters: 0,
      consumedAmountFBU: 0,
      remainingLiters: contractedLiters,
      remainingAmountFBU: amountPaidFBU,
      status: 'ACTIVE' as const,
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
    };

    return res.json({
      success: true,
      data: { contract: newContract },
      message: `Contrat de ${contractedLiters} L créé avec succès pour ${customer.name} (Prix officiel : ${currentPrice} FBU/L, Montant : ${amountPaidFBU} FBU).`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ADMIN] Create contract error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors de la création du contrat.' },
    });
  } finally {
    client.release();
  }
});

adminRouter.patch('/contracts/:id/suspend', validateBody(suspendContractSchema), async (req: AuthenticatedRequest, res: Response) => {
  const contractId = req.params.id;
  const { reason } = req.body;
  const adminId = req.user!.id;

  try {
    const { db } = await getDatabase();

    const existing = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contrat introuvable.' } });
    }

    const contract = existing[0];

    // An exhausted contract is already finished and can never be suspended
    if (contract.status === 'EXHAUSTED' || contract.remainingLiters <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CONTRACT_ALREADY_EXHAUSTED',
          message: 'Impossible de suspendre un contrat déjà épuisé (0 L restant). Ce contrat est définitivement clôturé et terminé.',
        },
      });
    }

    if (contract.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_ACTIVE', message: `Ce contrat n'est pas actif (statut actuel : ${contract.status}).` },
      });
    }

    await db
      .update(contracts)
      .set({
        status: 'SUSPENDED',
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, contractId));

    // Audit log
    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId: adminId,
      action: 'CONTRACT_SUSPENDED',
      entityType: 'contract',
      entityId: contractId,
      details: JSON.stringify({ reason: reason || 'Suspension administrative', remainingLiters: contract.remainingLiters }),
      createdAt: new Date(),
    });

    return res.json({
      success: true,
      message: `Contrat suspendu avec succès. Le solde restant (${contract.remainingLiters} L) est préservé.`,
    });
  } catch (error) {
    console.error('[ADMIN] Suspend contract error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors de la suspension du contrat.' },
    });
  }
});

adminRouter.patch('/contracts/:id/reactivate', async (req: AuthenticatedRequest, res: Response) => {
  const contractId = req.params.id;
  const adminId = req.user!.id;

  try {
    const { db } = await getDatabase();

    const existing = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contrat introuvable.' } });
    }

    const contract = existing[0];
    if (contract.status !== 'SUSPENDED') {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_SUSPENDED', message: `Ce contrat n'est pas suspendu (statut actuel : ${contract.status}).` },
      });
    }

    if (contract.remainingLiters <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'CONTRACT_EMPTY', message: 'Impossible de réactiver un contrat épuisé (0 L restant).' },
      });
    }

    // Check if customer already has another active contract
    const otherActive = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.organizationId, contract.organizationId), eq(contracts.status, 'ACTIVE')))
      .limit(1);

    if (otherActive.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'OTHER_ACTIVE_EXISTS',
          message: 'Ce client dispose déjà d’un autre contrat actif. Veuillez le clôturer avant de réactiver celui-ci.',
        },
      });
    }

    await db
      .update(contracts)
      .set({
        status: 'ACTIVE',
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, contractId));

    // Audit log
    await db.insert(auditLogs).values({
      id: uuidv4(),
      userId: adminId,
      action: 'CONTRACT_REACTIVATED',
      entityType: 'contract',
      entityId: contractId,
      details: JSON.stringify({ remainingLiters: contract.remainingLiters }),
      createdAt: new Date(),
    });

    return res.json({
      success: true,
      message: `Contrat réactivé avec succès (${contract.remainingLiters} L disponibles).`,
    });
  } catch (error) {
    console.error('[ADMIN] Reactivate contract error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors de la réactivation du contrat.' },
    });
  }
});

/**
 * 4. HISTORIQUE — SESSIONS, DISTRIBUTIONS, ORDERS, PRICES & CORRECTIONS
 */
adminRouter.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await getDatabase();
    const todayStr = getTodayDateStr();

    const sessions = await db.select().from(fuelSessions).orderBy(desc(fuelSessions.startedAt), desc(fuelSessions.createdAt));
    const distributions = await db.select().from(fuelDistributions).orderBy(desc(fuelDistributions.createdAt)).limit(100);
    const prices = await db.select().from(fuelPrices).orderBy(desc(fuelPrices.effectiveFrom));
    const orders = await db.select().from(distributionOrders).orderBy(desc(distributionOrders.scheduledDate), desc(distributionOrders.createdAt));
    const corrections = await db.select().from(correctionRequests).orderBy(desc(correctionRequests.createdAt));
    const allItems = await db.select().from(distributionOrderItems);

    const formattedOrders = orders.map((o) => {
      const orderItems = allItems.filter((i) => i.orderId === o.id);
      const session = sessions.find((s) => s.id === o.sessionId);
      const category = o.scheduledDate > todayStr ? 'UPCOMING' : o.scheduledDate === todayStr ? 'TODAY' : 'PAST';
      const categoryLabel = category === 'UPCOMING' ? 'À venir' : category === 'TODAY' ? "Aujourd'hui" : 'Passé';

      return {
        ...o,
        displayName: o.title || formatProgramTitle(o.scheduledDate),
        sessionNumber: session?.number || 'Session',
        totalVehicles: orderItems.length,
        servedVehicles: orderItems.filter((i) => i.isServed || i.status === 'SERVED').length,
        category,
        categoryLabel,
      };
    });

    const formattedSessions = sessions.map((s) => ({
      ...s,
      fuelRemaining: Math.max(0, s.fuelIn - s.fuelOut),
    }));

    return res.json({
      success: true,
      data: {
        sessions: formattedSessions,
        distributions,
        prices,
        orders: formattedOrders,
        corrections,
      },
    });
  } catch (error) {
    console.error('[ADMIN] History error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur chargement historique.' },
    });
  }
});

/**
 * CORRECTION REQUEST REVIEW (Approve / Reject)
 */
adminRouter.post('/corrections/:id/review', async (req: AuthenticatedRequest, res: Response) => {
  const correctionId = req.params.id;
  const { action, rejectionReason } = req.body;
  const adminId = req.user!.id;

  try {
    const { db } = await getDatabase();
    const requests = await db.select().from(correctionRequests).where(eq(correctionRequests.id, correctionId));

    if (requests.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Demande introuvable.' } });
    }

    const request = requests[0];
    if (request.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_REVIEWED', message: 'Demande déjà traitée.' } });
    }

    if (action === 'APPROVE') {
      const dists = await db.select().from(fuelDistributions).where(eq(fuelDistributions.id, request.distributionId));
      if (dists.length > 0) {
        const dist = dists[0];
        const literDiff = request.proposedLiters - dist.quantityLiters;

        await db
          .update(fuelDistributions)
          .set({
            quantityLiters: request.proposedLiters,
            totalCostFBU: request.proposedLiters * dist.pricePerLiter,
          })
          .where(eq(fuelDistributions.id, dist.id));

        const session = (await db.select().from(fuelSessions).where(eq(fuelSessions.id, dist.sessionId)))[0];
        if (session) {
          await db
            .update(fuelSessions)
            .set({ fuelOut: Math.max(0, session.fuelOut + literDiff) })
            .where(eq(fuelSessions.id, session.id));
        }

        const vehicle = (await db.select().from(vehicles).where(eq(vehicles.id, dist.vehicleId)))[0];
        if (vehicle) {
          await db
            .update(vehicles)
            .set({ totalReceivedLiters: Math.max(0, vehicle.totalReceivedLiters + literDiff) })
            .where(eq(vehicles.id, vehicle.id));
        }

        // Adjust Contract balance if distribution was linked to a contract
        if (dist.contractId) {
          const contractList = await db.select().from(contracts).where(eq(contracts.id, dist.contractId));
          if (contractList.length > 0) {
            const c = contractList[0];
            const amountDiff = literDiff * c.contractPricePerLiter;
            const newConsumedL = Math.max(0, c.consumedLiters + literDiff);
            const newRemainingL = Math.max(0, c.contractedLiters - newConsumedL);
            const newConsumedAmt = Math.max(0, c.consumedAmountFBU + amountDiff);
            const newRemainingAmt = Math.max(0, c.amountPaidFBU - newConsumedAmt);
            const newStatus = newRemainingL === 0 ? 'EXHAUSTED' : (c.status === 'EXHAUSTED' ? 'ACTIVE' : c.status);

            await db
              .update(contracts)
              .set({
                consumedLiters: newConsumedL,
                remainingLiters: newRemainingL,
                consumedAmountFBU: newConsumedAmt,
                remainingAmountFBU: newRemainingAmt,
                status: newStatus,
                updatedAt: new Date(),
              })
              .where(eq(contracts.id, c.id));
          }
        }
      }

      await db
        .update(correctionRequests)
        .set({
          status: 'APPROVED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
        })
        .where(eq(correctionRequests.id, correctionId));
    } else {
      await db
        .update(correctionRequests)
        .set({
          status: 'REJECTED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason || 'Rejeté par la direction',
        })
        .where(eq(correctionRequests.id, correctionId));
    }

    return res.json({
      success: true,
      message: `Demande de correction ${action === 'APPROVE' ? 'approuvée' : 'rejetée'}.`,
    });
  } catch (error) {
    console.error('[ADMIN] Correction review error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors du traitement de la correction.' },
    });
  }
});
