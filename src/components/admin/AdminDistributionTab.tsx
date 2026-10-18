import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import {
  Truck,
  Plus,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserX,
  Fuel,
  Play,
  X,
  GripVertical,
  Calendar,
  Layers,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import {
  formatNumber,
  formatFBU,
  formatPricePerLiter,
  formatProgramTitle,
  getTodayDateStr,
} from '../../utils/formatters.ts';

export const AdminDistributionTab: React.FC = () => {
  const [data, setData] = useState<{
    activeOrder: any;
    operationalOrders: any[];
    allOrders: any[];
    todayDate: string;
    items: any[];
  } | null>(null);
  const [contractsList, setContractsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Modal State for Creating a Scheduled Distribution Program
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState<string>(getTodayDateStr());
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessions, setSessions] = useState<any[]>([]);
  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [createWarning, setCreateWarning] = useState<string | null>(null);

  // Manual Fuel Dispensation Modal (Admin Recording)
  const [manualDistItem, setManualDistItem] = useState<any | null>(null);
  const [manualLiters, setManualLiters] = useState('100');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualFeedback, setManualFeedback] = useState<string | null>(null);

  const fetchDistributionData = async (orderIdToSelect?: string) => {
    try {
      const targetId = orderIdToSelect ?? selectedOrderId ?? undefined;
      const [res, contractsRes] = await Promise.all([
        api.admin.getDistributionOrders(targetId),
        api.admin.getContracts(),
      ]);
      if (res.success && res.data) {
        setData(res.data);
        if (res.data.activeOrder) {
          setSelectedOrderId(res.data.activeOrder.id);
        }
      }
      if (contractsRes.success && contractsRes.data) {
        setContractsList(contractsRes.data.contracts || []);
      }
    } catch (err) {
      console.error('Failed to load distribution programs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCreationPrerequisites = async () => {
    try {
      const [orgsRes, vehsRes, histRes, workersRes, contractsRes] = await Promise.all([
        api.admin.getOrganizations(),
        api.admin.getVehicles(),
        api.admin.getHistory(),
        api.admin.getWorkers(),
        api.admin.getContracts(),
      ]);

      if (orgsRes.success && orgsRes.data) setOrgs(orgsRes.data.organizations);
      if (vehsRes.success && vehsRes.data) setAvailableVehicles(vehsRes.data.vehicles);
      if (contractsRes.success && contractsRes.data) setContractsList(contractsRes.data.contracts || []);
      if (histRes.success && histRes.data) {
        const activeSess = (histRes.data.sessions || []).filter(
          (s: any) => s.status === 'Active' && Math.max(0, s.fuelIn - s.fuelOut) > 0
        );
        setSessions(activeSess);
        if (activeSess.length > 0) {
          setSelectedSessionId(activeSess[0].id);
        } else {
          setSelectedSessionId('');
        }
      }
      if (workersRes.success && workersRes.data) {
        setLocationsList(workersRes.data.locations || []);
        if (workersRes.data.locations?.[0]) setSelectedLocationId(workersRes.data.locations[0].id);
      }
    } catch (err) {
      console.error('Failed to load prerequisites:', err);
    }
  };

  useEffect(() => {
    fetchDistributionData();
  }, []);

  const handleSelectProgram = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsLoading(true);
    await fetchDistributionData(orderId);
  };

  const handleOpenCreateModal = async () => {
    await loadCreationPrerequisites();
    setScheduledDate(getTodayDateStr());
    setSelectedVehicles([]);
    setCreateWarning(null);
    setIsCreateModalOpen(true);
  };

  // Reorder Item Up/Down (accessible drag-and-drop equivalent with keyboard support)
  const handleMoveItem = async (index: number, direction: 'UP' | 'DOWN') => {
    if (!data?.items) return;
    const items = [...data.items];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    // Swap items
    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;

    // Update local state immediately for instant feedback
    setData({ ...data, items });

    // Persist new order on backend
    const orderedIds = items.map((i) => i.id);
    await api.admin.reorderOrderItems(orderedIds);
  };

  // Update Status (e.g. mark ABSENT or CURRENT)
  const handleUpdateStatus = async (itemId: string, newStatus: 'WAITING' | 'CURRENT' | 'SERVED' | 'ABSENT') => {
    const res = await api.admin.updateOrderItemStatus(itemId, newStatus);
    if (res.success) {
      await fetchDistributionData();
    } else {
      alert(res.error?.message || 'Erreur mise à jour statut');
    }
  };

  // Toggle vehicle selection in creation modal
  const handleToggleVehicle = (vehId: string) => {
    const next = selectedVehicles.includes(vehId)
      ? selectedVehicles.filter((id) => id !== vehId)
      : [...selectedVehicles, vehId];
    setSelectedVehicles(next);

    // Stock check warning
    const currentSession = sessions.find((s) => s.id === selectedSessionId);
    const availableFuel = currentSession ? currentSession.fuelIn - currentSession.fuelOut : 0;
    const estimatedNeeded = next.length * 100; // estimated 100L per vehicle

    if (estimatedNeeded > availableFuel) {
      setCreateWarning(
        `Attention : Le volume estimé (${estimatedNeeded} L) dépasse le stock disponible en cuve (${availableFuel} L).`
      );
    } else {
      setCreateWarning(null);
    }
  };

  const handleCreateProgramSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledDate) {
      alert('Veuillez sélectionner une date prévue.');
      return;
    }
    if (!selectedSessionId) {
      alert('Veuillez sélectionner une session active.');
      return;
    }
    if (selectedVehicles.length === 0) {
      alert('Veuillez sélectionner au moins un véhicule bénéficiaire.');
      return;
    }

    setIsSubmittingOrder(true);
    const res = await api.admin.createDistributionOrder({
      scheduledDate,
      sessionId: selectedSessionId,
      locationId: selectedLocationId,
      vehicleIds: selectedVehicles,
    });
    setIsSubmittingOrder(false);

    if (res.success) {
      setIsCreateModalOpen(false);
      const newOrderId = res.data?.order?.id;
      if (newOrderId) {
        setSelectedOrderId(newOrderId);
      }
      await fetchDistributionData(newOrderId);
    } else {
      alert(res.error?.message || 'Erreur lors de la création du programme.');
    }
  };

  // Admin Manual Distribution Recording
  const handleConfirmManualDist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDistItem) return;

    const parsedLiters = parseInt(manualLiters, 10);
    if (!parsedLiters || parsedLiters <= 0) {
      setManualFeedback('Quantité invalide.');
      return;
    }

    setIsSubmittingManual(true);
    setManualFeedback(null);

    const idempotencyKey = `admin-${manualDistItem.vehicleId}-${Date.now()}`;
    const res = await api.admin.recordFuelDistribution({
      vehicleId: manualDistItem.vehicleId,
      quantityLiters: parsedLiters,
      idempotencyKey,
      itemId: manualDistItem.id,
      orderId: manualDistItem.orderId || data?.activeOrder?.id,
    });
    setIsSubmittingManual(false);

    if (res.success) {
      setManualDistItem(null);
      await fetchDistributionData();
    } else {
      setManualFeedback(res.error?.message || "Erreur lors de l'enregistrement de la distribution.");
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 font-medium text-xs flex items-center justify-center gap-2">
        <Truck className="w-4 h-4 animate-pulse text-amber-500" />
        <span>Chargement des programmes de distribution...</span>
      </div>
    );
  }

  const activeOrder = data?.activeOrder;
  const operationalOrders = data?.operationalOrders || [];
  const items = data?.items || [];
  const todayStr = data?.todayDate || getTodayDateStr();

  // Generated auto title preview for creation modal
  const autoGeneratedTitle = formatProgramTitle(scheduledDate);

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header & Create Action */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Programmes de Distribution Opérationnels
          </span>
          <h2 className="text-base font-bold text-slate-900 mt-0.5">
            {activeOrder?.displayName || activeOrder?.title || 'Aucun programme actif'}
          </h2>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Créer un programme</span>
        </button>
      </div>

      {/* SECTION 6: OPERATIONAL PROGRAMS SELECTOR (Aujourd'hui & À venir only) */}
      {operationalOrders.length > 0 && (
        <div className="bg-white rounded-2xl p-2.5 border border-slate-200/90 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 block">
            Programmes Opérationnels ({operationalOrders.length})
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 px-1">
            {operationalOrders.map((ord) => {
              const isSelected = activeOrder?.id === ord.id;
              const isToday = ord.scheduledDate === todayStr;
              const isUpcoming = ord.scheduledDate > todayStr;

              return (
                <button
                  key={ord.id}
                  onClick={() => handleSelectProgram(ord.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <span
                    className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      isToday
                        ? isSelected
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-amber-100 text-amber-900'
                        : isUpcoming
                        ? isSelected
                          ? 'bg-blue-400 text-slate-950'
                          : 'bg-blue-100 text-blue-900'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isToday ? "Aujourd'hui" : 'À venir'}
                  </span>
                  <span>{ord.displayName || ord.title || formatProgramTitle(ord.scheduledDate)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTIVE PROGRAM VEHICLES QUEUE */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-slate-700">
            <ArrowUpDown className="w-4 h-4 text-amber-500" />
            <span>Ordre de Passage des Véhicules ({items.length})</span>
          </div>
          <span className="text-slate-400 text-[11px]">
            Position modifiable via les flèches haut/bas
          </span>
        </div>

        {items.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {items.map((item, index) => {
              const isFirst = index === 0;
              const isLast = index === items.length - 1;

              return (
                <div
                  key={item.id}
                  className={`p-3.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                    item.status === 'CURRENT'
                      ? 'bg-amber-50/70'
                      : item.status === 'ABSENT'
                      ? 'bg-rose-50/50 opacity-70'
                      : item.status === 'SERVED'
                      ? 'bg-slate-50/80 text-slate-400'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Position number and Reorder Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-mono-num font-bold text-slate-700 text-xs">
                      #{item.sequenceOrder}
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveItem(index, 'UP')}
                        disabled={isFirst}
                        className="p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-20"
                        title="Monter d'une position"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMoveItem(index, 'DOWN')}
                        disabled={isLast}
                        className="p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-20"
                        title="Descendre d'une position"
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  {/* Vehicle Details & Contract Status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono-num font-black text-sm text-slate-950">
                        {item.registration}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-bold text-slate-800 truncate">
                        {item.organizationName}
                      </span>
                      {(() => {
                        const activeC = contractsList.find((c) => c.organizationId === item.organizationId && c.status === 'ACTIVE');
                        if (activeC) {
                          return (
                            <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">
                              Solde : {formatNumber(activeC.remainingLiters)} L
                            </span>
                          );
                        }
                        return (
                          <span className="text-[10px] text-rose-800 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 font-bold">
                            Sans contrat actif
                          </span>
                        );
                      })()}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {item.vehicleType} · Chauffeur : {item.driverName}
                    </div>
                  </div>

                  {/* Status Indicator & Operational Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        item.status === 'CURRENT'
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : item.status === 'SERVED'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          : item.status === 'ABSENT'
                          ? 'bg-rose-100 text-rose-900 border border-rose-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {item.status}
                    </span>

                    {/* Operational Admin Controls */}
                    {item.status !== 'SERVED' && (
                      <div className="flex items-center gap-1">
                        {item.status !== 'ABSENT' ? (
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'ABSENT')}
                            className="px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 text-[10px] font-semibold border border-rose-200"
                            title="Marquer ce véhicule comme absent"
                          >
                            Absent
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(item.id, 'WAITING')}
                            className="px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 text-[10px] font-semibold"
                            title="Remettre en attente"
                          >
                            Rétablir
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setManualDistItem(item);
                            setManualLiters(item.suggestedLiters?.toString() || '100');
                            setManualFeedback(null);
                          }}
                          className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold shadow-xs active:scale-95"
                          title="Enregistrer la distribution directement en tant qu'administrateur"
                        >
                          Servir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            Aucun véhicule dans le programme sélectionné. Cliquez sur « Créer un programme » pour planifier une distribution.
          </div>
        )}
      </div>

      {/* SECTION 5: CREATE DISTRIBUTION PROGRAM MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-950">
                  Nouveau programme de distribution
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Autorisez les véhicules sous contrat pour une date de distribution spécifique.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProgramSubmit} className="space-y-4">
              {/* SECTION 1 & 2: DATE PRÉVUE & AUTOMATIC PROGRAM NAME */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date prévue
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Automatic title preview box (no manual text entry) */}
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2.5 flex items-center justify-between text-xs">
                  <span className="text-slate-500 text-[11px]">Intitulé généré automatiquement :</span>
                  <span className="font-bold text-slate-900 font-mono-num">{autoGeneratedTitle}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Fuel Session selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Session de carburant
                  </label>
                  {sessions.length > 0 ? (
                    <select
                      value={selectedSessionId}
                      onChange={(e) => setSelectedSessionId(e.target.value)}
                      className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                    >
                      {sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.number} ({formatNumber(s.fuelIn - s.fuelOut)} L dispo)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] font-semibold">
                      Aucune session active approvisionnée. Créez d'abord une session dans Plus → Sessions.
                    </div>
                  )}
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Citerne physique débitée.
                  </span>
                </div>

                {/* Location selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lieu
                  </label>
                  <select
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                  >
                    {locationsList.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.city})
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Poste / station d'accueil.
                  </span>
                </div>
              </div>

              {createWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2 text-xs text-amber-900 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{createWarning}</span>
                </div>
              )}

              {/* Clients / véhicules selection list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    Clients / véhicules autorisés ({selectedVehicles.length} sélectionnés)
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100 bg-slate-50">
                  {availableVehicles.map((v) => {
                    const isSelected = selectedVehicles.includes(v.id);
                    const activeC = contractsList.find((c) => c.organizationId === v.organizationId && c.status === 'ACTIVE');

                    return (
                      <div
                        key={v.id}
                        onClick={() => handleToggleVehicle(v.id)}
                        className={`p-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          isSelected ? 'bg-amber-100/60 font-semibold' : 'hover:bg-slate-100'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono-num font-bold text-slate-900">
                              {v.registration}
                            </span>
                            <span className="text-slate-600">({v.organizationName})</span>
                            {activeC ? (
                              <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-bold">
                                Contrat : {formatNumber(activeC.remainingLiters)} L
                              </span>
                            ) : (
                              <span className="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 font-semibold">
                                Sans contrat actif
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block">{v.type} · {v.driverName}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // handled by parent div
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOrder || selectedVehicles.length === 0 || !selectedSessionId}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmittingOrder ? 'Création...' : 'Créer le programme'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN MANUAL RECORDING MODAL */}
      {manualDistItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-950">
                  Distribution Directe (Admin)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {manualDistItem.registration} · {manualDistItem.organizationName}
                </p>
              </div>
              <button
                onClick={() => setManualDistItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {manualFeedback && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{manualFeedback}</span>
              </div>
            )}

            <form onSubmit={handleConfirmManualDist} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Litres distribués
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={manualLiters}
                  onChange={(e) => setManualLiters(e.target.value)}
                  className="w-full h-12 px-3 text-lg font-mono-num font-extrabold bg-slate-50 border border-slate-300 rounded-xl text-slate-950"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setManualDistItem(null)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmittingManual ? 'Enregistrement...' : 'Confirmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
