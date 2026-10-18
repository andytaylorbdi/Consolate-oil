import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import {
  Building2,
  Truck,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Phone,
  Power,
  Edit2,
} from 'lucide-react';

type GestionSubSection = 'orgs' | 'vehicles';

export const AdminGestionTab: React.FC = () => {
  const [section, setSection] = useState<GestionSubSection>('orgs');
  const [isLoading, setIsLoading] = useState(true);

  // Data states strictly scoped to Core Business Entities: Organizations & Vehicles
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  // Modals state
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);

  // Edit states
  const [editingOrg, setEditingOrg] = useState<any | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);

  // Feedback banner state
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forms state
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
  const [orgForm, setOrgForm] = useState({
    name: '',
    type: 'Hôpital' as 'Hôpital' | 'Entreprise' | 'ONG' | 'Logistique' | 'Service Public',
    customerType: 'ORGANIZATION' as 'ORGANIZATION' | 'INDIVIDUAL',
    location: 'Bujumbura',
    contactPerson: '',
    phone: '',
    requestedLiters: 1000,
    vehicleRegistration: '',
    vehicleType: 'Véhicule Particulier',
    vehicleDriverName: '',
  });

  const [vehForm, setVehForm] = useState({
    registration: '',
    type: 'Ambulance',
    organizationId: '',
    driverName: '',
  });

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [orgsRes, vehsRes] = await Promise.all([
        api.admin.getOrganizations(),
        api.admin.getVehicles(),
      ]);

      if (orgsRes.success && orgsRes.data) {
        const orgList = orgsRes.data.organizations || [];
        setOrganizations(orgList);
        if (orgList[0]) {
          setVehForm((prev) => ({ ...prev, organizationId: orgList[0].id }));
        }
      }

      if (vehsRes.success && vehsRes.data) {
        setVehicles(vehsRes.data.vehicles || []);
      }
    } catch (err) {
      console.error('Error loading gestion data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // 1. Organization Actions
  // 1. Organization Actions
  const handleCreateOrUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingOrg && orgForm.customerType === 'INDIVIDUAL') {
      const reg = orgForm.vehicleRegistration.trim().toUpperCase();
      if (!reg || reg.length < 3) {
        setFormErrors({ vehicleRegistration: "L'immatriculation est obligatoire (minimum 3 caractères)." });
        return;
      }
      const vType = orgForm.vehicleType.trim();
      if (vType.length < 2) {
        setFormErrors({ vehicleType: 'Le type de véhicule est requis (minimum 2 caractères).' });
        return;
      }
    }

    setFormErrors({});
    setIsSubmitting(true);

    try {
      let res;
      if (editingOrg) {
        res = await api.admin.updateOrganization(editingOrg.id, {
          name: orgForm.name,
          type: orgForm.type,
          location: orgForm.location,
          contactPerson: orgForm.contactPerson,
          phone: orgForm.phone,
          requestedLiters: orgForm.requestedLiters,
        });
      } else {
        const payload: any = {
          name: orgForm.name,
          type: orgForm.type,
          customerType: orgForm.customerType,
          location: orgForm.location,
          contactPerson: orgForm.contactPerson,
          phone: orgForm.phone,
          requestedLiters: orgForm.requestedLiters,
        };
        if (orgForm.customerType === 'INDIVIDUAL') {
          payload.vehicle = {
            registration: orgForm.vehicleRegistration.trim().toUpperCase(),
            type: orgForm.vehicleType.trim() || 'Véhicule Particulier',
            driverName: orgForm.vehicleDriverName.trim() || orgForm.contactPerson.trim() || orgForm.name.trim(),
          };
        }
        res = await api.admin.createOrganization(payload);
      }

      if (res.success) {
        setIsOrgModalOpen(false);
        setEditingOrg(null);
        showFeedback(
          'success',
          orgForm.customerType === 'INDIVIDUAL'
            ? 'Client individuel et son véhicule créés avec succès.'
            : `Organisation ${editingOrg ? 'mise à jour' : 'créée'} avec succès.`
        );
        await loadAllData();
      } else {
        showFeedback('error', res.error?.message || "Erreur lors de l'enregistrement de l'organisation.");
      }
    } catch (err: any) {
      showFeedback('error', err.message || "Erreur inattendue lors de l'enregistrement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleOrg = async (id: string) => {
    const res = await api.admin.toggleOrganization(id);
    if (res.success) {
      showFeedback('success', 'Statut de l\'organisation modifié.');
      await loadAllData();
    } else {
      showFeedback('error', res.error?.message || 'Erreur lors de la modification.');
    }
  };

  const handleOpenEditOrg = (org: any) => {
    setEditingOrg(org);
    setFormErrors({});
    setOrgForm({
      name: org.name,
      type: org.type,
      customerType: org.customerType || 'ORGANIZATION',
      location: org.location,
      contactPerson: org.contactPerson,
      phone: org.phone,
      requestedLiters: org.requestedLiters || 1000,
      vehicleRegistration: '',
      vehicleType: 'Véhicule Particulier',
      vehicleDriverName: '',
    });
    setIsOrgModalOpen(true);
  };

  // 2. Vehicle Actions
  const handleCreateOrUpdateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    let res;
    if (editingVehicle) {
      res = await api.admin.updateVehicle(editingVehicle.id, vehForm);
    } else {
      res = await api.admin.createVehicle(vehForm);
    }
    setIsSubmitting(false);

    if (res.success) {
      setIsVehicleModalOpen(false);
      setEditingVehicle(null);
      showFeedback('success', `Véhicule ${editingVehicle ? 'mis à jour' : 'créé'} avec succès.`);
      await loadAllData();
    } else {
      showFeedback('error', res.error?.message || "Erreur lors de l'enregistrement du véhicule.");
    }
  };

  const handleToggleVehicle = async (id: string) => {
    const res = await api.admin.toggleVehicle(id);
    if (res.success) {
      showFeedback('success', 'Statut du véhicule modifié.');
      await loadAllData();
    } else {
      showFeedback('error', res.error?.message || 'Erreur lors de la modification.');
    }
  };

  const handleOpenEditVehicle = (veh: any) => {
    setEditingVehicle(veh);
    setVehForm({
      registration: veh.registration,
      type: veh.type,
      organizationId: veh.organizationId,
      driverName: veh.driverName,
    });
    setIsVehicleModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-500 font-medium text-xs flex items-center justify-center gap-2">
        <Building2 className="w-5 h-5 animate-pulse text-amber-500" />
        <span>Chargement des entités opérationnelles...</span>
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

      {/* Sub-navigation bar strictly for Organisations & Véhicules */}
      <div className="bg-white rounded-2xl p-1.5 border border-slate-200/90 shadow-xs flex items-center gap-1">
        <button
          onClick={() => setSection('orgs')}
          className={`flex-1 px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            section === 'orgs'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Organisations ({organizations.length})</span>
        </button>
        <button
          onClick={() => setSection('vehicles')}
          className={`flex-1 px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            section === 'vehicles'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Véhicules ({vehicles.length})</span>
        </button>
      </div>

      {/* 1. ORGANIZATIONS MANAGEMENT */}
      {section === 'orgs' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Registre des Organisations</h3>
              <p className="text-[11px] text-slate-400">Entités juridiques, contacts et bénéficiaires</p>
            </div>
            <button
              onClick={() => {
                setEditingOrg(null);
                setFormErrors({});
                setOrgForm({
                  name: '',
                  type: 'Hôpital',
                  customerType: 'ORGANIZATION',
                  location: 'Bujumbura',
                  contactPerson: '',
                  phone: '',
                  requestedLiters: 1000,
                  vehicleRegistration: '',
                  vehicleType: 'Véhicule Particulier',
                  vehicleDriverName: '',
                });
                setIsOrgModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Créer Organisation</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {organizations.map((org) => (
              <div key={org.id} className="p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{org.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        org.customerType === 'INDIVIDUAL'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {org.customerType === 'INDIVIDUAL' ? 'Client Individuel' : org.type}
                    </span>
                    {!org.isActive && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                        Désactivé
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {org.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {org.contactPerson} ({org.phone})
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-medium text-slate-700">
                      {org.vehiclesCount || 0} véhicule{org.vehiclesCount > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEditOrg(org)}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    title="Modifier"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleOrg(org.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      org.isActive
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-slate-400 hover:bg-slate-100'
                    }`}
                    title={org.isActive ? 'Désactiver' : 'Activer'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. VEHICLES MANAGEMENT */}
      {section === 'vehicles' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Registre des Véhicules</h3>
              <p className="text-[11px] text-slate-400">Plaques d'immatriculation et cumuls reçus</p>
            </div>
            <button
              onClick={() => {
                setEditingVehicle(null);
                setVehForm({
                  registration: '',
                  type: 'Ambulance',
                  organizationId: organizations[0]?.id || '',
                  driverName: '',
                });
                setIsVehicleModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Véhicule</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {vehicles.map((veh) => (
              <div key={veh.id} className="p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num font-extrabold text-sm text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {veh.registration}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">{veh.type}</span>
                    {!veh.isActive && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                        Désactivé
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                    <span>Client : <strong className="text-slate-800">{veh.organizationName}</strong></span>
                    <span>· Chauffeur : {veh.driverName || 'Non assigné'}</span>
                    <span>· Cumul reçu : <strong className="font-mono-num text-amber-700">{veh.totalReceivedLiters || 0} L</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEditVehicle(veh)}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    title="Modifier"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleVehicle(veh.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      veh.isActive
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-slate-400 hover:bg-slate-100'
                    }`}
                    title={veh.isActive ? 'Désactiver' : 'Activer'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: ORGANISATION (CREATE / EDIT) */}
      {isOrgModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingOrg ? 'Modifier l\'Organisation' : 'Nouvelle Organisation'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Identité juridique et contact référent</p>
              </div>
              <button
                onClick={() => setIsOrgModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdateOrg} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {orgForm.customerType === 'INDIVIDUAL' ? 'Nom et Prénom du Client' : "Nom de l'Organisation / Entreprise"}
                </label>
                <input
                  type="text"
                  required
                  value={orgForm.name}
                  onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                  className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type de Client</label>
                  <select
                    value={orgForm.customerType}
                    disabled={!!editingOrg}
                    onChange={(e) => {
                      setOrgForm({ ...orgForm, customerType: e.target.value as any });
                      setFormErrors({});
                    }}
                    className="w-full h-11 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl disabled:opacity-60"
                  >
                    <option value="ORGANIZATION">Organisation</option>
                    <option value="INDIVIDUAL">Individuel (1 seul véhicule)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Catégorie</label>
                  <select
                    value={orgForm.type}
                    onChange={(e) => setOrgForm({ ...orgForm, type: e.target.value as any })}
                    className="w-full h-11 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                  >
                    <option value="Hôpital">Hôpital</option>
                    <option value="Entreprise">Entreprise</option>
                    <option value="ONG">ONG</option>
                    <option value="Logistique">Logistique</option>
                    <option value="Service Public">Service Public</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Localisation / Ville</label>
                <input
                  type="text"
                  required
                  value={orgForm.location}
                  onChange={(e) => setOrgForm({ ...orgForm, location: e.target.value })}
                  className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {orgForm.customerType === 'INDIVIDUAL' ? 'Personne de Contact / Référent' : 'Personne Contact'}
                  </label>
                  <input
                    type="text"
                    required
                    value={orgForm.contactPerson}
                    onChange={(e) => setOrgForm({ ...orgForm, contactPerson: e.target.value })}
                    className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Téléphone</label>
                  <input
                    type="text"
                    required
                    value={orgForm.phone}
                    onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                    className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono-num"
                  />
                </div>
              </div>

              {/* Extra vehicle fields for INDIVIDUAL customer on creation */}
              {orgForm.customerType === 'INDIVIDUAL' && !editingOrg && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 text-slate-800">
                    <Truck className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Véhicule unique rattaché (obligatoire)
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Immatriculation <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={orgForm.vehicleRegistration}
                      onChange={(e) => {
                        setOrgForm({ ...orgForm, vehicleRegistration: e.target.value.toUpperCase() });
                        if (formErrors.vehicleRegistration) {
                          setFormErrors((prev) => ({ ...prev, vehicleRegistration: '' }));
                        }
                      }}
                      placeholder="Ex : IT 1234"
                      className="w-full h-11 px-3 text-xs bg-white border border-slate-300 rounded-xl font-mono uppercase font-bold text-slate-900"
                    />
                    {formErrors.vehicleRegistration && (
                      <p className="text-[11px] font-semibold text-rose-600 mt-1">
                        {formErrors.vehicleRegistration}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Type / Modèle
                      </label>
                      <input
                        type="text"
                        value={orgForm.vehicleType}
                        onChange={(e) => {
                          setOrgForm({ ...orgForm, vehicleType: e.target.value });
                          if (formErrors.vehicleType) {
                            setFormErrors((prev) => ({ ...prev, vehicleType: '' }));
                          }
                        }}
                        placeholder="Ex : Véhicule Particulier"
                        className="w-full h-11 px-3 text-xs bg-white border border-slate-300 rounded-xl"
                      />
                      {formErrors.vehicleType && (
                        <p className="text-[11px] font-semibold text-rose-600 mt-1">
                          {formErrors.vehicleType}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nom du conducteur <span className="text-slate-400 font-normal">(Optionnel)</span>
                      </label>
                      <input
                        type="text"
                        value={orgForm.vehicleDriverName}
                        onChange={(e) => setOrgForm({ ...orgForm, vehicleDriverName: e.target.value })}
                        placeholder={orgForm.contactPerson || orgForm.name || 'Nom du client'}
                        className="w-full h-11 px-3 text-xs bg-white border border-slate-300 rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOrgModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Enregistrement...' : editingOrg ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VÉHICULE (CREATE / EDIT) */}
      {isVehicleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingVehicle ? 'Modifier le Véhicule' : 'Enregistrer un Véhicule'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Plaque d'immatriculation et rattachement client</p>
              </div>
              <button
                onClick={() => setIsVehicleModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrUpdateVehicle} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Immatriculation (Plaque)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: AB 1234"
                  value={vehForm.registration}
                  onChange={(e) => setVehForm({ ...vehForm, registration: e.target.value.toUpperCase() })}
                  className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono-num font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Organisation / Client de Rattachement
                </label>
                <select
                  value={vehForm.organizationId}
                  onChange={(e) => setVehForm({ ...vehForm, organizationId: e.target.value })}
                  className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.customerType === 'INDIVIDUAL' ? 'Individuel' : org.type})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Note : un client individuel ne peut posséder qu'un seul véhicule.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type de Véhicule</label>
                  <input
                    type="text"
                    required
                    placeholder="Ambulance, Pickup..."
                    value={vehForm.type}
                    onChange={(e) => setVehForm({ ...vehForm, type: e.target.value })}
                    className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nom du Chauffeur</label>
                  <input
                    type="text"
                    placeholder="Optionnel"
                    value={vehForm.driverName}
                    onChange={(e) => setVehForm({ ...vehForm, driverName: e.target.value })}
                    className="w-full h-11 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsVehicleModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Enregistrement...' : editingVehicle ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
