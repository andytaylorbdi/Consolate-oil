import React, { useState } from 'react';
import { WorkerDashboardData } from '../../types/api.ts';
import { api } from '../../services/api.ts';
import {
  Clock,
  AlertTriangle,
  FileText,
  Calendar,
  Truck,
  CheckCircle2,
  X,
  Send,
} from 'lucide-react';
import { formatNumber, formatFBU } from '../../utils/formatters.ts';

interface WorkerHistoriqueProps {
  dashboard: WorkerDashboardData | null;
  onRefreshDashboard: () => Promise<void>;
}

export const WorkerHistorique: React.FC<WorkerHistoriqueProps> = ({
  dashboard,
  onRefreshDashboard,
}) => {
  const [filter, setFilter] = useState<'all' | 'today'>('today');

  // Correction Modal State
  const [selectedDist, setSelectedDist] = useState<any | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [proposedLiters, setProposedLiters] = useState('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const distributions = dashboard?.recentDistributions || [];
  const pendingCorrections = dashboard?.pendingCorrections || [];

  const handleOpenCorrection = (dist: any) => {
    setSelectedDist(dist);
    setProposedLiters(dist.quantityLiters.toString());
    setCorrectionReason('');
    setFeedbackMsg(null);
  };

  const handleSendCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDist) return;

    const parsed = parseInt(proposedLiters, 10);
    if (!parsed || parsed <= 0) {
      setFeedbackMsg({ type: 'error', text: 'Volume proposé invalide.' });
      return;
    }

    if (correctionReason.trim().length < 5) {
      setFeedbackMsg({ type: 'error', text: 'Le motif doit comporter au moins 5 caractères.' });
      return;
    }

    setIsSubmittingCorrection(true);
    setFeedbackMsg(null);

    const res = await api.worker.requestCorrection(
      selectedDist.id,
      correctionReason.trim(),
      parsed
    );

    setIsSubmittingCorrection(false);

    if (res.success) {
      setFeedbackMsg({
        type: 'success',
        text: 'Demande de correction transmise. Statut : En attente.',
      });
      await onRefreshDashboard();
      setTimeout(() => {
        setSelectedDist(null);
        setFeedbackMsg(null);
      }, 1500);
    } else {
      setFeedbackMsg({
        type: 'error',
        text: res.error?.message || "Erreur lors de l'envoi de la demande.",
      });
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header Summary */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Activités Pompiste
          </span>
          <h2 className="text-base font-bold text-slate-900 mt-0.5">
            Mon Historique de Sorties
          </h2>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setFilter('today')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              filter === 'today' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
              filter === 'all' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Toutes ({distributions.length})
          </button>
        </div>
      </div>

      {/* Pending Corrections Notification */}
      {pendingCorrections.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <FileText className="w-4 h-4 text-amber-500" />
            <span>Demandes de Correction en cours</span>
          </div>
          <div className="space-y-2">
            {pendingCorrections.map((corr: any) => (
              <div
                key={corr.id}
                className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">
                    Correction vers {corr.proposedLiters} L
                  </span>
                  <span className="font-bold px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 uppercase">
                    {corr.status === 'PENDING' ? 'En attente' : corr.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 italic">"{corr.reason}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden divide-y divide-slate-100">
        {distributions.length > 0 ? (
          distributions.map((dist: any) => {
            const dateObj = new Date(dist.createdAt);
            const timeStr = dateObj.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const dateStr = dateObj.toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'short',
            });

            return (
              <div key={dist.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num font-bold text-sm text-slate-950">
                      {dist.vehicleRegistrationSnapshot}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-slate-700">
                      {dist.organizationNameSnapshot}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center gap-2 font-mono-num">
                    <span className="font-extrabold text-slate-800">
                      {formatNumber(dist.quantityLiters)} L
                    </span>
                    <span>·</span>
                    <span className="text-amber-800 font-semibold">
                      {formatFBU(dist.totalCostFBU)}
                    </span>
                    <span>·</span>
                    <span className="text-slate-400">{timeStr}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <button
                    onClick={() => handleOpenCorrection(dist)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-[11px] font-semibold text-slate-600 hover:text-amber-900 transition-colors"
                  >
                    Signaler une erreur
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            Aucune distribution enregistrée
          </div>
        )}
      </div>

      {/* CORRECTION MODAL */}
      {selectedDist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-950">Signaler une erreur</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Opération #{selectedDist.vehicleRegistrationSnapshot} · {selectedDist.quantityLiters} L
                </p>
              </div>
              <button
                onClick={() => setSelectedDist(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedbackMsg && (
              <div
                className={`p-3 rounded-xl border text-xs font-semibold ${
                  feedbackMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                {feedbackMsg.text}
              </div>
            )}

            <form onSubmit={handleSendCorrection} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Volume réel servi (Litres)
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={proposedLiters}
                  onChange={(e) => setProposedLiters(e.target.value)}
                  className="w-full h-11 px-3 text-sm font-mono-num font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pourquoi signalez-vous cette opération ?
                </label>
                <textarea
                  required
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Ex : Mauvaise frappe clavier sur le volume lors de la saisie."
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedDist(null)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCorrection}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmittingCorrection ? 'Envoi...' : 'Envoyer la demande'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
