import { Router, Response } from 'express';
import { getDatabase } from '../db/client.ts';
import {
  workAssignments,
  locations,
  fuelSessions,
  distributionOrders,
  distributionOrderItems,
  vehicles,
  organizations,
  contracts,
  fuelDistributions,
  correctionRequests,
} from '../db/schema.ts';
import { requireAuth, requireWorker, AuthenticatedRequest } from '../middleware/auth.ts';
import { validateBody, recordDistributionSchema, correctionRequestSchema } from '../validators/index.ts';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { executeFuelDistribution } from '../services/fuelDistribution.ts';

export const workerRouter = Router();

// Apply worker authorization to all endpoints in this router
workerRouter.use(requireAuth, requireWorker);

/**
 * GET /api/worker/dashboard
 * Scoped data for the logged-in worker:
 * - Current location / assignment
 * - Current active session stock
 * - Next vehicle in the ordered queue
 * - Today's own distributions count
 * - Recent own distributions (strictly own, not company-wide)
 */
workerRouter.get('/dashboard', async (req: AuthenticatedRequest, res: Response) => {
  const workerId = req.user!.id;

  try {
    const { db } = await getDatabase();

    // 1. Current location assignment (where endAt IS NULL)
    const assignmentResult = await db
      .select({
        assignment: workAssignments,
        location: locations,
      })
      .from(workAssignments)
      .innerJoin(locations, eq(workAssignments.locationId, locations.id))
      .where(and(eq(workAssignments.workerId, workerId), isNull(workAssignments.endAt)))
      .limit(1);

    const currentLocation = assignmentResult[0]?.location || null;

    // 2. Current active session
    const activeSessions = await db
      .select()
      .from(fuelSessions)
      .where(eq(fuelSessions.status, 'Active'))
      .orderBy(desc(fuelSessions.startedAt))
      .limit(1);

    const currentSession = activeSessions[0] || null;

    // 3. Operational Distribution Queue / Next Vehicle
    let nextVehicleItem: any = null;
    let orderInfo: any = null;

    if (currentLocation) {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayOrders = await db
        .select()
        .from(distributionOrders)
        .where(
          and(
            eq(distributionOrders.locationId, currentLocation.id),
            eq(distributionOrders.status, 'ACTIVE'),
            eq(distributionOrders.scheduledDate, todayStr)
          )
        )
        .orderBy(desc(distributionOrders.createdAt))
        .limit(1);

      const fallbackOrders = await db
        .select()
        .from(distributionOrders)
        .where(
          and(
            eq(distributionOrders.locationId, currentLocation.id),
            eq(distributionOrders.status, 'ACTIVE')
          )
        )
        .orderBy(desc(distributionOrders.scheduledDate), desc(distributionOrders.createdAt))
        .limit(1);

      const orders = todayOrders.length > 0 ? todayOrders : fallbackOrders;

      if (orders.length > 0) {
        orderInfo = orders[0];
        const unservedItems = await db
          .select({
            item: distributionOrderItems,
            vehicle: vehicles,
            organization: organizations,
          })
          .from(distributionOrderItems)
          .innerJoin(vehicles, eq(distributionOrderItems.vehicleId, vehicles.id))
          .innerJoin(organizations, eq(vehicles.organizationId, organizations.id))
          .where(
            and(
              eq(distributionOrderItems.orderId, orderInfo.id),
              eq(distributionOrderItems.isServed, false)
            )
          )
          .orderBy(distributionOrderItems.sequenceOrder)
          .limit(1);

        if (unservedItems.length > 0) {
          nextVehicleItem = unservedItems[0];
        }
      }
    }

    // Resolve the authoritative fuel session for the active distribution order
    let programSession = null;
    if (orderInfo) {
      const orderSessionRecords = await db
        .select()
        .from(fuelSessions)
        .where(eq(fuelSessions.id, orderInfo.sessionId))
        .limit(1);
      if (orderSessionRecords.length > 0) {
        programSession = orderSessionRecords[0];
      }
    }
    const resolvedDisplaySession = programSession || currentSession;

    // 4. Worker's own recent distributions
    const ownDistributions = await db
      .select()
      .from(fuelDistributions)
      .where(eq(fuelDistributions.recordedBy, workerId))
      .orderBy(desc(fuelDistributions.createdAt))
      .limit(50);

    const ownTotalCount = ownDistributions.length;
    const ownTodayLiters = ownDistributions.reduce((acc, curr) => acc + curr.quantityLiters, 0);

    // 5. Worker's pending correction requests
    const ownCorrections = await db
      .select()
      .from(correctionRequests)
      .where(eq(correctionRequests.requestedBy, workerId))
      .orderBy(desc(correctionRequests.createdAt))
      .limit(10);

    // Resolve active contract price for next vehicle if present
    let vehicleContractPrice: number | null = null;
    if (nextVehicleItem?.organization?.id) {
      const vehicleContracts = await db
        .select({ contractPricePerLiter: contracts.contractPricePerLiter })
        .from(contracts)
        .where(
          and(
            eq(contracts.organizationId, nextVehicleItem.organization.id),
            eq(contracts.status, 'ACTIVE')
          )
        )
        .limit(1);

      if (vehicleContracts.length > 0) {
        vehicleContractPrice = vehicleContracts[0].contractPricePerLiter;
      }
    }

    return res.json({
      success: true,
      data: {
        worker: req.user,
        currentLocation,
        currentSession: resolvedDisplaySession
          ? {
              id: resolvedDisplaySession.id,
              number: resolvedDisplaySession.number,
              fuelIn: resolvedDisplaySession.fuelIn,
              fuelOut: resolvedDisplaySession.fuelOut,
              fuelRemaining: Math.max(0, resolvedDisplaySession.fuelIn - resolvedDisplaySession.fuelOut),
              pricePerLiter: resolvedDisplaySession.pricePerLiter,
              status: resolvedDisplaySession.status,
            }
          : null,
        distributionOrder: orderInfo,
        nextVehicle: nextVehicleItem
          ? {
              itemId: nextVehicleItem.item.id,
              orderId: orderInfo.id,
              sessionId: orderInfo.sessionId,
              sequenceOrder: nextVehicleItem.item.sequenceOrder,
              suggestedLiters: nextVehicleItem.item.suggestedLiters,
              vehicleId: nextVehicleItem.vehicle.id,
              registration: nextVehicleItem.vehicle.registration,
              type: nextVehicleItem.vehicle.type,
              driverName: nextVehicleItem.vehicle.driverName,
              organizationId: nextVehicleItem.organization.id,
              organizationName: nextVehicleItem.organization.name,
              contractPricePerLiter: vehicleContractPrice,
            }
          : null,
        ownActivityCount: ownTotalCount,
        ownTodayLiters,
        recentDistributions: ownDistributions,
        pendingCorrections: ownCorrections,
      },
    });
  } catch (error) {
    console.error('[WORKER] Dashboard error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors de la récupération des données pompiste.' },
    });
  }
});

