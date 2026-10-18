import React from 'react';
import { WorkerDashboardData } from '../../types/api.ts';
import {
  MapPin,
  Clock,
  Truck,
  ArrowRight,
  Flame,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { formatNumber, formatPricePerLiter } from '../../utils/formatters.ts';

interface WorkerAccueilProps {
  dashboard: WorkerDashboardData | null;
  onStartFocus: () => void;
  onGoToHistorique: () => void;
}

export const WorkerAccueil: React.FC<WorkerAccueilProps> = ({
  dashboard,
  onStartFocus,
  onGoToHistorique,
}) => {
  const worker = dashboard?.worker;
  const location = dashboard?.currentLocation;
  const currentSession = dashboard?.currentSession;
  const nextVehicle = dashboard?.nextVehicle;
  const todayCount = dashboard?.ownActivityCount || 0;
  const todayLiters = dashboard?.ownTodayLiters || 0;
  const pendingCorrections = dashboard?.pendingCorrections || [];

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Welcome Banner */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Session Pompiste
            </span>
            <h1 className="text-lg font-bold text-slate-950 mt-0.5">
              Bonjour, {worker?.name || 'Pompiste'}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>En Service</span>
          </div>
        </div>

        {/* Location & Active Fuel Session Info */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Lieu actuel
              </span>
              <span className="font-semibold text-slate-800 line-clamp-1">
                {location?.name || 'Dépôt Central'}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                Session Active
              </span>
              <span className="font-mono-num font-bold text-slate-900">
                {currentSession?.number || 'Aucune'}
              </span>
              {currentSession && (
                <span className="text-[10px] text-slate-500 block">
                  {formatNumber(currentSession.fuelRemaining)} L dispo
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Focus Entry Point Card */}
      <div className="bg-white rounded-3xl p-5 border-2 border-amber-400 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-amber-950">
              PROCHAIN VÉHICULE EN ATTENTE
            </h2>
          </div>
          {nextVehicle && (
            <span className="text-xs font-mono-num font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900">
              N° {nextVehicle.sequenceOrder} dans la file
            </span>
          )}
        </div>

        {nextVehicle ? (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-black font-mono-num tracking-tight text-slate-950">
                    {nextVehicle.registration}
                  </div>
                  <div className="text-sm font-bold text-slate-800 mt-0.5">
                    {nextVehicle.organizationName}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {nextVehicle.type} · Chauffeur : {nextVehicle.driverName}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-xs">
                <span className="text-slate-500">Volume suggéré</span>
                <span className="font-mono-num font-extrabold text-slate-900">
                  {nextVehicle.suggestedLiters} Litres
                </span>
              </div>
            </div>

            {/* Commencer le Focus */}
            <button
              onClick={onStartFocus}
              className="w-full h-14 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.99] transition-all"
            >
              <span>Commencer le Focus</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        ) : (
          <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" />
            <h3 className="font-bold text-sm text-slate-900">File vide ou terminée</h3>
            <p className="text-xs text-slate-500">
              Tous les véhicules de l'ordre de distribution du jour ont été servis.
            </p>
          </div>
        )}
      </div>

      {/* Today's Activity Summary Box */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Mon Bilan Aujourd'hui
          </span>
          <button
            onClick={onGoToHistorique}
            className="text-xs font-semibold text-amber-700 hover:underline flex items-center gap-1"
          >
            <span>Voir l'historique</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">
              Distributions
            </span>
            <span className="font-mono-num font-black text-xl text-slate-900 mt-0.5 block">
              {todayCount}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] text-slate-400 font-semibold uppercase block">
              Litres Servis
            </span>
            <span className="font-mono-num font-black text-xl text-slate-900 mt-0.5 block">
              {formatNumber(todayLiters)} L
            </span>
          </div>
        </div>
      </div>

      {/* Pending Correction Alert if any */}
      {pendingCorrections.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-900">
          <FileText className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">
              {pendingCorrections.length} demande(s) de correction en attente
            </span>
            <span className="text-[11px] text-amber-800 mt-0.5 block">
              Vos signalements d'erreur sont en cours d'examen par la direction.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
