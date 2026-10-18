import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import {
  Fuel,
  TrendingUp,
  Truck,
  Users,
  AlertTriangle,
  Clock,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  FileText,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { formatNumber, formatFBU, formatPricePerLiter, formatProgramTitle } from '../../utils/formatters.ts';
import { SessionDetailModal } from '../modals/SessionDetailModal.tsx';
import { ProgramDetailModal } from '../modals/ProgramDetailModal.tsx';

export const AdminAccueilTab: React.FC = () => {
  const { setActiveTab, setPlusSubSection } = useApp();
  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [selectedSessionModalId, setSelectedSessionModalId] = useState<string | null>(null);
  const [selectedProgramModalId, setSelectedProgramModalId] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      const res = await api.admin.getOverview();
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load admin overview:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-500 font-medium text-xs flex items-center justify-center gap-2">
        <Fuel className="w-4 h-4 animate-pulse text-amber-500" />
        <span>Chargement de la situation opérationnelle...</span>
      </div>
    );
  }

  const fuel = data?.fuel;
  const ops = data?.operations;
  const workers = data?.workers || [];
  const pendingCorrectionsCount = data?.pendingCorrectionsCount || 0;

  const currentSession = fuel?.currentSession;
  const currentSessionRemaining = currentSession ? Math.max(0, currentSession.fuelRemaining ?? (currentSession.fuelIn - currentSession.fuelOut)) : 0;
  const isSessionTerminated = !currentSession || currentSession.isTerminated || currentSession.status === 'Terminée' || currentSessionRemaining === 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* 1. MONITORING SITUATION CARBURANT & SESSION LIFECYCLE */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <Fuel className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Supervision Cuves & Approvisionnement
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Situation Globale du Carburant
              </h2>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
              Prix Officiel
            </span>
            <span className="text-xs font-mono-num font-bold text-slate-900">
              {fuel?.currentPricePerLiter ? formatPricePerLiter(fuel.currentPricePerLiter) : 'Aucun prix défini'}
            </span>
          </div>
        </div>

        {/* SECTION 13 & 14 & 15: CURRENT SESSION LIFECYCLE CARD */}
        {currentSession ? (
          !isSessionTerminated ? (
            /* ACTIVE SESSION WITH FUEL REMAINING */
            <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-300/80 flex items-center justify-center text-base shrink-0">
                  ⛽
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 font-mono-num">
                      {currentSession.number}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                      🟢 Session active
                    </span>
                  </div>
                  <span className="text-xs text-emerald-900 font-semibold mt-0.5 block font-mono-num">
                    {formatNumber(currentSessionRemaining)} L disponibles
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  onClick={() => setSelectedSessionModalId(currentSession.id)}
                  className="px-3.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-950 text-xs font-bold rounded-xl border border-emerald-300/80 shadow-xs active:scale-95 transition-all"
                >
                  Voir la session
                </button>
              </div>
            </div>
          ) : (
            /* TERMINATED / EXHAUSTED SESSION */
            <div className="bg-rose-50/90 border border-rose-200/90 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-300/80 flex items-center justify-center text-base shrink-0">
                  ⛽
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900 font-mono-num">
                      {currentSession.number}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 uppercase tracking-wider">
                      🔴 Session terminée
                    </span>
                  </div>
                  <span className="text-xs text-rose-900 font-semibold mt-0.5 block font-mono-num">
                    Stock épuisé · 0 L restant
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                <button
                  onClick={() => setSelectedSessionModalId(currentSession.id)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 shadow-xs active:scale-95 transition-all"
                >
                  Voir la session
                </button>
                <button
                  onClick={() => {
                    setPlusSubSection('sessions');
                    setActiveTab('plus');
                  }}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Créer une nouvelle session</span>
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-base">⛽</span>
              <div>
                <span className="text-xs font-bold text-slate-900">Aucune session enregistrée</span>
                <span className="text-[11px] text-slate-500 block">Initialisez un arrivage citerne</span>
              </div>
            </div>
            <button
              onClick={() => {
                setPlusSubSection('sessions');
                setActiveTab('plus');
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl"
            >
              Créer une session
            </button>
          </div>
        )}

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {/* 1. Total Carburant Reçu */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">
              Total Carburant Reçu
            </span>
            <span className="font-mono-num font-extrabold text-lg text-slate-900 mt-0.5 block">
              {formatNumber(fuel?.totalFuelReceived || 0)} L
            </span>
            <span className="text-[10px] text-slate-500">Toutes sessions confondues</span>
          </div>

          {/* 2. Total Carburant Sorti (on its right) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">
              Total Carburant Sorti
            </span>
            <span className="font-mono-num font-extrabold text-lg text-amber-700 mt-0.5 block">
              {formatNumber(fuel?.totalFuelDistributed || 0)} L
            </span>
            <span className="text-[10px] text-slate-500">Distributions consolidées</span>
          </div>

          {/* 3. Stock Actif Disponible (under Total Carburant Reçu) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">
              Stock Actif Disponible
            </span>
            <span className="font-mono-num font-extrabold text-lg text-emerald-700 mt-0.5 block">
              {formatNumber(fuel?.activeStockLiters || 0)} L
            </span>
            <span className="text-[10px] text-slate-500">
              {fuel?.activeSessions?.length || 0} session(s) approvisionnée(s)
            </span>
          </div>

          {/* 4. Valeur du Stock Restant (on its right) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">
              Valeur du Stock Restant
            </span>
            <span className="font-mono-num font-extrabold text-base text-slate-900 mt-0.5 block truncate">
              {fuel?.currentPricePerLiter ? formatFBU((fuel?.activeStockLiters || 0) * fuel.currentPricePerLiter) : '—'}
            </span>
            <span className="text-[10px] text-slate-500">Au cours applicable</span>
          </div>
        </div>
      </div>

      {/* 1.1 SITUATION DES CONTRATS PRÉPAYÉS */}
      {data?.contracts && (
        <div
          onClick={() => {
            setPlusSubSection('contrats');
            setActiveTab('plus');
          }}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-2.5 cursor-pointer hover:border-amber-400 transition-all group"
          title="Consulter et gérer les contrats clients dans Plus → Contrats"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Engagements Clients Prépayés
                </span>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                  Contrats Actifs & Solde à Distribuer
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-1 text-slate-400 group-hover:text-amber-600 text-xs font-semibold transition-colors">
              <span>Gérer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Clients Sous Contrat</span>
              <span className="font-mono-num font-black text-base text-emerald-800 mt-0.5 block">
                {data.contracts.totalActiveContracts || 0}
              </span>
              <span className="text-[10px] text-slate-500">Contrats actifs</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Litres Restants</span>
              <span className="font-mono-num font-black text-base text-slate-900 mt-0.5 block">
                {formatNumber(data.contracts.totalRemainingLiters || 0)} L
              </span>
              <span className="text-[10px] text-slate-500">Droit de tirage</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Avances Restantes</span>
              <span className="font-mono-num font-black text-sm text-slate-900 mt-1 block truncate">
                {formatFBU(data.contracts.totalRemainingAmountFBU || 0)}
              </span>
              <span className="text-[10px] text-slate-500">Trésorerie engagée</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. SITUATION OPÉRATIONNELLE DU JOUR */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Programme & Opérations du Jour
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                Progression de la Distribution
              </h2>
            </div>
          </div>

          {ops?.activeOrder && (
            <button
              onClick={() => setSelectedProgramModalId(ops.activeOrder.id)}
              className="text-xs font-mono-num font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors"
              title="Consulter le programme du jour"
            >
              {ops.activeOrder.displayName || ops.activeOrder.title}
            </button>
          )}
        </div>

        {/* 4 Status Breakdown Counters */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">En Attente</span>
            <span className="font-mono-num font-black text-base text-slate-900 mt-0.5 block">
              {ops?.waitingVehiclesCount || 0}
            </span>
          </div>

          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-amber-800 block">À la Pompe</span>
            <span className="font-mono-num font-black text-base text-amber-900 mt-0.5 block">
              {ops?.currentVehiclesCount || 0}
            </span>
          </div>

          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-emerald-800 block">Servis</span>
            <span className="font-mono-num font-black text-base text-emerald-900 mt-0.5 block">
              {ops?.servedVehiclesCount || 0}
            </span>
          </div>

          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
            <span className="text-[10px] font-bold uppercase text-rose-800 block">Absents</span>
            <span className="font-mono-num font-black text-base text-rose-900 mt-0.5 block">
              {ops?.absentVehiclesCount || 0}
            </span>
          </div>
        </div>

        {/* Today's volume and value total */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
            <span className="text-slate-500">Volume servi aujourd'hui :</span>
            <span className="font-mono-num font-bold text-slate-900">
              {formatNumber(ops?.todayLiters || 0)} L
            </span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
            <span className="text-slate-500">Montant total débité :</span>
            <span className="font-mono-num font-bold text-amber-700">
              {formatFBU(ops?.todayFBU || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. WORKERS & CURRENT ASSIGNMENTS */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Pompistes en Service & Affectations Actives
            </h3>
          </div>
          <span className="text-xs font-mono-num font-semibold text-slate-500">
            {workers.length} pompiste(s)
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {workers.map((w: any) => (
            <div key={w.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    w.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
                <div>
                  <span className="font-bold text-slate-900 block">{w.name}</span>
                  <span className="text-[11px] text-slate-500">{w.email}</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Poste actuel</span>
                <span className="font-semibold text-slate-800 text-[11px]">
                  {w.currentLocation}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. PENDING CORRECTIONS COMPACT ALERT */}
      {pendingCorrectionsCount > 0 && (
        <div
          onClick={() => {
            setPlusSubSection('historique-corrections');
            setActiveTab('plus');
          }}
          className="bg-amber-50 border border-amber-200 hover:border-amber-400 rounded-2xl p-4 flex items-center justify-between text-xs cursor-pointer shadow-xs hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-3 text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold block text-slate-900 group-hover:text-amber-700 transition-colors">
                {pendingCorrectionsCount} demande(s) de correction en attente d'arbitrage
              </span>
              <span className="text-[11px] text-amber-800">
                Cliquez pour examiner les pièces justificatives et arbitrer dans Plus → Historique.
              </span>
            </div>
          </div>
          <div className="shrink-0 text-amber-600 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            <span className="hidden sm:inline">Examiner</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* SESSION DETAIL MODAL (VOIR LA SESSION) */}
      <SessionDetailModal
        sessionId={selectedSessionModalId}
        onClose={() => setSelectedSessionModalId(null)}
        onSelectProgram={(progId) => {
          setSelectedProgramModalId(progId);
        }}
      />

      {/* PROGRAM DETAIL MODAL */}
      <ProgramDetailModal
        programId={selectedProgramModalId}
        onClose={() => setSelectedProgramModalId(null)}
        onBackToSession={selectedSessionModalId ? () => setSelectedProgramModalId(null) : undefined}
      />
    </div>
  );
};
