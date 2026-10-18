export interface User {
  id: string;
  email: string;
  name: string;
  role: 'WORKER' | 'ADMIN';
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface Location {
  id: string;
  name: string;
  code: string;
  city: string;
}

export interface FuelSessionInfo {
  id: string;
  number: string;
  fuelIn: number;
  fuelOut: number;
  fuelRemaining: number;
  pricePerLiter: number;
  status: 'Active' | 'Terminée';
}

export interface NextVehicleQueueItem {
  itemId: string;
  orderId?: string;
  sessionId?: string;
  sequenceOrder: number;
  suggestedLiters: number;
  vehicleId: string;
  registration: string;
  type: string;
  driverName: string;
  organizationId: string;
  organizationName: string;
  contractPricePerLiter?: number | null;
}

export interface WorkerDashboardData {
  worker: User;
  currentLocation: Location | null;
  currentSession: FuelSessionInfo | null;
  distributionOrder: any;
  nextVehicle: NextVehicleQueueItem | null;
  ownActivityCount: number;
  ownTodayLiters?: number;
  recentDistributions: any[];
  pendingCorrections: any[];
}
