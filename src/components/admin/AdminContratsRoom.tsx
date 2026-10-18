import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api.ts';
import {
  FileText,
  BarChart3,
  PlusCircle,
  List,
  ArrowLeft,
  Search,
  ArrowUpDown,
  Building2,
  User,
  Pause,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Fuel,
  TrendingUp,
  X,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { formatNumber, formatFBU, formatPricePerLiter } from '../../utils/formatters.ts';

interface AdminContratsRoomProps {
  onBackToPlus: () => void;
}

type ContratsRoomSection = 'room' | 'general' | 'create' | 'list';
type SortField =
  | 'customerName'
  | 'remainingLiters'
  | 'contractedLiters'
  | 'consumedLiters'
  | 'amountPaidFBU'
  | 'remainingAmountFBU'
  | 'startDate'
  | 'status';
type SortDirection = 'asc' | 'desc';

export const AdminContratsRoom: React.FC<AdminContratsRoomProps> = ({ onBackToPlus }) => {
  const [section, setSection] = useState<ContratsRoomSection>('room');
  const [isLoading, setIsLoading] = useState(true);

  // Contracts data
  const [contractsList, setContractsList] = useState<any[]>([]);
  const [contractsSummary, setContractsSummary] = useState<any | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);

  // Selected contract for child detail view
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [selectedContractDetail, setSelectedContractDetail] = useState<any | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Search, Filter, Sort for Contracts List
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXHAUSTED' | 'SUSPENDED'>('ALL');
  const [sortField, setSortField] = useState<SortField>('remainingLiters');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  // Creation form state
  const [contractMode, setContractMode] = useState<'ORGANIZATION' | 'INDIVIDUAL_EXISTING'>('ORGANIZATION');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [contractLiters, setContractLiters] = useState<string>(import.meta.env.DEV ? '1500' : '');
  const [contractStartDate, setContractStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // Feedback banner state
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  const loadContractsData = async () => {
    setIsLoading(true);
    try {
      const [contractsRes, orgsRes, pricesRes] = await Promise.all([
        api.admin.getContracts(),
        api.admin.getOrganizations(),
        api.admin.getPrices(),
      ]);

      if (contractsRes.success && contractsRes.data) {
        setContractsList(contractsRes.data.contracts || []);
        setContractsSummary(contractsRes.data.summary || null);
      }

      if (orgsRes.success && orgsRes.data) {
        const orgList = orgsRes.data.organizations || [];
        setOrganizations(orgList);
      }

      if (pricesRes.success && pricesRes.data?.prices) {
        const activePriceObj = pricesRes.data.prices.find((p: any) => !p.effectiveTo);
        if (activePriceObj && typeof activePriceObj.pricePerLiter === 'number') {
          setCurrentPrice(activePriceObj.pricePerLiter);
        } else {
          setCurrentPrice(null);
        }
      } else {
        setCurrentPrice(null);
      }
    } catch (err) {
      console.error('Failed to load contracts data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContractsData();
  }, []);

  // Fetch single contract details when selected
  const loadSingleContractDetail = async (id: string) => {
    setIsDetailLoading(true);
    try {
      const res = await api.admin.getContract(id);
      if (res.success && res.data) {
        setSelectedContractDetail(res.data);
      } else {
        showFeedback('error', res.error?.message || 'Impossible de charger les détails du contrat.');
      }
    } catch (err) {
      console.error('Failed to load contract detail:', err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  useEffect(() => {
    if (selectedContractId) {
      loadSingleContractDetail(selectedContractId);
    } else {
      setSelectedContractDetail(null);
    }
  }, [selectedContractId]);

  // Quantity validation
  const litersTrimmed = contractLiters.trim();
  const isLitersFormatValid = /^\d+$/.test(litersTrimmed);
  const parsedLiters = isLitersFormatValid ? Number(litersTrimmed) : 0;
  const isLitersRangeValid = isLitersFormatValid && parsedLiters >= 1 && parsedLiters <= 500000;

  const getLitersErrorMessage = (): string | null => {
    if (!litersTrimmed) return null;
    if (!isLitersFormatValid) return 'La quantité doit être un nombre entier sans décimales.';
    if (parsedLiters < 1) return 'La quantité minimale est de 1 litre.';
    if (parsedLiters > 500000) return 'La quantité ne peut pas dépasser 500 000 litres.';
    return null;
  };
  const litersError = getLitersErrorMessage();

  const isFormValid = Boolean(
    selectedOrgId &&
    isLitersRangeValid &&
    contractStartDate &&
    currentPrice !== null
  );

  const availableCustomers = useMemo(() => {
    return organizations.filter((o) =>
      contractMode === 'ORGANIZATION'
        ? o.customerType !== 'INDIVIDUAL'
        : o.customerType === 'INDIVIDUAL'
    );
  }, [organizations, contractMode]);

  // Filter and Sort Contracts (Interactive real-time reordering)
  const processedContracts = useMemo(() => {
    let list = [...contractsList];

    // Filter by status
    if (statusFilter !== 'ALL') {
      list = list.filter((c) => c.status === statusFilter);
    }

    // Search by customer name
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((c) => (c.customerName || '').toLowerCase().includes(q));
    }

    // Interactive Sorting
    list.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'customerName':
          comparison = (a.customerName || '').localeCompare(b.customerName || '', 'fr', { sensitivity: 'base' });
          break;
        case 'remainingLiters':
          comparison = (a.remainingLiters || 0) - (b.remainingLiters || 0);
          break;
        case 'contractedLiters':
          comparison = (a.contractedLiters || 0) - (b.contractedLiters || 0);
          break;
        case 'consumedLiters':
          comparison = (a.consumedLiters || 0) - (b.consumedLiters || 0);
          break;
        case 'amountPaidFBU':
          comparison = (a.amountPaidFBU || 0) - (b.amountPaidFBU || 0);
          break;
        case 'remainingAmountFBU':
          comparison = (a.remainingAmountFBU || 0) - (b.remainingAmountFBU || 0);
          break;
        case 'startDate':
          comparison = new Date(a.startDate || 0).getTime() - new Date(b.startDate || 0).getTime();
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [contractsList, statusFilter, searchQuery, sortField, sortDirection]);

  // Handle Contract Creation
  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPrice === null) {
      showFeedback('error', 'Aucun prix par litre actif défini. Veuillez le configurer dans Plus > Tarification.');
      return;
    }

    if (!selectedOrgId) {
      showFeedback('error', 'Veuillez sélectionner un client.');
      return;
    }

    if (!isLitersRangeValid) {
      showFeedback('error', litersError || 'Veuillez renseigner une quantité valide (1 à 500 000 litres).');
      return;
    }

    setIsSubmitting(true);
    const cust = organizations.find((o) => o.id === selectedOrgId);
    const payload = {
      customerType: (cust?.customerType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'ORGANIZATION') as 'ORGANIZATION' | 'INDIVIDUAL',
      organizationId: selectedOrgId,
      contractedLiters: parsedLiters,
      startDate: contractStartDate,
    };

    const res = await api.admin.createContract(payload);
    setIsSubmitting(false);

    if (res.success) {
      showFeedback('success', 'Contrat créé avec succès (Statut : ACTIF).');
      await loadContractsData();
      setSelectedOrgId('');
      setContractLiters(import.meta.env.DEV ? '1500' : '');
      setSection('list'); // 7. After success: reload data and go to the contracts LIST section
    } else {
      showFeedback('error', res.error?.message || 'Erreur lors de la création du contrat.');
    }
  };

  // Suspend contract handler
  const handleSuspend = async (contractId: string) => {
    if (!window.confirm('Voulez-vous suspendre ce contrat ? Le solde restant sera préservé.')) return;
    setIsSubmitting(true);
    const res = await api.admin.suspendContract(contractId, 'Suspension par la direction');
    setIsSubmitting(false);

    if (res.success) {
      showFeedback('success', 'Contrat suspendu avec succès. Le solde est préservé.');
      await loadContractsData();
      if (selectedContractId === contractId) {
        loadSingleContractDetail(contractId);
      }
    } else {
      showFeedback('error', res.error?.message || 'Erreur lors de la suspension.');
    }
  };

  // Reactivate contract handler
  const handleReactivate = async (contractId: string) => {
    setIsSubmitting(true);
    const res = await api.admin.reactivateContract(contractId);
    setIsSubmitting(false);

    if (res.success) {
      showFeedback('success', 'Contrat réactivé avec succès.');
      await loadContractsData();
      if (selectedContractId === contractId) {
        loadSingleContractDetail(contractId);
      }
    } else {
      showFeedback('error', res.error?.message || 'Erreur lors de la réactivation.');
    }
  };

  const getSortLabel = (field: SortField, dir: SortDirection) => {
    switch (field) {
      case 'remainingLiters':
        return dir === 'desc' ? 'Solde restant (élevé → faible)' : 'Solde restant (faible → élevé)';
      case 'customerName':
        return dir === 'asc' ? 'Nom du client (A → Z)' : 'Nom du client (Z → A)';
      case 'contractedLiters':
        return dir === 'desc' ? 'Litres contractés (élevé → faible)' : 'Litres contractés (faible → élevé)';
      case 'consumedLiters':
        return dir === 'desc' ? 'Litres consommés (élevé → faible)' : 'Litres consommés (faible → élevé)';
      case 'amountPaidFBU':
        return dir === 'desc' ? 'Montant payé (élevé → faible)' : 'Montant payé (faible → élevé)';
      case 'remainingAmountFBU':
        return dir === 'desc' ? 'Montant restant (élevé → faible)' : 'Montant restant (faible → élevé)';
      case 'startDate':
        return dir === 'desc' ? 'Date début (plus récent)' : 'Date début (plus ancien)';
      case 'status':
        return dir === 'asc' ? 'Statut (croissant)' : 'Statut (décroissant)';
      default:
        return 'Tri personnalisé';
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-500 font-medium text-xs flex items-center justify-center gap-2">
        <Fuel className="w-5 h-5 animate-pulse text-amber-500" />
        <span>Chargement des contrats clients...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-rose-50 text-rose-900 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ROOM VIEW: THE 3 MAIN OPTIONS (DEDICATED CONTRATS ROOM)                */}
      {/* ========================================================================= */}
      {section === 'room' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Header with Back button to return to Plus main menu */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div>
              <button
                onClick={onBackToPlus}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 mb-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Retour au menu Plus</span>
              </button>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-600" />
                <span>Contrats Clients Prépayés</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Gestion des droits de tirage de carburant sous contrat pour organisations et particuliers.
              </p>
            </div>

            <div className="text-right hidden sm:block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Contrats Actifs
              </span>
              <span className="font-mono-num font-extrabold text-lg text-emerald-700">
                {contractsSummary?.totalActiveContracts || 0}
              </span>
            </div>
          </div>

          {/* EXACTLY THREE MAIN ENTRY POINTS */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
            {/* OPTION 1: 📊 Vue générale */}
            <button
              onClick={() => setSection('general')}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-slate-900 group-hover:text-indigo-600 transition-colors">
                      Vue générale
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">
                      Synthèse globale
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Indicateurs consolidés : volumes contractés, consommés, restants et valorisation financière.
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* OPTION 2: ➕ Nouveau contrat */}
            <button
              onClick={() => {
                setSelectedOrgId('');
                setContractLiters(import.meta.env.DEV ? '1500' : '');
                setContractStartDate(new Date().toISOString().split('T')[0]);
                setSection('create');
              }}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-slate-900 group-hover:text-amber-600 transition-colors">
                      Nouveau contrat
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                      Souscription
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Enregistrer une nouvelle dotation prépayée pour une organisation ou un client individuel.
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* OPTION 3: 📋 Liste des contrats */}
            <button
              onClick={() => {
                setSelectedContractId(null);
                setSection('list');
              }}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600 shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                  <List className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-slate-900 group-hover:text-emerald-600 transition-colors">
                      Liste des contrats
                    </span>
                    <span className="text-[10px] font-mono-num font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800">
                      {contractsList.length} clients
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Consultation épurée des bénéficiaires, recherche, filtres et tri interactif.
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. OPTION 1: 📊 VUE GÉNÉRALE (AGGREGATED STATISTICS DASHBOARD)            */}
      {/* ========================================================================= */}
      {section === 'general' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div>
              <button
                onClick={() => setSection('room')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 mb-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Retour aux Contrats</span>
              </button>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <span>Vue Générale des Contrats</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Situation financière globale et engagements de carburant consolidés.
              </p>
            </div>

            <button
              onClick={() => {
                setSelectedOrgId('');
                setContractLiters(import.meta.env.DEV ? '1500' : '');
                setContractStartDate(new Date().toISOString().split('T')[0]);
                setSection('create');
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
            >
              + Nouveau Contrat
            </button>
          </div>

          {/* Aggregated Numbers Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Status Breakdown Card */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Nombre Total de Contrats
              </span>
              <span className="font-mono-num font-black text-3xl text-slate-900 block">
                {contractsSummary?.totalContracts || 0}
              </span>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    ACTIVE
                  </span>
                  <strong className="font-mono-num text-emerald-800">
                    {contractsSummary?.totalActiveContracts || 0}
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-700 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    SUSPENDED
                  </span>
                  <strong className="font-mono-num text-amber-800">
                    {contractsSummary?.totalSuspendedContracts || 0}
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-500 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    EXHAUSTED
                  </span>
                  <strong className="font-mono-num text-slate-700">
                    {contractsSummary?.totalExhaustedContracts || 0}
                  </strong>
                </div>
              </div>
            </div>

            {/* Volumes (Liters) Card */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Volumes de Carburant (Litres)
              </span>

              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Total Litres Contractés
                  </span>
                  <span className="font-mono-num font-extrabold text-xl text-slate-900 mt-0.5 block">
                    {formatNumber(contractsSummary?.totalContractedLiters || 0)} L
                  </span>
                </div>

                <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/60">
                  <span className="text-[10px] text-amber-700 font-bold uppercase block">
                    Total Litres Consommés
                  </span>
                  <span className="font-mono-num font-extrabold text-xl text-amber-800 mt-0.5 block">
                    {formatNumber(contractsSummary?.totalConsumedLiters || 0)} L
                  </span>
                </div>

                <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/60">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">
                    Total Litres Restants
                  </span>
                  <span className="font-mono-num font-extrabold text-xl text-emerald-800 mt-0.5 block">
                    {formatNumber(contractsSummary?.totalRemainingLiters || 0)} L
                  </span>
                </div>
              </div>
            </div>

            {/* Financial Amounts (FBU) Card */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Valorisation Financière (FBU)
              </span>

              <div className="space-y-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Total Montant Payé
                  </span>
                  <span className="font-mono-num font-extrabold text-lg text-slate-900 mt-0.5 block truncate">
                    {formatFBU(contractsSummary?.totalAmountPaidFBU || 0)}
                  </span>
                </div>

                <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/60">
                  <span className="text-[10px] text-amber-700 font-bold uppercase block">
                    Total Montant Consommé
                  </span>
                  <span className="font-mono-num font-extrabold text-lg text-amber-800 mt-0.5 block truncate">
                    {formatFBU(
                      (contractsSummary?.totalContractedLiters || 0) > 0
                        ? (contractsSummary?.totalConsumedLiters || 0) *
                            Math.round((contractsSummary?.totalAmountPaidFBU || 0) / (contractsSummary?.totalContractedLiters || 1))
                        : 0
                    )}
                  </span>
                </div>

                <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/60">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">
                    Total Montant Restant
                  </span>
                  <span className="font-mono-num font-extrabold text-lg text-emerald-800 mt-0.5 block truncate">
                    {formatFBU(contractsSummary?.totalRemainingAmountFBU || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. OPTION 2: ➕ NOUVEAU CONTRAT (CREATION SCREEN)                         */}
      {/* ========================================================================= */}
      {section === 'create' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div>
              <button
                onClick={() => setSection('room')}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 mb-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Retour aux Contrats</span>
              </button>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-amber-600" />
                <span>Nouveau Contrat Prépayé</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Souscription d'un droit de tirage de carburant avec paiement d'avance.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs max-w-xl mx-auto">
            <form onSubmit={handleCreateContract} className="space-y-4">
              {/* Customer Type Choice */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Type de Bénéficiaire
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setContractMode('ORGANIZATION');
                      setSelectedOrgId('');
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center gap-2 ${
                      contractMode === 'ORGANIZATION'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Organisation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setContractMode('INDIVIDUAL_EXISTING');
                      setSelectedOrgId('');
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center gap-2 ${
                      contractMode === 'INDIVIDUAL_EXISTING'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-2xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span>Individu Existant</span>
                  </button>
                </div>
              </div>

              {/* Customer Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {contractMode === 'ORGANIZATION'
                    ? "Sélectionner l'Organisation"
                    : 'Sélectionner le Client Individuel'}
                </label>

                {availableCustomers.length === 0 ? (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                    <p className="font-semibold">
                      {contractMode === 'ORGANIZATION'
                        ? 'Aucune organisation disponible.'
                        : 'Aucun client individuel disponible.'}
                    </p>
                    <p className="text-[11px] text-amber-800">
                      Veuillez d'abord enregistrer un client dans le menu <strong>Gestion &gt; Clients</strong>.
                    </p>
                  </div>
                ) : (
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    required
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-500 transition-colors"
                  >
                    <option value="">
                      -- Sélectionner {contractMode === 'ORGANIZATION' ? 'une organisation' : 'un client individuel'} --
                    </option>
                    {availableCustomers.map((o) => {
                      const hasActive = contractsList.some(
                        (c) => c.organizationId === o.id && c.status === 'ACTIVE'
                      );
                      return (
                        <option key={o.id} value={o.id}>
                          {o.name} {o.contactPerson ? `(${o.contactPerson})` : ''} {hasActive ? '⚠️ [Contrat actif en cours]' : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {/* Price: Read-only active price or prompt to set price */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prix Unitaire Officiel
                </label>
                {currentPrice !== null ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Prix Actif en Vigueur
                      </span>
                      <span className="text-slate-900 font-extrabold text-sm font-mono-num">
                        {formatPricePerLiter(currentPrice)}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 italic bg-white px-2.5 py-1 rounded-md border border-slate-200">
                      Lecture seule
                    </span>
                  </div>
                ) : (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <div>
                        <span className="font-bold block">Aucun prix défini</span>
                        <span className="text-[11px] text-rose-700">
                          Un prix officiel par litre doit être défini dans Plus &gt; Tarification.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onBackToPlus}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-2xs shrink-0"
                    >
                      Plus &gt; Tarification
                    </button>
                  </div>
                )}
              </div>

              {/* Quantity in Liters */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Litres Contractés
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ex: 1500"
                  required
                  value={contractLiters}
                  onChange={(e) => setContractLiters(e.target.value)}
                  className={`w-full h-11 px-3 bg-slate-50 border rounded-xl text-xs font-mono-num font-bold text-slate-900 focus:bg-white transition-colors ${
                    litersError ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-amber-500'
                  }`}
                />
                {litersError && (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">
                    {litersError}
                  </p>
                )}
              </div>

              {/* Read-Only Amount to Pay */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                    Montant à Payer
                  </span>
                  <span className="text-slate-600 text-[11px]">
                    {isLitersRangeValid && currentPrice !== null
                      ? `${formatNumber(parsedLiters)} L × ${formatPricePerLiter(currentPrice)}`
                      : 'Calculé automatiquement (litres × prix)'}
                  </span>
                </div>
                <span className="font-mono-num font-extrabold text-base text-amber-900">
                  {isLitersRangeValid && currentPrice !== null
                    ? formatFBU(parsedLiters * currentPrice)
                    : '—'}
                </span>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date de Début (Sans date d'expiration)
                </label>
                <input
                  type="date"
                  required
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-500 transition-colors"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Le contrat débute immédiatement en statut ACTIF et ne comporte aucune date d'expiration.
                </span>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSection('room')}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isFormValid}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Création en cours...' : 'Créer le Contrat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. OPTION 3: 📋 LISTE DES CONTRATS & CONTEXTUAL DETAILS                   */}
      {/* ========================================================================= */}
      {section === 'list' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Top Return & Header */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div>
              <button
                onClick={() => {
                  if (selectedContractId) {
                    setSelectedContractId(null);
                  } else {
                    setSection('room');
                  }
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 mb-1.5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>
                  {selectedContractId ? 'Retour à la liste des contrats' : 'Retour aux Contrats'}
                </span>
              </button>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <List className="w-5 h-5 text-emerald-600" />
                <span>
                  {selectedContractId ? 'Détails du Contrat' : 'Liste des Contrats'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedContractId
                  ? 'Fiche détaillée du contrat client et historique des approvisionnements.'
                  : 'Cliquez sur un client pour consulter l’intégralité de son contrat.'}
              </p>
            </div>

            {!selectedContractId && (
              <button
                onClick={() => {
                  setSelectedOrgId('');
                  setContractLiters(import.meta.env.DEV ? '1500' : '');
                  setContractStartDate(new Date().toISOString().split('T')[0]);
                  setSection('create');
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
              >
                + Nouveau Contrat
              </button>
            )}
          </div>

          {/* ===================================================================== */}
          {/* 4.A CONTEXTUAL CONTRACT DETAIL VIEW (OPENED ON CONTRACT CLICK)        */}
          {/* ===================================================================== */}
          {selectedContractId ? (
            isDetailLoading || !selectedContractDetail ? (
              <div className="bg-white rounded-2xl p-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <Fuel className="w-5 h-5 animate-pulse text-amber-500" />
                <span>Chargement des détails du contrat...</span>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-5 animate-in fade-in duration-150">
                {/* Header Profile & Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                        selectedContractDetail.contract.customerType === 'INDIVIDUAL'
                          ? 'bg-purple-50 border border-purple-200 text-purple-700'
                          : 'bg-blue-50 border border-blue-200 text-blue-700'
                      }`}
                    >
                      {selectedContractDetail.contract.customerType === 'INDIVIDUAL' ? (
                        <User className="w-6 h-6" />
                      ) : (
                        <Building2 className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg text-slate-900">
                          {selectedContractDetail.contract.customerName}
                        </h3>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            selectedContractDetail.contract.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : selectedContractDetail.contract.status === 'SUSPENDED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {selectedContractDetail.contract.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedContractDetail.contract.customerLocation} · Contact :{' '}
                        {selectedContractDetail.contract.customerContact} ({selectedContractDetail.contract.customerPhone})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {selectedContractDetail.contract.status === 'ACTIVE' && selectedContractDetail.contract.remainingLiters > 0 && (
                      <button
                        onClick={() => handleSuspend(selectedContractDetail.contract.id)}
                        disabled={isSubmitting}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Pause className="w-4 h-4" />
                        <span>Suspendre</span>
                      </button>
                    )}

                    {selectedContractDetail.contract.status === 'EXHAUSTED' && (
                      <span className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold flex items-center gap-1">
                        ✓ Contrat terminé (épuisé)
                      </span>
                    )}

                    {selectedContractDetail.contract.status === 'SUSPENDED' &&
                      selectedContractDetail.contract.remainingLiters > 0 && (
                        <button
                          onClick={() => handleReactivate(selectedContractDetail.contract.id)}
                          disabled={isSubmitting}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Play className="w-4 h-4" />
                          <span>Réactiver</span>
                        </button>
                      )}
                  </div>
                </div>

                {/* Contract Entitlement & Financial Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      Litres Contractés
                    </span>
                    <span className="font-mono-num font-extrabold text-base text-slate-900 mt-0.5 block">
                      {formatNumber(selectedContractDetail.contract.contractedLiters)} L
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Payé : {formatFBU(selectedContractDetail.contract.amountPaidFBU)}
                    </span>
                  </div>

                  <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-amber-700 font-bold uppercase block">
                      Litres Consommés
                    </span>
                    <span className="font-mono-num font-extrabold text-base text-amber-800 mt-0.5 block">
                      {formatNumber(selectedContractDetail.contract.consumedLiters)} L
                    </span>
                    <span className="text-[10px] text-amber-600 mt-1 block">
                      Consommé : {formatFBU(selectedContractDetail.contract.consumedAmountFBU)}
                    </span>
                  </div>

                  <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[10px] text-emerald-700 font-bold uppercase block">
                      Litres Restants
                    </span>
                    <span className="font-mono-num font-extrabold text-base text-emerald-800 mt-0.5 block">
                      {formatNumber(selectedContractDetail.contract.remainingLiters)} L
                    </span>
                    <span className="text-[10px] text-emerald-600 mt-1 block">
                      Solde : {formatFBU(selectedContractDetail.contract.remainingAmountFBU)}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">
                      Prix Unitaire Effectif
                    </span>
                    <span className="font-mono-num font-extrabold text-base text-slate-900 mt-0.5 block">
                      {formatPricePerLiter(selectedContractDetail.contract.contractPricePerLiter)}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Début : {new Date(selectedContractDetail.contract.startDate).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>

                {/* Associated Vehicles */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900">
                    Véhicule{selectedContractDetail.vehicles?.length > 1 ? 's' : ''} Rattaché{selectedContractDetail.vehicles?.length > 1 ? 's' : ''} ({selectedContractDetail.vehicles?.length || 0})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {(selectedContractDetail.vehicles || []).map((veh: any) => (
                      <div key={veh.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="font-mono-num font-bold text-slate-900 block">{veh.registration}</span>
                          <span className="text-[11px] text-slate-500">{veh.type} · Chauffeur : {veh.driverName}</span>
                        </div>
                        <span className="font-mono-num text-xs font-bold text-amber-700">
                          {formatNumber(veh.totalReceivedLiters)} L reçus
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Distribution History Under This Contract */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-900">
                    Historique des Distributions de Carburant
                  </h4>
                  <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-slate-50 text-xs">
                    {(selectedContractDetail.distributions || []).length > 0 ? (
                      selectedContractDetail.distributions.map((d: any) => (
                        <div key={d.id} className="p-3 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono-num font-bold text-slate-900">{d.vehicleRegistration}</span>
                              <span className="font-mono-num font-semibold text-emerald-700">
                                {formatNumber(d.quantityLiters)} L
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(d.createdAt).toLocaleDateString('fr-FR')} {new Date(d.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · Pompiste : {d.recordedByName} · {d.sessionNumber}
                            </span>
                          </div>
                          <span className="font-mono-num font-bold text-slate-800">{formatFBU(d.totalCostFBU)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-slate-400 text-xs">
                        Aucun approvisionnement enregistré pour ce contrat pour l'instant.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* ===================================================================== */
            /* 4.B MINIMAL INITIAL CONTRACTS LIST (ONLY CUSTOMER NAME & STATUS)     */
            /* ===================================================================== */
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden space-y-0">
              {/* Search, Filter, and Interactive Sort Controls */}
              <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Search Bar */}
                  <div className="flex-1 relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Rechercher par nom de client..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-9 pl-8 pr-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* Interactive Sort Button with Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                      className="h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 text-amber-600" />
                      <span>Trier : {getSortLabel(sortField, sortDirection)}</span>
                    </button>

                    {/* Sort Menu Options Popup */}
                    {isSortMenuOpen && (
                      <div className="absolute right-0 mt-1 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-30 space-y-1 animate-in fade-in duration-100 text-xs">
                        <span className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1 block">
                          Critères de tri interactifs
                        </span>

                        {[
                          { field: 'remainingLiters', dir: 'desc', label: 'Solde restant (élevé → faible)' },
                          { field: 'remainingLiters', dir: 'asc', label: 'Solde restant (faible → élevé)' },
                          { field: 'customerName', dir: 'asc', label: 'Nom du client (A → Z)' },
                          { field: 'customerName', dir: 'desc', label: 'Nom du client (Z → A)' },
                          { field: 'contractedLiters', dir: 'desc', label: 'Litres contractés (élevé → faible)' },
                          { field: 'consumedLiters', dir: 'desc', label: 'Litres consommés (élevé → faible)' },
                          { field: 'amountPaidFBU', dir: 'desc', label: 'Montant payé (élevé → faible)' },
                          { field: 'startDate', dir: 'desc', label: 'Date début (plus récent)' },
                          { field: 'status', dir: 'asc', label: 'Statut' },
                        ].map((item) => {
                          const isSelected = sortField === item.field && sortDirection === item.dir;
                          return (
                            <button
                              key={`${item.field}-${item.dir}`}
                              onClick={() => {
                                setSortField(item.field as SortField);
                                setSortDirection(item.dir as SortDirection);
                                setIsSortMenuOpen(false);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between ${
                                isSelected
                                  ? 'bg-amber-50 text-amber-900 font-bold'
                                  : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <span>{item.label}</span>
                              {isSelected && <span className="text-amber-600 text-xs">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Filter Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-[11px] font-semibold text-slate-500 mr-1">Statut :</span>
                  {(['ALL', 'ACTIVE', 'EXHAUSTED', 'SUSPENDED'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1 rounded-xl font-bold transition-all text-xs ${
                        statusFilter === st
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {st === 'ALL'
                        ? 'Tous'
                        : st === 'ACTIVE'
                        ? 'ACTIVE'
                        : st === 'EXHAUSTED'
                        ? 'EXHAUSTED'
                        : 'SUSPENDED'}
                    </button>
                  ))}
                  <span className="text-[11px] text-slate-400 ml-auto font-mono-num font-semibold">
                    {processedContracts.length} contrat{processedContracts.length > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Minimal Clean Table: ONLY Customer Name & Status */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/75 border-b border-slate-200/80 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                      <th className="py-3 px-4">Client</th>
                      <th className="py-3 px-4 text-right">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {processedContracts.length > 0 ? (
                      processedContracts.map((contract) => (
                        <tr
                          key={contract.id}
                          onClick={() => setSelectedContractId(contract.id)}
                          className="hover:bg-amber-50/50 cursor-pointer transition-colors group"
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                  contract.customerType === 'INDIVIDUAL'
                                    ? 'bg-purple-50 text-purple-700'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {contract.customerType === 'INDIVIDUAL' ? (
                                  <User className="w-3.5 h-3.5" />
                                ) : (
                                  <Building2 className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <span className="font-bold text-sm text-slate-900 group-hover:text-amber-800 transition-colors">
                                {contract.customerName}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {contract.status === 'ACTIVE' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                ACTIVE
                              </span>
                            )}
                            {contract.status === 'SUSPENDED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold">
                                <Pause className="w-3 h-3" />
                                SUSPENDED
                              </span>
                            )}
                            {contract.status === 'EXHAUSTED' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold">
                                EXHAUSTED
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="py-8 px-4 text-center text-slate-400 text-xs">
                          Aucun contrat ne correspond à votre recherche ou filtre.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
