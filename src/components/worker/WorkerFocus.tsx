import React, { useState } from 'react';
import { WorkerDashboardData } from '../../types/api.ts';
import { api } from '../../services/api.ts';
import {
  Truck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Flame,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { formatNumber, formatFBU, formatPricePerLiter } from '../../utils/formatters.ts';

interface WorkerFocusProps {
  dashboard: WorkerDashboardData | null;
  litersInput: string;
  setLitersInput: (val: string) => void;
  onRefreshDashboard: () => Promise<void>;
}

export const WorkerFocus: React.FC<WorkerFocusProps> = ({
  dashboard,
  litersInput,
  setLitersInput,
  onRefreshDashboard,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success Confirmation State
  const [lastSuccess, setLastSuccess] = useState<{
    registration: string;
    organization: string;
    liters: number;
    totalCostFBU: number;
  } | null>(null);

  const nextVehicle = dashboard?.nextVehicle;
  const currentSession = dashboard?.currentSession;
  const unitPrice = nextVehicle?.contractPricePerLiter ?? null;
  const parsedLiters = Math.max(0, parseInt(litersInput, 10) || 0);
  const calculatedCost = unitPrice !== null ? parsedLiters * unitPrice : 0;
  const availableStock = currentSession?.fuelRemaining || 0;
  const isExceedingStock = parsedLiters > availableStock;

  const handleConfirmDistribution = async () => {
    if (!nextVehicle) return;

    if (unitPrice === null) {
      setErrorMessage('Aucun contrat actif pour ce véhicule. Distribution impossible.');
      return;
    }

    if (!parsedLiters || parsedLiters <= 0) {
      setErrorMessage('Veuillez saisir un volume supérieur à zéro.');
      return;
    }

    if (isExceedingStock) {
      setErrorMessage(`Stock insuffisant en cuve : ${availableStock} L disponibles.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    // Client idempotency key protects against accidental double taps
    const idempotencyKey = `worker-${nextVehicle.vehicleId}-${Date.now()}`;

    const res = await api.worker.recordDistribution(
      nextVehicle.vehicleId,
      parsedLiters,
      idempotencyKey,
      nextVehicle.itemId,
      nextVehicle.orderId || dashboard?.distributionOrder?.id
    );

    setIsSubmitting(false);

    if (res.success) {
      setLastSuccess({
        registration: nextVehicle.registration,
        organization: nextVehicle.organizationName,
        liters: parsedLiters,
        totalCostFBU: calculatedCost,
      });

      // Refresh data so next vehicle is loaded
      await onRefreshDashboard();
    } else {
      setErrorMessage(res.error?.message || "La distribution n'a pas pu être enregistrée.");
    }
  };

  const handleNextVehicleAction = () => {
    setLastSuccess(null);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* SUCCESS STATE CONFIRMATION SCREEN */}
      {lastSuccess ? (
        <div className="bg-white rounded-3xl p-6 border-2 border-emerald-500 shadow-lg text-center space-y-5 animate-in zoom-in-95 duration-150">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
          </div>

          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 block">
              Distribution Enregistrée
            </span>
            <div className="text-2xl font-black font-mono-num text-slate-950 mt-1">
              {lastSuccess.registration}
            </div>
            <div className="text-xs font-semibold text-slate-600 mt-0.5">
              {lastSuccess.organization}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-2 text-center">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                Volume servi
              </span>
              <span className="font-mono-num font-black text-lg text-slate-900 mt-0.5 block">
                {formatNumber(lastSuccess.liters)} L
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                Montant débité
              </span>
              <span className="font-mono-num font-black text-lg text-amber-700 mt-0.5 block">
                {formatFBU(lastSuccess.totalCostFBU)}
              </span>
            </div>
          </div>

          <button
            onClick={handleNextVehicleAction}
            className="w-full h-14 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.99] transition-all"
          >
            <span>Véhicule suivant</span>
            <ArrowRight className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      ) : (
        /* STANDARD FOCUS MODE FORM */
        <div className="space-y-4">
          {/* Header Context Bar */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-xs flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Cuve active
              </span>
              <span className="font-mono-num font-bold text-slate-900">
                {currentSession?.number || 'Session en cours'}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Stock disponible
              </span>
              <span
                className={`font-mono-num font-extrabold text-sm ${
                  availableStock < 500 ? 'text-rose-600' : 'text-emerald-700'
                }`}
              >
                {formatNumber(availableStock)} L
              </span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl border bg-rose-50 border-rose-300 text-rose-900 flex items-center gap-2.5 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* PROCHAIN VÉHICULE CARD */}
          <div className="bg-white rounded-3xl p-5 border-2 border-amber-400 shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-amber-950">
                  FOCUS · PROCHAIN VÉHICULE
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
                {/* Vehicle Presentation */}
                <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4">
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
                </div>

                {/* Liters Input & Quick Presets */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Litres distribués
                    </label>
                    <div className="flex items-center gap-1.5">
                      {[50, 100, 200].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setLitersInput(preset.toString())}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition-transform"
                        >
                          {preset} L
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={litersInput}
                      onChange={(e) => setLitersInput(e.target.value)}
                      placeholder="100"
                      className="w-full h-14 px-4 pr-16 text-2xl font-extrabold font-mono-num bg-slate-50 border-2 border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-slate-950"
                    />
                    <span className="absolute right-4 top-4 text-sm font-bold text-slate-400">
                      L
                    </span>
                  </div>

                  {isExceedingStock && (
                    <p className="flex items-center gap-1.5 text-xs text-rose-600 font-semibold pt-1">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Stock insuffisant pour cette distribution ({availableStock} L restants).</span>
                    </p>
                  )}
                </div>

                {/* Automatic Authoritative Price Calculation */}
                {unitPrice !== null ? (
                  <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                      <span>Prix unitaire</span>
                      <span className="font-mono-num text-slate-300">
                        {formatPricePerLiter(unitPrice)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-300">
                        {formatNumber(parsedLiters)} L × {formatNumber(unitPrice)} FBU
                      </span>
                      <span className="text-xl font-black font-mono-num text-amber-400">
                        = {formatFBU(calculatedCost)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border bg-rose-50 border-rose-300 text-rose-900 flex items-center gap-2.5 text-xs font-semibold">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>Aucun contrat actif pour ce véhicule. Distribution impossible.</span>
                  </div>
                )}

                {/* Confirm Action Button */}
                <button
                  type="button"
                  onClick={handleConfirmDistribution}
                  disabled={isSubmitting || parsedLiters <= 0 || isExceedingStock || unitPrice === null}
                  className="w-full h-14 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Enregistrement en cours...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                      <span>Enregistrer la distribution</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <h3 className="font-bold text-sm text-slate-900">Aucun véhicule en attente</h3>
                <p className="text-xs text-slate-500 mt-1">
                  La file de distribution opérationnelle est entièrement complétée.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
