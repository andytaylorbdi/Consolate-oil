import { ApiResponse, User, WorkerDashboardData } from '../types/api.ts';

// Token storage in memory/sessionStorage for iframe environments where third-party cookies might be blocked
let authToken: string | null = null;
try {
  authToken = sessionStorage.getItem('consolate_session_token');
} catch {
  // safe fallback
}

export function setAuthToken(token: string | null) {
  authToken = token;
  try {
    if (token) {
      sessionStorage.setItem('consolate_session_token', token);
    } else {
      sessionStorage.removeItem('consolate_session_token');
    }
  } catch {
    // safe fallback
  }
}

/**
 * Centralized fetch client ensuring all authenticated API requests
 * send credentials (cookies) with credentials: 'include' and Authorization header fallback.
 */
async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (authToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    });

    try {
      const json = await res.json();
      return json;
    } catch {
      return {
        success: false,
        error: { code: 'INVALID_JSON', message: 'Réponse serveur non valide.' },
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'NETWORK_ERROR', message: err?.message || 'Erreur réseau.' },
    };
  }
}

export const api = {
  // Authentication
  auth: {
    async login(email: string, password: string): Promise<ApiResponse<{ user: User }>> {
      return apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },

    async logout(): Promise<ApiResponse> {
      return apiFetch('/api/auth/logout', { method: 'POST' });
    },

    async me(): Promise<ApiResponse<{ user: User }>> {
      return apiFetch('/api/auth/me');
    },

    async verifyPin(pin: string): Promise<ApiResponse> {
      return apiFetch('/api/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
    },
  },

  // Worker Endpoints
  worker: {
    async getDashboard(): Promise<ApiResponse<WorkerDashboardData>> {
      return apiFetch('/api/worker/dashboard');
    },

    async getQueue(): Promise<ApiResponse<{ order: any; queue: any[] }>> {
      return apiFetch('/api/worker/queue');
    },

    async recordDistribution(
      vehicleId: string,
      quantityLiters: number,
      idempotencyKey?: string,
      itemId?: string,
      orderId?: string
    ): Promise<ApiResponse<{ distribution: any; remainingFuel: number; message: string }>> {
      return apiFetch('/api/worker/distributions', {
        method: 'POST',
        body: JSON.stringify({ vehicleId, quantityLiters, idempotencyKey, itemId, orderId }),
      });
    },

    async requestCorrection(
      distributionId: string,
      reason: string,
      proposedLiters: number
    ): Promise<ApiResponse> {
      return apiFetch('/api/worker/corrections', {
        method: 'POST',
        body: JSON.stringify({ distributionId, reason, proposedLiters }),
      });
    },
  },

  // Admin Endpoints
  admin: {
    async getOverview(): Promise<ApiResponse> {
      return apiFetch('/api/admin/overview');
    },

    async getDistributionOrders(orderId?: string): Promise<ApiResponse<{ activeOrder: any; operationalOrders: any[]; allOrders: any[]; todayDate: string; items: any[] }>> {
      return apiFetch(`/api/admin/distribution-orders${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''}`);
    },

    async getDistributionOrder(id: string): Promise<ApiResponse<{ order: any; session: any; location: any; items: any[] }>> {
      return apiFetch(`/api/admin/distribution-orders/${id}`);
    },

    async createDistributionOrder(data: { scheduledDate: string; sessionId: string; locationId: string; vehicleIds: string[]; title?: string }): Promise<ApiResponse> {
      return apiFetch('/api/admin/distribution-orders', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async reorderOrderItems(orderedItemIds: string[]): Promise<ApiResponse> {
      return apiFetch('/api/admin/distribution-orders/items/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ orderedItemIds }),
      });
    },

    async updateOrderItemStatus(itemId: string, status: 'WAITING' | 'CURRENT' | 'SERVED' | 'ABSENT'): Promise<ApiResponse> {
      return apiFetch(`/api/admin/distribution-orders/items/${itemId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },

    async recordFuelDistribution(data: {
      vehicleId: string;
      quantityLiters: number;
      idempotencyKey?: string;
      itemId?: string;
      orderId?: string;
    }): Promise<ApiResponse> {
      return apiFetch('/api/admin/record-distribution', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async getOrganizations(): Promise<ApiResponse<{ organizations: any[] }>> {
      return apiFetch('/api/admin/organizations');
    },

    async createOrganization(data: any): Promise<ApiResponse<{ organization: any; vehicle?: any }>> {
      return apiFetch('/api/admin/organizations', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateOrganization(id: string, data: any): Promise<ApiResponse> {
      return apiFetch(`/api/admin/organizations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async toggleOrganization(id: string): Promise<ApiResponse> {
      return apiFetch(`/api/admin/organizations/${id}/toggle-active`, { method: 'PATCH' });
    },

    async getVehicles(): Promise<ApiResponse<{ vehicles: any[] }>> {
      return apiFetch('/api/admin/vehicles');
    },

    async createVehicle(data: any): Promise<ApiResponse> {
      return apiFetch('/api/admin/vehicles', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateVehicle(id: string, data: any): Promise<ApiResponse> {
      return apiFetch(`/api/admin/vehicles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async toggleVehicle(id: string): Promise<ApiResponse> {
      return apiFetch(`/api/admin/vehicles/${id}/toggle-active`, { method: 'PATCH' });
    },

    async getWorkers(): Promise<ApiResponse<{ workers: any[]; locations: any[] }>> {
      return apiFetch('/api/admin/workers');
    },

    async createWorker(data: any): Promise<ApiResponse> {
      return apiFetch('/api/admin/workers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateWorker(id: string, data: any): Promise<ApiResponse> {
      return apiFetch(`/api/admin/workers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async getPrices(): Promise<ApiResponse<{ prices: any[] }>> {
      return apiFetch('/api/admin/prices');
    },

    async createPrice(pricePerLiter: number): Promise<ApiResponse> {
      return apiFetch('/api/admin/prices', {
        method: 'POST',
        body: JSON.stringify({ pricePerLiter }),
      });
    },

    async getSessions(): Promise<ApiResponse<{ sessions: any[] }>> {
      return apiFetch('/api/admin/sessions');
    },

    async getSession(id: string): Promise<ApiResponse<{ session: any; programs: any[]; analytics: any }>> {
      return apiFetch(`/api/admin/sessions/${id}`);
    },

    async createSession(data: any): Promise<ApiResponse> {
      return apiFetch('/api/admin/sessions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async updateSession(id: string, data: any): Promise<ApiResponse> {
      return apiFetch(`/api/admin/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    async getHistory(): Promise<ApiResponse<{ sessions: any[]; distributions: any[]; prices: any[]; orders: any[]; corrections: any[] }>> {
      return apiFetch('/api/admin/history');
    },

    async reviewCorrection(id: string, action: 'APPROVE' | 'REJECT', rejectionReason?: string): Promise<ApiResponse> {
      return apiFetch(`/api/admin/corrections/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, rejectionReason }),
      });
    },

    // Contracts Management
    async getContracts(params?: { status?: string; search?: string; customerType?: string }): Promise<ApiResponse<{ contracts: any[]; summary: any }>> {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.customerType) searchParams.set('customerType', params.customerType);
      if (params?.search) searchParams.set('search', params.search);
      const qs = searchParams.toString();
      return apiFetch(`/api/admin/contracts${qs ? `?${qs}` : ''}`);
    },

    async getContract(id: string): Promise<ApiResponse<{ contract: any; customer: any; vehicles: any[]; distributions: any[] }>> {
      return apiFetch(`/api/admin/contracts/${id}`);
    },

    async createContract(data: {
      customerType: 'ORGANIZATION' | 'INDIVIDUAL';
      organizationId: string;
      contractedLiters: number;
      startDate: string;
    }): Promise<ApiResponse<{ contract: any }>> {
      return apiFetch('/api/admin/contracts', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async suspendContract(id: string, reason?: string): Promise<ApiResponse> {
      return apiFetch(`/api/admin/contracts/${id}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      });
    },

    async reactivateContract(id: string): Promise<ApiResponse> {
      return apiFetch(`/api/admin/contracts/${id}/reactivate`, {
        method: 'PATCH',
      });
    },
  },
};
