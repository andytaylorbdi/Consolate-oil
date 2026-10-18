import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import {
  History,
  Fuel,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ArrowRight,
  ShieldAlert,
  Calendar,
  DollarSign,
  ChevronLeft,
  Truck,
  ArrowUpRight,
  SlidersHorizontal,
} from 'lucide-react';
import {
  formatNumber,
  formatFBU,
  formatPricePerLiter,
  formatProgramTitle,
} from '../../utils/formatters.ts';
import { SessionDetailModal } from '../modals/SessionDetailModal.tsx';
import { ProgramDetailModal } from '../modals/ProgramDetailModal.tsx';

type HistoryCategory = 'distributions' | 'corrections' | 'sessions' | 'orders' | 'prices';

interface AdminHistoriqueTabProps {
  initialCategory?: HistoryCategory | null;
  onBack?: () => void;
}

export const AdminHistoriqueTab: React.FC<AdminHistoriqueTabProps> = ({
  initialCategory = null,
  onBack,
}) => {
  const [activeCategory, setActiveCategory] = useState<HistoryCategory | null>(initialCategory);

  const [data, setData] = useState<{
    sessions: any[];
    distributions: any[];
    prices: any[];
    orders: any[];
    corrections: any[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modals for historical drill-down
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  // Review Correction State
  const [activeCorrectionId, setActiveCorrectionId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const fetchHistory = async () => {
    try {
      const res = await api.admin.getHistory();
      if (res.success && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleReviewCorrection = async (id: string, action: 'APPROVE' | 'REJECT') => {
    setIsReviewing(true);
    const res = await api.admin.reviewCorrection(id, action, action === 'REJECT' ? rejectionReason : undefined);
    setIsReviewing(false);
    if (res.success) {
      setActiveCorrectionId(null);
      setRejectionReason('');
      await fetchHistory();
    } else {
      alert(res.error?.message || 'Erreur lors de la validation de la correction.');
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-500 font-medium text-xs flex items-center justify-center gap-2">
        <History className="w-5 h-5 animate-pulse text-amber-500" />
        <span>Chargement des archives certifiées...</span>
      </div>
    );
  }

  const distributions = data?.distributions || [];
  const sessions = data?.sessions || [];
  const orders = data?.orders || [];
  const prices = data?.prices || [];
  const corrections = data?.corrections || [];

  const pendingCorrectionsCount = corrections.filter((c) => c.status === 'PENDING').length;
  const totalVolumeDistributed = distributions.reduce((acc, d) => acc + (d.quantityLiters || 0), 0);
  const activeSessionsCount = sessions.filter((s) => s.status === 'Active').length;

  const categories = [
    {
      id: 'distributions' as HistoryCategory,
      title: 'Distributions de Carburant',
      shortTitle: 'Distributions',
      count: distributions.length,
      unit: 'sorties',
      description: 'Journal certifié et immuable de chaque sortie aux véhicules',
      badge: `${formatNumber(totalVolumeDistributed)} L servis`,
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
      icon: Fuel,
      iconColor: 'text-amber-600 bg-amber-50 border-amber-200/60',
    },
    {
      id: 'sessions' as HistoryCategory,
      title: 'Sessions Cuves & Arrivages',
      shortTitle: 'Sessions Cuves',
      count: sessions.length,
      unit: 'sessions',
      description: 'Historique des approvisionnements physiques des citernes',
      badge: `${activeSessionsCount} en cours`,
      badgeColor: 'bg-blue-50 text-blue-800 border-blue-200/80',
      icon: Layers,
      iconColor: 'text-blue-600 bg-blue-50 border-blue-200/60',
    },
    {
      id: 'orders' as HistoryCategory,
      title: 'Programmes de Distribution',
      shortTitle: 'Programmes',
      count: orders.length,
      unit: 'programmes',
      description: 'Historique exhaustif de tous les programmes de distribution journaliers',
      badge: `${orders.length} archivé(s)`,
      badgeColor: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
      icon: Truck,
      iconColor: 'text-indigo-600 bg-indigo-50 border-indigo-200/60',
    },
    {
      id: 'corrections' as HistoryCategory,
      title: 'Demandes de Correction',
      shortTitle: 'Corrections',
      count: corrections.length,
      unit: 'demandes',
      description: 'Signalements pompistes & arbitrages de la direction',
      badge: pendingCorrectionsCount > 0 ? `${pendingCorrectionsCount} en attente` : 'Tout est traité',
      badgeColor: pendingCorrectionsCount > 0 ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-slate-100 text-slate-700 border-slate-200',
      icon: ShieldAlert,
      iconColor: 'text-rose-600 bg-rose-50 border-rose-200/60',
    },
    {
      id: 'prices' as HistoryCategory,
      title: 'Historique des Prix',
      shortTitle: 'Tarification',
      count: prices.length,
      unit: 'paliers',
      description: 'Périodes d\'application tarifaire et instantanés officiels',
      badge: prices[0] ? formatPricePerLiter(prices[0].pricePerLiter) : 'Tarif en vigueur',
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
      icon: DollarSign,
      iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-200/60',
    },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ============================================================== */}
      {/* MODE 1: SMOOTH CATEGORY CARDS HUB (Overview)                   */}
      {/* ============================================================== */}
      {!activeCategory && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div>
              {onBack && (
                <button
                  onClick={onBack}
                  className="mb-2 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Menu Plus</span>
                </button>
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Archives & Traçabilité Officielle
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                Sélectionnez une catégorie d'historique
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Consultez les détails certifiés par thématique opérationnelle.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span>5 catégories disponibles</span>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className="group bg-white rounded-2xl p-5 border border-slate-200/90 hover:border-amber-400/90 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between relative overflow-hidden"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${cat.iconColor}`}>
                        <Icon className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide whitespace-nowrap ${cat.badgeColor}`}>
                        {cat.badge}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-slate-900 group-hover:text-amber-600 transition-colors">
                        {cat.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {cat.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-mono-num font-bold text-slate-800">
                      {cat.count} <span className="font-medium text-slate-400 text-[11px]">{cat.unit}</span>
                    </span>

                    <span className="font-semibold text-amber-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Consulter</span>
                      <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODE 2: CATEGORY DETAIL VIEW + COMPACT CATEGORY SWITCHER       */}
      {/* ============================================================== */}
      {activeCategory && (
        <div className="space-y-3 animate-in fade-in duration-150">
          {/* Top Return Header & Smooth Category Switcher */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                <span>Retour aux catégories</span>
              </button>

              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Catégorie Ouverte
                </span>
                <span className="text-xs font-extrabold text-slate-900">
                  {categories.find((c) => c.id === activeCategory)?.title}
                </span>
              </div>
            </div>

            {/* Quick Switch Strip Between Categories */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    activeCategory === c.id
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200/60'
                  }`}
                >
                  {c.shortTitle} ({c.count})
                </button>
              ))}
            </div>
          </div>

          {/* 1. DISTRIBUTIONS HISTORY */}
          {activeCategory === 'distributions' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Journal Immuable des Sorties de Carburant</h3>
                  <p className="text-[11px] text-slate-400">Instantanés certifiés avec volume, prix unitaire et total</p>
                </div>
                <span className="text-xs font-mono-num font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                  {distributions.length} enregistrements
                </span>
              </div>

              {distributions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {distributions.map((d) => {
                    const dt = new Date(d.createdAt);
                    return (
                      <div key={d.id} className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70 transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono-num font-black text-sm text-slate-950">
                              {d.vehicleRegistrationSnapshot}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="font-bold text-slate-800">{d.organizationNameSnapshot}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 font-mono-num">
                            <span className="font-extrabold text-slate-900">{formatNumber(d.quantityLiters)} L</span>
                            <span> × </span>
                            <span>{formatNumber(d.pricePerLiter)} FBU/L</span>
                            <span> = </span>
                            <span className="font-bold text-amber-800">{formatFBU(d.totalCostFBU)}</span>
                          </div>
                        </div>

                        <div className="text-right text-[11px] text-slate-400 font-mono-num">
                          <div className="font-medium text-slate-600">{dt.toLocaleDateString('fr-FR')}</div>
                          <div>{dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Aucune distribution enregistrée pour le moment.
                </div>
              )}
            </div>
          )}

          {/* 2. SESSIONS HISTORY (SECTION 17: VOIR LA SESSION DRILL-DOWN) */}
          {activeCategory === 'sessions' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-900">Historique des Sessions Cuves</h3>
                <p className="text-[11px] text-slate-400">Cliquez sur une session pour examiner sa consommation et ses programmes rattachés</p>
              </div>

              {sessions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {sessions.map((s) => {
                    const remaining = Math.max(0, s.fuelIn - s.fuelOut);
                    const isTerminated = s.status === 'Terminée' || remaining === 0;

                    return (
                      <div
                        key={s.id}
                        onClick={() => setSelectedSessionId(s.id)}
                        className="p-4 flex items-center justify-between gap-3 text-xs hover:bg-amber-50/50 transition-colors cursor-pointer group"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono-num font-black text-sm text-slate-950 group-hover:text-amber-800 transition-colors">
                              {s.number}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                isTerminated
                                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {isTerminated ? '🔴 Terminée' : '🟢 Active'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1.5 font-mono-num">
                            Reçu : <span className="font-bold text-slate-800">{formatNumber(s.fuelIn)} L</span> · Sorti : <span className="font-bold text-amber-800">{formatNumber(s.fuelOut)} L</span> · Reste : <span className={`font-black ${remaining === 0 ? 'text-slate-400' : 'text-emerald-700'}`}>{formatNumber(remaining)} L</span>
                          </div>
                          {s.notes && <div className="text-[11px] text-slate-400 mt-0.5 italic">{s.notes}</div>}
                        </div>

                        <div className="text-right text-[11px] font-mono-num text-slate-700 flex items-center gap-3">
                          <div>
                            <div className="font-bold">{formatPricePerLiter(s.pricePerLiter)}</div>
                            <div className="text-slate-400 text-[10px] mt-0.5">
                              {new Date(s.startedAt).toLocaleDateString('fr-FR')}
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Aucune session enregistrée.
                </div>
              )}
            </div>
          )}

          {/* 3. PROGRAMMES DE DISTRIBUTION (SECTION 7 & 9 & 21: FULL ARCHIVE) */}
          {activeCategory === 'orders' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-900">Archives des Programmes de Distribution</h3>
                <p className="text-[11px] text-slate-400">Tous les programmes planifiés (passés, aujourd'hui et à venir). Cliquez pour ouvrir le détail.</p>
              </div>

              {orders.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => setSelectedProgramId(o.id)}
                      className="p-4 flex items-center justify-between text-xs hover:bg-amber-50/50 transition-colors cursor-pointer group"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm group-hover:text-amber-800 transition-colors">
                            {o.title || formatProgramTitle(o.scheduledDate)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              o.status === 'ACTIVE'
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {o.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 font-mono-num">
                          Date prévue : {formatProgramTitle(o.scheduledDate).replace('Programme du ', '')} · Créé le {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400 group-hover:text-amber-700 font-semibold text-xs">
                        <span>Détails</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Aucun programme de distribution archivé.
                </div>
              )}
            </div>
          )}

          {/* 4. CORRECTIONS WORKFLOW REVIEW */}
          {activeCategory === 'corrections' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-900">Arbitrage des Demandes de Correction</h3>
                <p className="text-[11px] text-slate-400">
                  Contrôlées par la direction. L'approbation recalcule le stock et la transaction de manière traçable.
                </p>
              </div>

              {corrections.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {corrections.map((c) => {
                    const isPending = c.status === 'PENDING';
                    return (
                      <div key={c.id} className="p-4 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900 text-sm">
                              Volume Proposé : {formatNumber(c.proposedLiters)} L
                            </span>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Demandé le {new Date(c.createdAt).toLocaleDateString('fr-FR')} à {new Date(c.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>

                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                              c.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : c.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800 border-rose-200'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {c.status === 'PENDING' ? 'En attente' : c.status === 'APPROVED' ? 'Approuvée' : 'Rejetée'}
                          </span>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 italic text-[11px]">
                          « {c.reason} »
                        </div>

                        {/* Actions if pending */}
                        {isPending && (
                          <div className="pt-2 flex items-center gap-2">
                            <button
                              onClick={() => handleReviewCorrection(c.id, 'APPROVE')}
                              disabled={isReviewing}
                              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approuver et rectifier</span>
                            </button>

                            <button
                              onClick={() => handleReviewCorrection(c.id, 'REJECT')}
                              disabled={isReviewing}
                              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Rejeter</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Aucune demande de correction soumise.
                </div>
              )}
            </div>
          )}

          {/* 5. PRICES HISTORY */}
          {activeCategory === 'prices' && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-900">Périodes d'Application Tarifaire</h3>
                <p className="text-[11px] text-slate-400">Évolution chronologique du prix officiel par litre de carburant</p>
              </div>

              {prices.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {prices.map((p) => (
                    <div key={p.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/70 transition-colors">
                      <div>
                        <span className="font-mono-num font-black text-base text-slate-950">
                          {formatPricePerLiter(p.pricePerLiter)}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-1 font-mono-num">
                          Du {new Date(p.effectiveFrom).toLocaleDateString('fr-FR')}
                          {p.effectiveTo ? ` au ${new Date(p.effectiveTo).toLocaleDateString('fr-FR')}` : ' (En vigueur)'}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${p.effectiveTo ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>
                        {p.effectiveTo ? 'Archivé' : 'Actif'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Aucun historique tarifaire.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SESSION DETAIL MODAL */}
      <SessionDetailModal
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
        onSelectProgram={(progId) => {
          setSelectedProgramId(progId);
        }}
      />

      {/* PROGRAM DETAIL MODAL */}
      <ProgramDetailModal
        programId={selectedProgramId}
        onClose={() => setSelectedProgramId(null)}
        onBackToSession={selectedSessionId ? () => setSelectedProgramId(null) : undefined}
      />
    </div>
  );
};
