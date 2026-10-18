export type TabType = 'accueil' | 'distribution' | 'gestion' | 'plus' | 'historique';

/**
 * Fuel intake / tank supply session
 * Represents physical fuel delivered to the central depot/pump.
 */
export interface FuelSession {
  id: string;
  number: string; // e.g. "Session #004"
  date: string; // e.g. "28 septembre 2026"
  pricePerLiter: number; // e.g. 3950 FBU/L
  status: 'Active' | 'Terminée';
  fuelIn: number; // Quantité entrée (L)
  fuelOut: number; // Sortie / Consommée (L)
  fuelRemaining: number; // Restante (L) = fuelIn - fuelOut
  totalFuelValue: number; // Valeur totale du carburant reçu (fuelIn * pricePerLiter)
  distributedFuelValue: number; // Valeur du carburant distribué (fuelOut * pricePerLiter)
  remainingFuelValue: number; // Valeur du carburant restant (fuelRemaining * pricePerLiter)
  notes?: string;
}

export type OrgType = 'Hôpital' | 'Entreprise' | 'ONG' | 'Logistique' | 'Service Public';

/**
 * Organization entity: pure identity, category, and location/contact
 */
export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  customerType?: 'ORGANIZATION' | 'INDIVIDUAL';
  location: string;
  contactPerson: string;
  phone: string;
  vehicleCount: number;
  actualPrepaidMoney: number; // Actual advance funds prepaid by this organization (FBU)
}

/**
 * Fuel Allocation/Request:
 * Separated from Organization identity so dotations and requests
 * can span across sessions and track exactly what was requested, received, and remains.
 * Survives when a Session ends.
 */
export interface FuelAllocation {
  id: string;
  organizationId: string;
  fuelRequested: number; // Litres demandés
  fuelReceived: number; // Litres reçus
  fuelWaiting: number; // Litres restants à recevoir = fuelRequested - fuelReceived
  notes?: string;
  lastUpdated?: string;
}

/**
 * Vehicle entity: assigned to an organization
 */
export interface Vehicle {
  id: string;
  registration: string; // Plaque d'immatriculation (e.g. "AB 1234")
  type: string; // "Ambulance", "Pickup 4x4", "Camion", etc.
  organizationId: string;
  organizationName: string;
  totalReceivedLiters: number;
  driverName?: string;
}

/**
 * Fuel Distribution transaction:
 * Keyed strictly by vehicleId (not registration) to guarantee foreign key integrity,
 * while storing snapshot metadata for display.
 */
export interface FuelDistribution {
  id: string;
  sessionId: string;
  organizationId: string;
  organizationName: string;
  vehicleId: string; // Foreign key referencing Vehicle.id
  vehicleRegistrationSnapshot: string;
  quantityLiters: number;
  pricePerLiter: number;
  totalCostFBU: number; // quantityLiters * pricePerLiter
  dateTime: string; // e.g. "Aujourd'hui · 14:32"
  timestamp: string; // ISO date for sorting
  recordedBy: string;
}

/**
 * Historic distribution log per vehicle
 */
export interface VehicleDistributionRecord {
  date: string;
  quantityLiters: number;
  costFBU: number;
  stationOrPump?: string;
}

export type CustomerType = 'ORGANIZATION' | 'INDIVIDUAL';
export type ContractStatus = 'ACTIVE' | 'EXHAUSTED' | 'SUSPENDED';

export interface CustomerContract {
  id: string;
  organizationId: string;
  customerName: string;
  customerOrgType?: string;
  customerType: CustomerType;
  customerLocation?: string;
  customerContact?: string;
  customerPhone?: string;
  customerIsActive?: boolean;
  startDate: string;
  contractedLiters: number;
  amountPaidFBU: number;
  contractPricePerLiter: number;
  consumedLiters: number;
  consumedAmountFBU: number;
  remainingLiters: number;
  remainingAmountFBU: number;
  status: ContractStatus;
  createdBy?: string;
  creatorName?: string;
  createdAt: string;
  updatedAt: string;
  vehiclesCount?: number;
  vehicles?: {
    id: string;
    registration: string;
    type: string;
    driverName?: string;
    isActive: boolean;
  }[];
}

export type ProgramCategory = 'UPCOMING' | 'TODAY' | 'PAST';

export interface DistributionOrder {
  id: string;
  title: string;
  displayName?: string;
  scheduledDate: string; // YYYY-MM-DD
  sessionId: string;
  sessionNumber?: string;
  locationId: string;
  locationName?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  category?: ProgramCategory;
  categoryLabel?: string;
  totalVehicles?: number;
  servedVehicles?: number;
  totalDistributedLiters?: number;
  createdBy?: string;
  createdAt: string;
}

export interface DistributionOrderItem {
  id: string;
  orderId: string;
  vehicleId: string;
  sequenceOrder: number;
  suggestedLiters: number;
  status: 'WAITING' | 'CURRENT' | 'SERVED' | 'ABSENT';
  isServed: boolean;
  servedAt?: string | null;
  registration: string;
  vehicleType: string;
  driverName?: string;
  organizationId: string;
  organizationName: string;
}

export interface SessionDetailResponse {
  session: {
    id: string;
    number: string;
    fuelIn: number;
    fuelOut: number;
    fuelRemaining: number;
    pricePerLiter: number;
    status: 'Active' | 'Terminée';
    startedAt: string;
    endedAt?: string | null;
    notes?: string;
  };
  programs: {
    id: string;
    title: string;
    scheduledDate: string;
    status: string;
    category?: string;
    totalVehicles: number;
    servedVehicles: number;
    totalDistributedLiters: number;
    createdAt: string;
  }[];
  analytics: {
    participatingProgramsCount: number;
    totalVehiclesServed: number;
    totalValueDistributedFBU: number;
  };
}