/**
 * GET /api/worker/queue
 * Gets all vehicles in the current active distribution order
 */
workerRouter.get('/queue', async (req: AuthenticatedRequest, res: Response) => {
  const workerId = req.user!.id;

  try {
    const { db } = await getDatabase();

    const assignment = await db
      .select()
      .from(workAssignments)
      .where(and(eq(workAssignments.workerId, workerId), isNull(workAssignments.endAt)))
      .limit(1);

    if (assignment.length === 0) {
      return res.json({ success: true, data: { queue: [] } });
    }

    const locationId = assignment[0].locationId;

    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = await db
      .select()
      .from(distributionOrders)
      .where(
        and(
          eq(distributionOrders.locationId, locationId),
          eq(distributionOrders.status, 'ACTIVE'),
          eq(distributionOrders.scheduledDate, todayStr)
        )
      )
      .limit(1);

    const fallbackOrders = await db
      .select()
      .from(distributionOrders)
      .where(and(eq(distributionOrders.locationId, locationId), eq(distributionOrders.status, 'ACTIVE')))
      .orderBy(desc(distributionOrders.scheduledDate), desc(distributionOrders.createdAt))
      .limit(1);

    const orders = todayOrders.length > 0 ? todayOrders : fallbackOrders;

    if (orders.length === 0) {
      return res.json({ success: true, data: { queue: [] } });
    }

    const items = await db
      .select({
        item: distributionOrderItems,
        vehicle: vehicles,
        organization: organizations,
      })
      .from(distributionOrderItems)
      .innerJoin(vehicles, eq(distributionOrderItems.vehicleId, vehicles.id))
      .innerJoin(organizations, eq(vehicles.organizationId, organizations.id))
      .where(eq(distributionOrderItems.orderId, orders[0].id))
      .orderBy(distributionOrderItems.sequenceOrder);

    return res.json({
      success: true,
      data: {
        order: orders[0],
        queue: items.map((i) => ({
          itemId: i.item.id,
          sequenceOrder: i.item.sequenceOrder,
          suggestedLiters: i.item.suggestedLiters,
          isServed: i.item.isServed,
          servedAt: i.item.servedAt,
          vehicleId: i.vehicle.id,
          registration: i.vehicle.registration,
          type: i.vehicle.type,
          driverName: i.vehicle.driverName,
          organizationName: i.organization.name,
        })),
      },
    });
  } catch (error) {
    console.error('[WORKER] Queue fetch error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors du chargement de la file.' },
    });
  }
});

/**
 * POST /api/worker/distributions
 * Transactional fuel distribution:
 * - Checks worker assignment
 * - Checks vehicle and organization validity
 * - Checks active session stock (REJECTS if quantity > remaining)
 * - Calculates totalCostFBU server-side
 * - Idempotency check prevents duplicate submissions
 * - Deducts stock, increments vehicle total, marks queue item served
 */
workerRouter.post('/distributions', validateBody(recordDistributionSchema), async (req: AuthenticatedRequest, res: Response) => {
  const workerId = req.user!.id;
  const { vehicleId, quantityLiters, idempotencyKey, itemId, orderId } = req.body;

  try {
    const result = await executeFuelDistribution({
      userId: workerId,
      role: 'WORKER',
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
    console.error('[WORKER] Distribution recording error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: "Erreur lors de l'enregistrement de la distribution." },
    });
  }
});

/**
 * POST /api/worker/corrections
 * Allows a worker to request a correction on a finalized distribution
 */
workerRouter.post('/corrections', validateBody(correctionRequestSchema), async (req: AuthenticatedRequest, res: Response) => {
  const workerId = req.user!.id;
  const { distributionId, reason, proposedLiters } = req.body;

  try {
    const { db } = await getDatabase();

    const distributions = await db
      .select()
      .from(fuelDistributions)
      .where(eq(fuelDistributions.id, distributionId))
      .limit(1);

    if (distributions.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Distribution introuvable.' },
      });
    }

    const correctionId = uuidv4();
    const newRequest = {
      id: correctionId,
      distributionId,
      requestedBy: workerId,
      reason,
      proposedLiters,
      status: 'PENDING' as const,
      createdAt: new Date(),
    };

    await db.insert(correctionRequests).values(newRequest);

    return res.json({
      success: true,
      data: {
        correctionRequest: newRequest,
        message: 'Demande de correction transmise à la direction pour validation.',
      },
    });
  } catch (error) {
    console.error('[WORKER] Correction request error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Erreur lors de la soumission de la demande de correction.' },
    });
  }
});
