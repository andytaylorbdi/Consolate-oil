import { pgTable, text, integer, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * USERS TABLE
 * Roles: WORKER or ADMIN
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  adminPinHash: text('admin_pin_hash'), // Required for ADMIN sensitive operations
  name: text('name').notNull(),
  role: text('role').notNull().$type<'WORKER' | 'ADMIN'>(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * SESSIONS TABLE (Server-side authenticated sessions)
 */
export const authSessions = pgTable('auth_sessions', {
  id: text('id').primaryKey(), // Session token / ID
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * LOCATIONS TABLE (Pumps, Depots, Distribution Stations)
 */
export const locations = pgTable('locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(), // e.g. "DEPOT-01", "POMPE-01"
  city: text('city').notNull().default('Bujumbura'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * WORK ASSIGNMENTS TABLE (Historical tracking of worker locations)
 * A worker's current assignment is the one with endAt IS NULL.
 */
export const workAssignments = pgTable('work_assignments', {
  id: text('id').primaryKey(),
  workerId: text('worker_id').notNull().references(() => users.id),
  locationId: text('location_id').notNull().references(() => locations.id),
  startAt: timestamp('start_at').defaultNow().notNull(),
  endAt: timestamp('end_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * ORGANIZATIONS TABLE
 * Legal entity identity, contact, and category.
 */
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().$type<'Hôpital' | 'Entreprise' | 'ONG' | 'Logistique' | 'Service Public'>(),
  customerType: text('customer_type').notNull().$type<'ORGANIZATION' | 'INDIVIDUAL'>().default('ORGANIZATION'),
  location: text('location').notNull(),
  contactPerson: text('contact_person').notNull(),
  phone: text('phone').notNull(),
  actualPrepaidMoney: integer('actual_prepaid_money').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * VEHICLES TABLE
 * Permanent registry of vehicles belonging to organizations / individuals.
 */
export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  registration: text('registration').notNull().unique(), // Plaque d'immatriculation (e.g. "AB 1234")
  type: text('type').notNull(), // Ambulance, Pickup, etc.
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  driverName: text('driver_name').notNull().default('Non assigné'),
  totalReceivedLiters: integer('total_received_liters').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * CONTRACTS TABLE
 * Authoritative prepaid fuel contract per customer (Organization or Individual).
 * Exactly one ACTIVE contract per customer at a time.
 * Statuses: ACTIVE, EXHAUSTED, SUSPENDED. No expiration date.
 */
export const contracts = pgTable('contracts', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  customerType: text('customer_type').notNull().$type<'ORGANIZATION' | 'INDIVIDUAL'>(),
  startDate: timestamp('start_date').notNull(),
  contractedLiters: integer('contracted_liters').notNull(),
  amountPaidFBU: integer('amount_paid_fbu').notNull(),
  contractPricePerLiter: integer('contract_price_per_liter').notNull(),
  consumedLiters: integer('consumed_liters').notNull().default(0),
  consumedAmountFBU: integer('consumed_amount_fbu').notNull().default(0),
  remainingLiters: integer('remaining_liters').notNull(),
  remainingAmountFBU: integer('remaining_amount_fbu').notNull(),
  status: text('status').notNull().$type<'ACTIVE' | 'EXHAUSTED' | 'SUSPENDED'>().default('ACTIVE'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * FUEL SESSIONS TABLE
 * Physical fuel intake batches delivered to the central depot.
 */
export const fuelSessions = pgTable('fuel_sessions', {
  id: text('id').primaryKey(),
  number: text('number').notNull().unique(), // e.g. "Session #004"
  fuelIn: integer('fuel_in').notNull(), // Total received (L)
  fuelOut: integer('fuel_out').notNull().default(0), // Total distributed (L)
  pricePerLiter: integer('price_per_liter').notNull(), // Fixed baseline price for this session (FBU/L)
  status: text('status').notNull().$type<'Active' | 'Terminée'>().default('Active'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * FUEL PRICES TABLE
 * Master price history controlled by Admin.
 */
export const fuelPrices = pgTable('fuel_prices', {
  id: text('id').primaryKey(),
  pricePerLiter: integer('price_per_liter').notNull(), // in FBU (e.g. 3950)
  effectiveFrom: timestamp('effective_from').defaultNow().notNull(),
  effectiveTo: timestamp('effective_to'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * FUEL ALLOCATIONS TABLE
 * Organization quota/request. Survives across multiple sessions.
 */
export const fuelAllocations = pgTable('fuel_allocations', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  requestedLiters: integer('requested_liters').notNull(),
  receivedLiters: integer('received_liters').notNull().default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * DISTRIBUTION ORDERS & ITEMS
 * Operational vehicle order dispatched by Admin for Workers to follow.
 */
export const distributionOrders = pgTable('distribution_orders', {
  id: text('id').primaryKey(),
  title: text('title').notNull(), // e.g. "Programme du 06/10/2026"
  scheduledDate: text('scheduled_date').notNull().default('2026-10-05'), // Format YYYY-MM-DD for timezone-safe date matching
  sessionId: text('session_id').notNull().references(() => fuelSessions.id),
  locationId: text('location_id').notNull().references(() => locations.id),
  status: text('status').notNull().$type<'ACTIVE' | 'COMPLETED' | 'CANCELLED'>().default('ACTIVE'),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const distributionOrderItems = pgTable('distribution_order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => distributionOrders.id, { onDelete: 'cascade' }),
  vehicleId: text('vehicle_id').notNull().references(() => vehicles.id),
  sequenceOrder: integer('sequence_order').notNull(), // 1, 2, 3... (for drag-and-drop ordering)
  suggestedLiters: integer('suggested_liters').notNull().default(100),
  status: text('status').notNull().$type<'WAITING' | 'CURRENT' | 'SERVED' | 'ABSENT'>().default('WAITING'),
  isServed: boolean('is_served').notNull().default(false),
  servedAt: timestamp('served_at'),
});

/**
 * FUEL DISTRIBUTIONS TABLE
 * Immutable record of actual finalized fuel dispensation.
 */
export const fuelDistributions = pgTable('fuel_distributions', {
  id: text('id').primaryKey(),
  idempotencyKey: text('idempotency_key').unique(), // Protect against duplicate submissions
  contractId: text('contract_id').references(() => contracts.id),
  sessionId: text('session_id').notNull().references(() => fuelSessions.id),
  organizationId: text('organization_id').notNull().references(() => organizations.id),
  vehicleId: text('vehicle_id').notNull().references(() => vehicles.id),
  locationId: text('location_id').notNull().references(() => locations.id),
  recordedBy: text('recorded_by').notNull().references(() => users.id),
  quantityLiters: integer('quantity_liters').notNull(),
  pricePerLiter: integer('price_per_liter').notNull(), // Price snapshot at time of pump
  totalCostFBU: integer('total_cost_fbu').notNull(), // Calculated server-side
  vehicleRegistrationSnapshot: text('vehicle_registration_snapshot').notNull(),
  organizationNameSnapshot: text('organization_name_snapshot').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * CORRECTION REQUESTS TABLE
 * Immutable audit trail for requested modifications to finalized distributions.
 */
export const correctionRequests = pgTable('correction_requests', {
  id: text('id').primaryKey(),
  distributionId: text('distribution_id').notNull().references(() => fuelDistributions.id),
  requestedBy: text('requested_by').notNull().references(() => users.id),
  reason: text('reason').notNull(),
  proposedLiters: integer('proposed_liters').notNull(),
  status: text('status').notNull().$type<'PENDING' | 'APPROVED' | 'REJECTED'>().default('PENDING'),
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * AUDIT LOGS TABLE
 * Sensitive administrative operations tracking.
 */
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(), // e.g. "PIN_VERIFIED", "SESSION_CREATED", "PRICE_CHANGED"
  entityType: text('entity_type').notNull(), // "organization", "session", "price", etc.
  entityId: text('entity_id'),
  details: text('details'), // JSON stringified details
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * RELATIONS
 */
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(authSessions),
  workAssignments: many(workAssignments),
  distributionsRecorded: many(fuelDistributions),
  correctionRequests: many(correctionRequests),
  contractsCreated: many(contracts),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  vehicles: many(vehicles),
  allocations: many(fuelAllocations),
  distributions: many(fuelDistributions),
  contracts: many(contracts),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [contracts.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [contracts.createdBy],
    references: [users.id],
  }),
  distributions: many(fuelDistributions),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [vehicles.organizationId],
    references: [organizations.id],
  }),
  distributions: many(fuelDistributions),
  orderItems: many(distributionOrderItems),
}));

export const fuelSessionsRelations = relations(fuelSessions, ({ many }) => ({
  distributions: many(fuelDistributions),
  distributionOrders: many(distributionOrders),
}));

export const fuelDistributionsRelations = relations(fuelDistributions, ({ one, many }) => ({
  contract: one(contracts, {
    fields: [fuelDistributions.contractId],
    references: [contracts.id],
  }),
  session: one(fuelSessions, {
    fields: [fuelDistributions.sessionId],
    references: [fuelSessions.id],
  }),
  organization: one(organizations, {
    fields: [fuelDistributions.organizationId],
    references: [organizations.id],
  }),
  vehicle: one(vehicles, {
    fields: [fuelDistributions.vehicleId],
    references: [vehicles.id],
  }),
  location: one(locations, {
    fields: [fuelDistributions.locationId],
    references: [locations.id],
  }),
  recorder: one(users, {
    fields: [fuelDistributions.recordedBy],
    references: [users.id],
  }),
  corrections: many(correctionRequests),
}));
