import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import {
  X,
  Calendar,
  Layers,
  MapPin,
  Truck,
  CheckCircle2,
  Clock,
  UserX,
  ChevronLeft,
  Fuel,
} from 'lucide-react';
import { formatNumber, formatFBU, formatProgramTitle } from '../../utils/formatters.ts';

interface ProgramDetailModalProps {
  programId: string | null;
  onClose: () => void;
  onBackToSession?: () => void;
}

export const ProgramDetailModal: React.FC<ProgramDetailModalProps> = ({
  programId,
  onClose,
  onBackToSession,
}) => {
  const [data, setData] = useState<{
    order: any;
    session: any;
    location: any;
    items: any[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!programId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    api.admin
      .getDistributionOrder(programId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError(res.error?.message || 'Programme introuvable.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load program details:', err);
        setError('Erreur lors du chargement du programme.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [programId]);

  if (!programId) return null;

  const order = data?.order;
  const session = data?.session;
  const location = data?.location;
  const items = data?.items || [];

  const servedCount = items.filter((i) => i.isServed || i.status === 'SERVED').length;
  const totalLitersServed = items
    .filter((i) => i.isServed || i.status === 'SERVED')
    .reduce((acc, i) => acc + (i.suggestedLiters || 100), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            {onBackToSession && (
              <button
                onClick={onBackToSession}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                title="Retour à la session"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-base sm:text-lg text-white">
                  {order?.displayName || formatProgramTitle(order?.scheduledDate || '')}
                </h2>
                {order?.category && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      order.category === 'TODAY'
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                        : order.category === 'UPCOMING'
                        ? 'bg-blue-400/20 text-blue-300 border border-blue-400/30'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {order.category === 'TODAY'
                      ? "Aujourd'hui"
                      : order.category === 'UPCOMING'
                      ? 'À venir'
                      : 'Archivé'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Fiche officielle d'autorisation de distribution journalière
              </p>
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

        {/* Content */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 font-medium text-xs flex items-center justify-center gap-2">
            <Truck className="w-4 h-4 animate-pulse text-amber-500" />
            <span>Chargement des détails du programme...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-xs">
            {error}
          </div>
        ) : (
          <div className="p-5 overflow-y-auto space-y-4">
            {/* Metadata Summary Cards */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  <span>Date Prévue</span>
                </div>
                <div className="font-bold text-slate-900 mt-1">
                  {order?.scheduledDate ? formatProgramTitle(order.scheduledDate).replace('Programme du ', '') : '—'}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                  <Layers className="w-3 h-3 text-blue-500" />
                  <span>Session Cuve</span>
                </div>
                <div className="font-bold text-slate-900 mt-1">
                  {session?.number || order?.sessionNumber || 'Session'}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                  <MapPin className="w-3 h-3 text-emerald-600" />
                  <span>Lieu</span>
                </div>
                <div className="font-bold text-slate-900 mt-1 truncate">
                  {location?.name || order?.locationName || 'Bujumbura'}
                </div>
              </div>
            </div>

            {/* Participation & Execution Statistics */}
            <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 text-[11px] block">Véhicules Inscrits au Programme</span>
                <span className="font-bold text-base text-white mt-0.5 block">
                  {items.length} véhicule{items.length > 1 ? 's' : ''} autorisé{items.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">Taux de Service</span>
                <span className="font-mono-num font-bold text-base text-emerald-400 mt-0.5 block">
                  {servedCount} / {items.length} servis
                </span>
              </div>
            </div>

            {/* Authorized Vehicles Queue List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-700">
                  Véhicules & Bénéficiaires Autorisés ({items.length})
                </span>
              </div>

              {items.length > 0 ? (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white">
                  {items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className={`p-3 text-xs flex items-center justify-between gap-3 ${
                        item.isServed || item.status === 'SERVED'
                          ? 'bg-slate-50/70 text-slate-500'
                          : item.status === 'CURRENT'
                          ? 'bg-amber-50/80 font-medium'
                          : item.status === 'ABSENT'
                          ? 'bg-rose-50/50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center font-mono-num font-bold text-slate-700 text-[11px] shrink-0">
                          #{item.sequenceOrder}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono-num font-bold text-slate-900">
                              {item.registration}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="font-semibold text-slate-800 truncate">
                              {item.organizationName}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {item.vehicleType} {item.driverName && `· Chauffeur: ${item.driverName}`}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.isServed || item.status === 'SERVED'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                              : item.status === 'CURRENT'
                              ? 'bg-amber-100 text-amber-900 border border-amber-200'
                              : item.status === 'ABSENT'
                              ? 'bg-rose-100 text-rose-900 border border-rose-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {item.isServed || item.status === 'SERVED'
                            ? 'Servi'
                            : item.status === 'CURRENT'
                            ? 'À la pompe'
                            : item.status === 'ABSENT'
                            ? 'Absent'
                            : 'En attente'}
                        </span>
                        {item.servedAt && (
                          <div className="text-[10px] text-slate-400 font-mono-num mt-0.5">
                            {new Date(item.servedAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
                  Aucun véhicule associé à ce programme.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
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
