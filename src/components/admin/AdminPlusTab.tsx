import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import {
  Users,
  Fuel,
  DollarSign,
  History,
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  Power,
  Edit2,
  Clock,
  ShieldCheck,
  Check,
  FileText,
} from 'lucide-react';
import { formatNumber, formatFBU, formatPricePerLiter } from '../../utils/formatters.ts';
import { AdminHistoriqueTab } from './AdminHistoriqueTab.tsx';
import { AdminContratsRoom } from './AdminContratsRoom.tsx';

type PlusView = 'menu' | 'workers' | 'sessions' | 'prices' | 'contrats' | 'historique';

export const AdminPlusTab: React.FC = () => {
  const { plusSubSection, setPlusSubSection } = useApp();
  const [currentView, setCurrentView] = useState<PlusView>('menu');
  const [initialHistoryCategory, setInitialHistoryCategory] = useState<'distributions' | 'corrections' | 'sessions' | 'orders' | 'prices' | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data states
  const [workers, setWorkers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [activeContractsCount, setActiveContractsCount] = useState(0);

  // Modals state
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<any | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);

  // Forms state
  const [workerForm, setWorkerForm] = useState({
    name: '',
    email: '',
    password: '',
    locationId: '',
  });

  const [sessionForm, setSessionForm] = useState<{
    number: string;
    fuelIn: number;
    pricePerLiter: number | '';
    notes: string;
  }>({
    number: '',
    fuelIn: 10000,
    pricePerLiter: '',
    notes: 'Arrivage Citerne',
  });

  const [newPriceInput, setNewPriceInput] = useState('');
  const [priceInputError, setPriceInputError] = useState<string | null>(null);
  const [priceModalError, setPriceModalError] = useState<string | null>(null);
  const [isConfirmingPrice, setIsConfirmingPrice] = useState(false);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [workersRes, sessionsRes, pricesRes, contractsRes] = await Promise.all([
        api.admin.getWorkers(),
        api.admin.getSessions(),
        api.admin.getPrices(),
        api.admin.getContracts(),
      ]);

      if (contractsRes.success && contractsRes.data) {
        setActiveContractsCount(contractsRes.data.summary?.totalActiveContracts || 0);
      }

      if (workersRes.success && workersRes.data) {
        setWorkers(workersRes.data.workers || []);
        const workerLocations = workersRes.data.locations || [];
        setLocations(workerLocations);
        if (workerLocations[0]) {
          setWorkerForm((prev) => ({ ...prev, locationId: workerLocations[0].id }));
        }
      }

      if (sessionsRes.success && sessionsRes.data) {
        setSessions(sessionsRes.data.sessions || []);
        const nextNum = (sessionsRes.data.sessions?.length || 0) + 1;
        const padded = nextNum.toString().padStart(3, '0');
        const activeOfficialPrice = pricesRes.data?.prices?.find((p: any) => !p.effectiveTo)?.pricePerLiter;
        setSessionForm((prev) => ({
          ...prev,
          number: `Session #${padded}`,
          pricePerLiter: activeOfficialPrice !== undefined ? activeOfficialPrice : '',
        }));
      }

      if (pricesRes.success && pricesRes.data) {
        setPrices(pricesRes.data.prices || []);
      }
    } catch (err) {
      console.error('Failed to load plus data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle external shortcut triggers
  useEffect(() => {
    if (plusSubSection === 'historique-corrections') {
      setInitialHistoryCategory('corrections');
      setCurrentView('historique');
      setPlusSubSection(null);
    } else if (plusSubSection === 'contrats') {
      setCurrentView('contrats');
      setPlusSubSection(null);
    }
  }, [plusSubSection, setPlusSubSection]);

  // 1. Worker Actions
  const handleCreateOrUpdateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    let res;
    if (editingWorker) {
      res = await api.admin.updateWorker(editingWorker.id, {
        name: workerForm.name,
        email: workerForm.email,
        locationId: workerForm.locationId,
      });
    } else {
      res = await api.admin.createWorker(workerForm);
    }
    setIsSubmitting(false);

    if (res.success) {
      setIsWorkerModalOpen(false);
      setEditingWorker(null);
      showFeedback('success', `Pompiste ${editingWorker ? 'mis à jour' : 'créé'} avec succès.`);
      await loadData();
    } else {
      showFeedback('error', res.error?.message || "Erreur lors de l'enregistrement du pompiste.");
    }
  };

  const handleToggleWorker = async (worker: any) => {
    const res = await api.admin.updateWorker(worker.id, { isActive: !worker.isActive });
    if (res.success) {
      showFeedback('success', `Compte ${worker.isActive ? 'désactivé' : 'activé'}.`);
      await loadData();
    } else {
      showFeedback('error', res.error?.message || 'Erreur lors de la modification.');
    }
  };

  const handleOpenEditWorker = (worker: any) => {
    setEditingWorker(worker);
    setWorkerForm({
      name: worker.name,
      email: worker.email,
      password: '',
      locationId: worker.locationId || locations[0]?.id || '',
    });
    setIsWorkerModalOpen(true);
  };

  // 2. Session Actions
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionForm.number.trim()) {
      showFeedback('error', 'Le numéro de session est obligatoire.');
      return;
    }
    if (sessionForm.fuelIn <= 0 || !sessionForm.pricePerLiter || sessionForm.pricePerLiter <= 0) {
      showFeedback('error', 'Le volume et le prix doivent être supérieurs à zéro.');
      return;
    }

    setIsSubmitting(true);
    const res = await api.admin.createSession(sessionForm);
    setIsSubmitting(false);

    if (res.success) {
      setIsSessionModalOpen(false);
      showFeedback('success', `Session « ${sessionForm.number} » créée avec succès (${formatNumber(sessionForm.fuelIn)} L).`);
      await loadData();
    } else {
      showFeedback('error', res.error?.message || 'Erreur lors de la création de la session.');
    }
  };

  const handleToggleSessionStatus = async (session: any) => {
    const newStatus = session.status === 'Active' ? 'Terminée' : 'Active';
    const res = await api.admin.updateSession(session.id, { status: newStatus });
    if (res.success) {
      showFeedback('success', `Session marquée comme « ${newStatus} ».`);
      await loadData();
    } else {
      showFeedback('error', res.error?.message || 'Erreur lors du changement de statut de la session.');
    }
  };

  // 3. Price Actions
  const openPriceModal = () => {
    const active = prices.find((p) => !p.effectiveTo);
    setNewPriceInput(active ? active.pricePerLiter.toString() : '');
    setPriceInputError(null);
    setPriceModalError(null);
    setIsConfirmingPrice(false);
    setIsPriceModalOpen(true);
  };

  const validatePrice = (valStr: string): string | null => {
    const trimmed = valStr.trim();
    if (!trimmed) {
      return 'Le prix unitaire est obligatoire.';
    }
    if (!/^-?\d+$/.test(trimmed)) {
      return 'Le prix unitaire doit être un nombre entier (pas de décimales).';
    }
    const num = Number(trimmed);
    if (num <= 0) {
      return 'Le prix unitaire doit être supérieur à zéro.';
    }
    if (num > 100000) {
      return 'Le prix unitaire ne peut pas dépasser 100 000 FBU.';
    }
    return null;
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setPriceModalError(null);
    const err = validatePrice(newPriceInput);
    if (err) {
      setPriceInputError(err);
      return;
    }
    setPriceInputError(null);
    setIsConfirmingPrice(true);
  };

  const handleConfirmSavePrice = async () => {
    const err = validatePrice(newPriceInput);
    if (err) {
      setPriceInputError(err);
      setIsConfirmingPrice(false);
      return;
    }

    const priceVal = parseInt(newPriceInput.trim(), 10);
    setIsSubmitting(true);
    setPriceModalError(null);
    const res = await api.admin.createPrice(priceVal);
    setIsSubmitting(false);

    if (res.success) {
      setIsPriceModalOpen(false);
      setIsConfirmingPrice(false);
      setPriceInputError(null);
      setPriceModalError(null);
      showFeedback('success', `Nouveau tarif officiel enregistré : ${formatNumber(priceVal)} FBU/L.`);
      await loadData();
    } else {
      const errMsg = res.error?.message || "Erreur lors de l'enregistrement du tarif.";
      setPriceModalError(errMsg);
      showFeedback('error', errMsg);
    }
  };

  const activeSessionsCount = sessions.filter((s) => s.status === 'Active').length;
  const activePrice = prices.find((p) => !p.effectiveTo) || null;

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

      {/* ============================================================== */}
      {/* VIEW: MAIN PLUS MENU / HUB                                     */}
      {/* ============================================================== */}
      {currentView === 'menu' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Menu Complémentaire & Paramètres
            </span>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">
              Outils d'Administration Avancée
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Gérez les comptes pompistes, les sessions de cuves, les tarifs officiels et consultez les archives.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
            {/* 1. Pompistes */}
            <button
              onClick={() => setCurrentView('workers')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 shrink-0 group-hover:scale-105 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                      Pompistes
                    </span>
                    <span className="text-[10px] font-mono-num font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {workers.length} comptes
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Création des comptes, statuts et affectations de postes
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* 2. Sessions Cuves */}
            <button
              onClick={() => setCurrentView('sessions')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 shrink-0 group-hover:scale-105 transition-transform">
                  <Fuel className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 group-hover:text-amber-600 transition-colors">
                      Sessions / Approvisionnements
                    </span>
                    <span className="text-[10px] font-mono-num font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {activeSessionsCount} active(s)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Arrivages citernes, clôture et reprise des sessions cuves
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* 3. Prix du carburant */}
            <button
              onClick={() => setCurrentView('prices')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600 shrink-0 group-hover:scale-105 transition-transform">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">
                      Prix du carburant
                    </span>
                    <span className={`text-[10px] font-mono-num font-bold px-2 py-0.5 rounded-full ${
                      activePrice ? 'bg-slate-100 text-slate-800' : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {activePrice ? formatPricePerLiter(activePrice.pricePerLiter) : 'Aucun prix défini'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activePrice
                      ? 'Ajuster le tarif officiel appliqué aux nouvelles distributions'
                      : 'Aucun prix défini. Définissez-le dans Plus > Tarification.'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* 4. Contrats Clients Prépayés */}
            <button
              onClick={() => setCurrentView('contrats')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200/60 flex items-center justify-center text-purple-600 shrink-0 group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 group-hover:text-purple-600 transition-colors">
                      Contrats Clients
                    </span>
                    <span className="text-[10px] font-mono-num font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {activeContractsCount} actif(s)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dotations prépayées, droits de tirage et valorisations
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* 5. Historique */}
            <button
              onClick={() => {
                setInitialHistoryCategory(null);
                setCurrentView('historique');
              }}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 shrink-0 group-hover:scale-105 transition-transform">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">
                      Historique & Traçabilité
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Journal des distributions, arbitrages de corrections et archives
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-VIEW 1: POMPISTES (WORKERS)                                */}
      {/* ============================================================== */}
      {currentView === 'workers' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentView('menu')}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                title="Retour au menu Plus"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Personnel & Pompistes</h3>
                <p className="text-[11px] text-slate-400">Comptes d'accès et affectation de poste active</p>
              </div>
            </div>

            <button
              onClick={() => {
                setEditingWorker(null);
                setWorkerForm({
                  name: '',
                  email: '',
                  password: '',
                  locationId: locations[0]?.id || '',
                });
                setIsWorkerModalOpen(true);
              }}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Pompiste</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
            {workers.map((w) => (
              <div key={w.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-950">{w.name}</span>
                    {!w.isActive && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">
                        Compte désactivé
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {w.email} · Affectation actuelle : <span className="font-semibold text-slate-800">{w.locationName}</span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditWorker(w)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    title="Modifier affectation"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleWorker(w)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      w.isActive ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'
                    }`}
                    title={w.isActive ? 'Désactiver compte' : 'Activer compte'}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-VIEW 2: SESSIONS CUVES                                     */}
      {/* ============================================================== */}
      {currentView === 'sessions' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentView('menu')}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                title="Retour au menu Plus"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Sessions d'Approvisionnement Cuves</h3>
                <p className="text-[11px] text-slate-400">Arrivages physiques citernes et stock disponible</p>
              </div>
            </div>

            <button
              onClick={() => {
                const nextNum = sessions.length + 1;
                const activeOfficialPrice = prices.find((p) => !p.effectiveTo)?.pricePerLiter;
                setSessionForm({
                  number: `Session #${nextNum.toString().padStart(3, '0')}`,
                  fuelIn: 10000,
                  pricePerLiter: activeOfficialPrice !== undefined ? activeOfficialPrice : '',
                  notes: 'Arrivage Citerne Nord',
                });
                setIsSessionModalOpen(true);
              }}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nouvelle Session</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
            {sessions.map((s) => {
              const remaining = Math.max(0, s.fuelIn - s.fuelOut);
              const isActive = s.status === 'Active';
              return (
                <div key={s.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num font-black text-sm text-slate-950">{s.number}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {s.status}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono-num font-semibold text-slate-700">
                        {formatPricePerLiter(s.pricePerLiter)}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono-num text-slate-500">
                      Reçu : <span className="font-bold text-slate-800">{formatNumber(s.fuelIn)} L</span> · Sorti : <span className="font-bold text-amber-700">{formatNumber(s.fuelOut)} L</span> · Reste disponible : <span className={`font-black ${remaining < 500 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatNumber(remaining)} L</span>
                    </div>

                    {s.notes && (
                      <div className="text-[11px] text-slate-400 italic">
                        {s.notes}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {isActive ? (
                      <button
                        onClick={() => handleToggleSessionStatus(s)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
                        title="Clôturer cette session (mettre en pause)"
                      >
                        Clôturer
                      </button>
                    ) : remaining > 0 ? (
                      <button
                        onClick={() => handleToggleSessionStatus(s)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors"
                        title="Réactiver cette session (reprendre)"
                      >
                        Réactiver
                      </button>
                    ) : (
                      <span
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed select-none"
                        title="Cette session est totalement épuisée (0 L restant) et ne peut plus être réactivée."
                      >
                        Épuisée (0 L)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-VIEW 3: PRIX DU CARBURANT                                  */}
      {/* ============================================================== */}
      {currentView === 'prices' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentView('menu')}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                title="Retour au menu Plus"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Historique des Prix Officiels</h3>
                <p className="text-[11px] text-slate-400">Taux officiel au litre en Francs Burundais (FBU)</p>
              </div>
            </div>

            <button
              onClick={openPriceModal}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nouveau Prix</span>
            </button>
          </div>

          {prices.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs text-center space-y-1.5">
              <p className="font-bold text-sm text-slate-900">Aucun prix défini</p>
              <p className="text-xs text-slate-500">
                Définissez le tarif officiel du carburant en cliquant sur « Nouveau Prix ».
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
              {prices.map((p) => {
                const isCurrent = !p.effectiveTo;
                return (
                  <div key={p.id} className="p-4 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num font-black text-base text-slate-950">
                          {formatPricePerLiter(p.pricePerLiter)}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            Prix Actif
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        En vigueur depuis le {new Date(p.effectiveFrom).toLocaleDateString('fr-FR')}
                        {p.effectiveTo && ` jusqu'au ${new Date(p.effectiveTo).toLocaleDateString('fr-FR')}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-VIEW 4: CONTRATS (DEDICATED CONTRATS ROOM)                 */}
      {/* ============================================================== */}
      {currentView === 'contrats' && (
        <AdminContratsRoom
          onBackToPlus={() => {
            setCurrentView('menu');
            loadData();
          }}
        />
      )}

      {/* ============================================================== */}
      {/* SUB-VIEW 5: HISTORIQUE (SUBORDINATED INSIDE PLUS)               */}
      {/* ============================================================== */}
      {currentView === 'historique' && (
        <AdminHistoriqueTab
          initialCategory={initialHistoryCategory}
          onBack={() => setCurrentView('menu')}
        />
      )}

      {/* MODAL WORKER */}
      {isWorkerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-950">
                {editingWorker ? 'Modifier Pompiste' : 'Nouveau Pompiste'}
              </h3>
              <button onClick={() => setIsWorkerModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateOrUpdateWorker} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nom complet</label>
                <input
                  type="text"
                  required
                  value={workerForm.name}
                  onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email de connexion</label>
                <input
                  type="email"
                  required
                  value={workerForm.email}
                  onChange={(e) => setWorkerForm({ ...workerForm, email: e.target.value })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
              {!editingWorker && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mot de passe provisoire</label>
                  <input
                    type="password"
                    required
                    value={workerForm.password}
                    onChange={(e) => setWorkerForm({ ...workerForm, password: e.target.value })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Poste d'affectation</label>
                <select
                  required
                  value={workerForm.locationId}
                  onChange={(e) => setWorkerForm({ ...workerForm, locationId: e.target.value })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs mt-2 disabled:opacity-50"
              >
                {isSubmitting ? 'Enregistrement...' : editingWorker ? 'Mettre à jour' : 'Créer le compte pompiste'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SESSION */}
      {isSessionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-950">Nouvelle Session Citerne</h3>
              <button onClick={() => setIsSessionModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSession} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Numéro / Désignation</label>
                <input
                  type="text"
                  required
                  value={sessionForm.number}
                  onChange={(e) => setSessionForm({ ...sessionForm, number: e.target.value })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Volume (L)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={sessionForm.fuelIn}
                    onChange={(e) => setSessionForm({ ...sessionForm, fuelIn: parseInt(e.target.value, 10) || 0 })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono-num font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prix (FBU/L)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={sessionForm.pricePerLiter}
                    onChange={(e) =>
                      setSessionForm({
                        ...sessionForm,
                        pricePerLiter: e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0,
                      })
                    }
                    placeholder="Ex: 4000"
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono-num font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Provenance</label>
                <input
                  type="text"
                  value={sessionForm.notes}
                  onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                  placeholder="Ex : Cuve centrale"
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs mt-2 disabled:opacity-50"
              >
                {isSubmitting ? 'Enregistrement...' : 'Enregistrer la Session'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRICE */}
      {isPriceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-950">
                {isConfirmingPrice ? 'Confirmation du Tarif' : 'Ajustement du Prix Officiel'}
              </h3>
              <button
                onClick={() => {
                  setIsPriceModalOpen(false);
                  setIsConfirmingPrice(false);
                  setPriceInputError(null);
                  setPriceModalError(null);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {priceModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{priceModalError}</span>
              </div>
            )}

            {!isConfirmingPrice ? (
              <form onSubmit={handleProceedToConfirm} className="space-y-3">
                <p className="text-xs text-slate-500">
                  Le changement de prix s'applique immédiatement aux futurs contrats. Les contrats existants gardent leur tarif historique.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prix au Litre (FBU/L)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newPriceInput}
                    onChange={(e) => {
                      setNewPriceInput(e.target.value);
                      if (priceInputError) setPriceInputError(null);
                      if (priceModalError) setPriceModalError(null);
                    }}
                    placeholder="Ex : 4000"
                    className="w-full h-12 px-3 text-lg font-mono-num font-black bg-slate-50 border border-slate-300 rounded-xl text-slate-950 focus:border-amber-500 focus:outline-none"
                  />
                  {priceInputError && (
                    <p className="text-xs font-semibold text-rose-600 mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{priceInputError}</span>
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors"
                >
                  Continuer
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
                  {activePrice ? (
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-700">
                        Prix actuel : <span className="font-mono-num font-bold text-slate-900">{formatNumber(activePrice.pricePerLiter)} FBU/L</span>
                      </div>
                      <div className="font-semibold text-slate-700">
                        → Nouveau prix : <span className="font-mono-num font-bold text-amber-700">{formatNumber(parseInt(newPriceInput.trim(), 10))} FBU/L</span>
                      </div>
                    </div>
                  ) : (
                    <div className="font-semibold text-slate-700">
                      Premier prix : <span className="font-mono-num font-bold text-amber-700">{formatNumber(parseInt(newPriceInput.trim(), 10))} FBU/L</span>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500 leading-relaxed pt-1 border-t border-slate-200/80">
                    S'applique uniquement aux nouveaux contrats. Les contrats existants gardent leur prix.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfirmingPrice(false);
                      setPriceModalError(null);
                    }}
                    disabled={isSubmitting}
                    className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSavePrice}
                    disabled={isSubmitting}
                    className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isSubmitting ? 'Enregistrement...' : 'Confirmer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
