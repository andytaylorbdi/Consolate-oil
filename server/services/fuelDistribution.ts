import { getDatabase } from '../db/client.ts';
import {
  fuelDistributions,
  fuelSessions,
  contracts,
  vehicles,
  organizations,
  distributionOrders,
  distributionOrderItems,
  locations,
  workAssignments,
} from '../db/schema.ts';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface RecordFuelParams {
  userId: string;
  role: 'WORKER' | 'ADMIN';
  vehicleId: string;
  quantityLiters: number;
  idempotencyKey?: string;
  itemId?: string;
  orderId?: string;
  customLocationId?: string; // Optional if Admin specifies location
  customSessionId?: string;  // Optional if Admin specifies session
}

export interface RecordFuelResult {
  success: boolean;
  distribution?: any;
  remainingFuel?: number;
  remainingContractLiters?: number;
  message?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Authoritative Fuel Distribution Service.
 * Used identically by both Worker and Admin workflows.
 * Enforces:
 * 1. Idempotency protection against accidental duplicate submissions.
 * 2. Active assignment / location resolution.
 * 3. Vehicle existence and active status.
 * 4. Customer organization / individual active status.
 * 5. Active contract validation: MUST have status='ACTIVE' and remainingLiters >= quantityLiters.
 * 6. Active fuel session validation: MUST have status='Active' and remainingStock >= quantityLiters.
 * 7. Transactional atomic execution:
 *    - Insert fuel_distributions with contract snapshot
 *    - Deduct fuel session stock (auto-close if 0L)
 *    - Deduct contract balance (auto-exhaust if 0L)
 *    - Increment vehicle totalReceivedLiters
 *    - Update queue item to SERVED
 * 8. Concurrency safety: atomic conditional updates guarantee no negative balances.
 */
export async function executeFuelDistribution(params: RecordFuelParams): Promise<RecordFuelResult> {
  const {
    userId,
    role,
    vehicleId,
    quantityLiters,
    idempotencyKey,
    itemId,
    orderId,
    customLocationId,
    customSessionId,
  } = params;

  if (!quantityLiters || quantityLiters <= 0) {
    return {
      success: false,
      errorCode: 'INVALID_QUANTITY',
      errorMessage: 'La quantité de carburant doit être un entier strictement supérieur à zéro.',
    };
  }

  const { db, pool } = await getDatabase();

  // 1. Idempotency Check
  if (idempotencyKey) {
    const existing = await db
      .select()
      .from(fuelDistributions)
      .where(eq(fuelDistributions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      return {
        success: true,
        distribution: existing[0],
        message: 'Distribution déjà enregistrée (protection anti-doublon idempotente).',
      };
    }
  }

  // 2. Resolve Location
  let locationId = customLocationId;
  if (!locationId) {
    if (role === 'WORKER') {
      const assignmentResult = await db
        .select()
        .from(workAssignments)
        .where(and(eq(workAssignments.workerId, userId), isNull(workAssignments.endAt)))
        .limit(1);

      if (assignmentResult.length === 0) {
        return {
          success: false,
          errorCode: 'NO_ACTIVE_ASSIGNMENT',
          errorMessage: 'Aucun poste de distribution actif assigné à ce pompiste.',
        };
      }
      locationId = assignmentResult[0].locationId;
    } else {
      const defaultLoc = await db.select().from(locations).where(eq(locations.isActive, true)).limit(1);
      locationId = defaultLoc[0]?.id || 'loc-01';
    }
  }

  // 3. Resolve Vehicle & Customer
  const vehicleRecords = await db
    .select({
      vehicle: vehicles,
      customer: organizations,
    })
    .from(vehicles)
    .innerJoin(organizations, eq(vehicles.organizationId, organizations.id))
    .where(eq(vehicles.id, vehicleId))
    .limit(1);

  if (vehicleRecords.length === 0) {
    return {
      success: false,
      errorCode: 'VEHICLE_NOT_FOUND',
      errorMessage: "Véhicule introuvable dans le registre.",
    };
  }

  const { vehicle, customer } = vehicleRecords[0];

  if (!vehicle.isActive) {
    return {
      success: false,
      errorCode: 'VEHICLE_INACTIVE',
      errorMessage: "Ce véhicule est désactivé et non autorisé à recevoir du carburant.",
    };
  }

  if (!customer.isActive) {
    return {
      success: false,
      errorCode: 'CUSTOMER_INACTIVE',
      errorMessage: "Le compte client rattaché est actuellement désactivé.",
    };
  }

  // 4. Resolve Active Contract for Customer
  const contractRecords = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.organizationId, customer.id), eq(contracts.status, 'ACTIVE')))
    .limit(1);

  if (contractRecords.length === 0) {
    // Check if there is an exhausted or suspended contract to give precise feedback
    const anyContracts = await db
      .select()
      .from(contracts)
      .where(eq(contracts.organizationId, customer.id))
      .orderBy(desc(contracts.createdAt))
      .limit(1);

    if (anyContracts.length > 0) {
      const c = anyContracts[0];
      if (c.status === 'EXHAUSTED') {
        return {
          success: false,
          errorCode: 'CONTRACT_EXHAUSTED',
          errorMessage: `Le contrat de ce client est épuisé (0 L restant). Souscription d'un nouveau contrat requise.`,
        };
      }
      if (c.status === 'SUSPENDED') {
        return {
          success: false,
          errorCode: 'CONTRACT_SUSPENDED',
          errorMessage: `Le contrat de ce client est suspendu par la direction. Distribution interdite.`,
        };
      }
    }

    return {
      success: false,
      errorCode: 'NO_ACTIVE_CONTRACT',
      errorMessage: `Ce client ne dispose d'aucun contrat actif. Seuls les clients sous contrat actif sont autorisés à recevoir du carburant.`,
    };
  }

  const activeContract = contractRecords[0];

  // CONTRACT BALANCE CHECK
  if (quantityLiters > activeContract.remainingLiters) {
    return {
      success: false,
      errorCode: 'INSUFFICIENT_CONTRACT_BALANCE',
      errorMessage: `Dépassement du solde contrat : ${activeContract.remainingLiters} L restants sur le contrat, ${quantityLiters} L demandés.`,
    };
  }

  // 5. Resolve Distribution Order, Item, and Authoritative Fuel Session
  let resolvedOrderItem: any = null;
  let resolvedOrder: any = null;
  let resolvedSessionId: string | null = null;

  if (itemId) {
    const itemRecords = await db
      .select()
      .from(distributionOrderItems)
      .where(eq(distributionOrderItems.id, itemId))
      .limit(1);
    if (itemRecords.length > 0) {
      resolvedOrderItem = itemRecords[0];
      if (resolvedOrderItem.vehicleId !== vehicleId) {
        return {
          success: false,
          errorCode: 'VEHICLE_ITEM_MISMATCH',
          errorMessage: "L'élément de programme ne correspond pas au véhicule spécifié.",
        };
      }
    }
  } else if (orderId) {
    const itemRecords = await db
      .select()
      .from(distributionOrderItems)
      .where(
        and(
          eq(distributionOrderItems.orderId, orderId),
          eq(distributionOrderItems.vehicleId, vehicleId),
          eq(distributionOrderItems.isServed, false)
        )
      )
      .orderBy(distributionOrderItems.sequenceOrder)
      .limit(1);
    if (itemRecords.length > 0) {
      resolvedOrderItem = itemRecords[0];
    }
  } else {
    // Automatic fallback: find unserved item in any active distribution order for this vehicle
    const itemRecords = await db
      .select({
        item: distributionOrderItems,
        order: distributionOrders,
      })
      .from(distributionOrderItems)
      .innerJoin(distributionOrders, eq(distributionOrderItems.orderId, distributionOrders.id))
      .where(
        and(
          eq(distributionOrderItems.vehicleId, vehicleId),
          eq(distributionOrderItems.isServed, false),
          eq(distributionOrders.status, 'ACTIVE')
        )
      )
      .orderBy(distributionOrderItems.sequenceOrder)
      .limit(1);
    if (itemRecords.length > 0) {
      resolvedOrderItem = itemRecords[0].item;
      resolvedOrder = itemRecords[0].order;
      resolvedSessionId = resolvedOrder.sessionId;
    }
  }

  // If item was resolved by itemId or orderId, load its parent distribution order
  if (resolvedOrderItem && !resolvedOrder) {
    const orderRecords = await db
      .select()
      .from(distributionOrders)
      .where(eq(distributionOrders.id, resolvedOrderItem.orderId))
      .limit(1);
    if (orderRecords.length > 0) {
      resolvedOrder = orderRecords[0];
      resolvedSessionId = resolvedOrder.sessionId;
    }
  }

  // The program's session takes authoritative priority over any generic active session fallback!
  let session: any = null;
  const targetSessionId = resolvedSessionId || customSessionId;

  if (targetSessionId) {
    const s = await db.select().from(fuelSessions).where(eq(fuelSessions.id, targetSessionId)).limit(1);
    if (s.length === 0) {
      return {
        success: false,
        errorCode: 'SESSION_NOT_FOUND',
        errorMessage: 'La session de cuve associée à ce programme est introuvable.',
      };
    }
    session = s[0];
  } else {
    // Only standalone distribution without any program falls back to current active session
    const activeSessions = await db
      .select()
      .from(fuelSessions)
      .where(eq(fuelSessions.status, 'Active'))
      .orderBy(desc(fuelSessions.startedAt))
      .limit(1);
    session = activeSessions[0];
  }

  if (!session) {
    return {
      success: false,
      errorCode: 'NO_SESSION_AVAILABLE',
      errorMessage: 'Aucune session de cuve disponible pour cette distribution.',
    };
  }

  const sessionRemaining = session.fuelIn - session.fuelOut;

  // SESSION STOCK CHECK: sufficient physical liters in tank
  if (sessionRemaining <= 0) {
    return {
      success: false,
      errorCode: 'INSUFFICIENT_STOCK',
      errorMessage: `La session de cuve ${session.number} est totalement épuisée (0 L disponible).`,
    };
  }

  if (quantityLiters > sessionRemaining) {
    return {
      success: false,
      errorCode: 'INSUFFICIENT_STOCK',
      errorMessage: `Stock insuffisant en cuve pour ${session.number} : ${sessionRemaining} L disponibles en citerne, ${quantityLiters} L demandés.`,
    };
  }

  // 6. Effective Pricing & Financial Breakdown
  // The contract maintains its own effective price for contract balances
  const effectiveContractPrice = activeContract.contractPricePerLiter;
  const contractDeductionFBU = quantityLiters * effectiveContractPrice;

  // Transaction price snapshot (at time of pump)
  const transactionPrice = activeContract.contractPricePerLiter;
  const totalCostFBU = quantityLiters * transactionPrice;

  // 7. REAL DATABASE TRANSACTION
  // Wrap all updates inside client connection transaction to ensure all succeed or all rollback
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Concurrency verification / double check contract balance inside transaction
    const contractCheckRes = await client.query(
      'SELECT id, remaining_liters, consumed_liters, contracted_liters, amount_paid_fbu, consumed_amount_fbu, status FROM contracts WHERE id = $1 FOR UPDATE',
      [activeContract.id]
    );

    if (contractCheckRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, errorCode: 'CONTRACT_NOT_FOUND', errorMessage: 'Contrat introuvable lors du verrouillage.' };
    }

    const lockedContract = contractCheckRes.rows[0];
    if (lockedContract.status !== 'ACTIVE' || lockedContract.remaining_liters < quantityLiters) {
      await client.query('ROLLBACK');
      return {
        success: false,
        errorCode: 'INSUFFICIENT_CONTRACT_BALANCE',
        errorMessage: `Solde contrat insuffisant ou indisponible (${lockedContract.remaining_liters} L disponibles).`,
      };
    }

    // Concurrency verification / lock fuel session
    const sessionCheckRes = await client.query(
      'SELECT id, fuel_in, fuel_out, status FROM fuel_sessions WHERE id = $1 FOR UPDATE',
      [session.id]
    );

    if (sessionCheckRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, errorCode: 'SESSION_NOT_FOUND', errorMessage: 'Session de carburant introuvable lors du verrouillage.' };
    }

    const lockedSession = sessionCheckRes.rows[0];
    const curRemainingSession = lockedSession.fuel_in - lockedSession.fuel_out;
    const isProgramDistribution = !!(resolvedSessionId || resolvedOrder || resolvedOrderItem);
    if ((!isProgramDistribution && lockedSession.status !== 'Active') || curRemainingSession < quantityLiters) {
      await client.query('ROLLBACK');
      return {
        success: false,
        errorCode: 'INSUFFICIENT_STOCK',
        errorMessage: `Stock en cuve insuffisant (${curRemainingSession} L disponibles).`,
      };
    }

    // A. Insert Distribution Record
    const distributionId = uuidv4();
    const now = new Date();
    await client.query(
      `INSERT INTO fuel_distributions (
        id, idempotency_key, contract_id, session_id, organization_id, vehicle_id,
        location_id, recorded_by, quantity_liters, price_per_liter, total_cost_fbu,
        vehicle_registration_snapshot, organization_name_snapshot, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        distributionId,
        idempotencyKey || null,
        activeContract.id,
        session.id,
        customer.id,
        vehicle.id,
        locationId,
        userId,
        quantityLiters,
        transactionPrice,
        totalCostFBU,
        vehicle.registration,
        customer.name,
        now,
      ]
    );

    // B. Deduct Fuel Session
    const newFuelOut = lockedSession.fuel_out + quantityLiters;
    const sessionShouldClose = newFuelOut >= lockedSession.fuel_in;
    await client.query(
      `UPDATE fuel_sessions SET
        fuel_out = $1,
        status = CASE WHEN $2 THEN 'Terminée' ELSE status END,
        ended_at = CASE WHEN $2 THEN $3 ELSE ended_at END
      WHERE id = $4`,
      [newFuelOut, sessionShouldClose, now, session.id]
    );

    // C. Deduct Contract
    const newConsumedLiters = lockedContract.consumed_liters + quantityLiters;
    const newRemainingLiters = Math.max(0, lockedContract.contracted_liters - newConsumedLiters);
    const newConsumedAmount = lockedContract.consumed_amount_fbu + contractDeductionFBU;
    const newRemainingAmount = Math.max(0, lockedContract.amount_paid_fbu - newConsumedAmount);
    const contractIsExhausted = newRemainingLiters === 0;

    await client.query(
      `UPDATE contracts SET
        consumed_liters = $1,
        remaining_liters = $2,
        consumed_amount_fbu = $3,
        remaining_amount_fbu = $4,
        status = CASE WHEN $5 THEN 'EXHAUSTED' ELSE status END,
        updated_at = $6
      WHERE id = $7`,
      [
        newConsumedLiters,
        newRemainingLiters,
        newConsumedAmount,
        newRemainingAmount,
        contractIsExhausted,
        now,
        activeContract.id,
      ]
    );

    // D. Update Vehicle Total Received Liters
    await client.query(
      `UPDATE vehicles SET
        total_received_liters = total_received_liters + $1,
        updated_at = $2
      WHERE id = $3`,
      [quantityLiters, now, vehicle.id]
    );

    // E. Update Distribution Order Item Status if in queue
    if (resolvedOrderItem) {
      await client.query(
        `UPDATE distribution_order_items SET
          is_served = true,
          status = 'SERVED',
          served_at = $1
        WHERE id = $2`,
        [now, resolvedOrderItem.id]
      );
    } else {
      await client.query(
        `UPDATE distribution_order_items SET
          is_served = true,
          status = 'SERVED',
          served_at = $1
        WHERE id IN (
          SELECT id FROM distribution_order_items
          WHERE vehicle_id = $2 AND is_served = false
          LIMIT 1
        )`,
        [now, vehicle.id]
      );
    }

    await client.query('COMMIT');

    const createdDistribution = {
      id: distributionId,
      idempotencyKey: idempotencyKey || null,
      contractId: activeContract.id,
      sessionId: session.id,
      organizationId: customer.id,
      vehicleId: vehicle.id,
      locationId: locationId!,
      recordedBy: userId,
      quantityLiters,
      pricePerLiter: transactionPrice,
      totalCostFBU,
      vehicleRegistrationSnapshot: vehicle.registration,
      organizationNameSnapshot: customer.name,
      createdAt: now,
    };

    return {
      success: true,
      distribution: createdDistribution,
      remainingFuel: Math.max(0, lockedSession.fuel_in - newFuelOut),
      remainingContractLiters: newRemainingLiters,
      message: `Distribution de ${quantityLiters} L enregistrée avec succès pour ${vehicle.registration} (${customer.name}). Solde contrat restant : ${newRemainingLiters} L.`,
    };
  } catch (txError: any) {
    await client.query('ROLLBACK');
    console.error('[TRANSACTION ERROR] Fuel distribution failed and rolled back:', txError);
    return {
      success: false,
      errorCode: 'TRANSACTION_FAILED',
      errorMessage: `Échec de l'enregistrement transactionnel : ${txError.message || 'Erreur base de données.'}`,
    };
  } finally {
    client.release();
  }
}

