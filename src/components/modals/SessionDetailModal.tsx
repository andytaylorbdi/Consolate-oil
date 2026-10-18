import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import {
  X,
  Calendar,
  DollarSign,
  Fuel,
  CheckCircle2,
  Clock,
  Truck,
  ArrowRight,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { formatNumber, formatFBU, formatPricePerLiter, formatProgramTitle } from '../../utils/formatters.ts';

interface SessionDetailModalProps {
  sessionId: string | null;
  onClose: () => void;
  onSelectProgram?: (programId: string) => void;
}

export const SessionDetailModal: React.FC<SessionDetailModalProps> = ({
  sessionId,
  onClose,
  onSelectProgram,
}) => {
  const [data, setData] = useState<{
    session: any;
    programs: any[];
    analytics: any;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    api.admin
      .getSession(sessionId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError(res.error?.message || 'Session introuvable.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load session details:', err);
        setError('Erreur lors du chargement de la session.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  if (!sessionId) return null;

  const session = data?.session;
  const programs = data?.programs || [];
  const analytics = data?.analytics || {};

  const fuelIn = session?.fuelIn || 0;
  const fuelOut = session?.fuelOut || 0;
  const fuelRemaining = Math.max(0, session?.fuelRemaining ?? (fuelIn - fuelOut));
  const isTerminated = session?.status === 'Terminée' || fuelRemaining === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-lg sm:text-xl text-white">
                {session?.number || 'Session Cuve'}
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  isTerminated
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {isTerminated ? '🔴 Session terminée' : '🟢 Session active'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
              <span>{formatPricePerLiter(session?.pricePerLiter || 3950)}</span>
              {session?.startedAt && (
                <>
                  <span>·</span>
                  <span>Début : {new Date(session.startedAt).toLocaleDateString('fr-FR')}</span>
                </>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 font-medium text-xs flex items-center justify-center gap-2">
            <Fuel className="w-4 h-4 animate-pulse text-amber-500" />
            <span>Chargement des archives de la session...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-xs">
            {error}
          </div>
        ) : (
          <div className="p-5 overflow-y-auto space-y-4">
            {/* Status explanation banner */}
            <div
              className={`rounded-xl p-3 text-xs flex items-start gap-2.5 border ${
                isTerminated
                  ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                  : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              }`}
            >
              {isTerminated ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold text-xs">
                  {isTerminated
                    ? 'Session Épuisée & Clôturée'
                    : 'Session Actuellement en Cours de Distribution'}
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                  {isTerminated
                    ? 'L’intégralité du carburant réceptionné a été distribuée aux programmes autorisés. Le stock est à 0 L.'
                    : 'Cette citerne dispose de stock utilisable pour les programmes de distribution opérationnels.'}
                </p>
              </div>
            </div>

            {/* Fuel Quantities Breakdown */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Bilan Volumétrique Physique
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Reçu</div>
                  <div className="text-base font-black font-mono-num text-slate-900 mt-0.5">
                    {formatNumber(fuelIn)} L
                  </div>
                  <div className="text-[10px] text-slate-400">Total entrée</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Distribué</div>
                  <div className="text-base font-black font-mono-num text-amber-700 mt-0.5">
                    {formatNumber(fuelOut)} L
                  </div>
                  <div className="text-[10px] text-slate-400">Sorties réelles</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Restant</div>
                  <div
                    className={`text-base font-black font-mono-num mt-0.5 ${
                      fuelRemaining === 0 ? 'text-slate-400' : 'text-emerald-700'
                    }`}
                  >
                    {formatNumber(fuelRemaining)} L
                  </div>
                  <div className="text-[10px] text-slate-400">En citerne</div>
                </div>
              </div>
            </div>

            {/* Analytics & Dates Card */}
            <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Date de début :</span>
                <span className="font-mono-num font-medium text-white">
                  {session?.startedAt ? new Date(session.startedAt).toLocaleDateString('fr-FR') : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span>Date de fin :</span>
                <span className="font-mono-num font-medium text-white">
                  {session?.endedAt
                    ? new Date(session.endedAt).toLocaleDateString('fr-FR')
                    : isTerminated
                    ? 'Clôturée'
                    : 'En cours'}
                </span>
              </div>

              <div className="h-px bg-slate-800" />

              <div className="flex items-center justify-between text-slate-300">
                <span>Valeur totale distribuée :</span>
                <span className="font-mono-num font-bold text-amber-400">
                  {formatFBU(analytics.totalValueDistributedFBU || fuelOut * (session?.pricePerLiter || 3950))}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-300">
                <span>Véhicules servis sur cette session :</span>
                <span className="font-mono-num font-bold text-emerald-400">
                  {analytics.totalVehiclesServed || 0} véhicule(s)
                </span>
              </div>
            </div>

            {/* Section 18: PROGRAMMES DE DISTRIBUTION AYANT UTILISÉ CETTE SESSION */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-amber-600" />
                    <span>Programmes de distribution</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {programs.length} programme{programs.length > 1 ? 's ont' : ' a'} participé à cette session
                  </p>
                </div>
              </div>

              {programs.length > 0 ? (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white">
                  {programs.map((prog) => (
                    <div
                      key={prog.id}
                      onClick={() => onSelectProgram && onSelectProgram(prog.id)}
                      className={`p-3 text-xs flex items-center justify-between transition-colors ${
                        onSelectProgram
                          ? 'cursor-pointer hover:bg-amber-50/60 group'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
                            {prog.title || formatProgramTitle(prog.scheduledDate)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 pl-6">
                          {prog.servedVehicles} / {prog.totalVehicles} véhicules servis
                          {prog.totalDistributedLiters > 0 && ` · ${formatNumber(prog.totalDistributedLiters)} L distribués`}
                        </div>
                      </div>

                      {onSelectProgram && (
                        <div className="flex items-center gap-1 text-slate-400 group-hover:text-amber-700 text-xs font-semibold">
                          <span>Voir</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
                  Aucun programme de distribution n'a encore été rattaché à cette session.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
