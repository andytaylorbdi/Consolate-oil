import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const loginSchema = z.object({
  email: z.string().email('Format email invalide'),
  password: z.string().min(6, 'Le mot de passe doit comporter au moins 6 caractères'),
});

export const adminPinSchema = z.object({
  pin: z.string().min(4, 'Le code PIN doit comporter au moins 4 chiffres'),
});

export const recordDistributionSchema = z.object({
  vehicleId: z.string().min(1, 'Véhicule obligatoire'),
  quantityLiters: z.number().int().positive('La quantité doit être un entier supérieur à zéro'),
  idempotencyKey: z.string().optional(),
  itemId: z.string().optional(),
  orderId: z.string().optional(),
});

export const createSessionSchema = z.object({
  fuelIn: z.number().int().positive('Le volume reçu doit être supérieur à zéro'),
  pricePerLiter: z.number().int().positive('Le prix par litre doit être supérieur à zéro'),
  number: z.string().min(1, 'Numéro de session requis'),
  notes: z.string().optional(),
});

export const createPriceSchema = z.object({
  pricePerLiter: z
    .number()
    .int('Le prix unitaire doit être un nombre entier')
    .positive('Le prix unitaire doit être supérieur à zéro')
    .max(100000, 'Le prix unitaire ne peut pas dépasser 100 000 FBU'),
});

export const correctionRequestSchema = z.object({
  distributionId: z.string().min(1, 'Identifiant de distribution requis'),
  reason: z.string().min(5, 'Motif de correction requis (minimum 5 caractères)'),
  proposedLiters: z.number().int().positive('Quantité proposée requise'),
});

export const organizationSchema = z
  .object({
    name: z.string().min(2, "Nom de l'organisation obligatoire"),
    type: z.enum(['Hôpital', 'Entreprise', 'ONG', 'Logistique', 'Service Public']),
    customerType: z.enum(['ORGANIZATION', 'INDIVIDUAL']).optional().default('ORGANIZATION'),
    location: z.string().min(2, 'Localisation obligatoire'),
    contactPerson: z.string().min(2, 'Nom du contact obligatoire'),
    phone: z.string().min(6, 'Numéro de téléphone obligatoire'),
    requestedLiters: z.number().int().positive().optional(),
    vehicle: z
      .object({
        registration: z.string().min(3, "Immatriculation de l'unique véhicule requise (minimum 3 caractères)"),
        type: z.string().min(2, 'Type de véhicule requis'),
        driverName: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      if (data.customerType === 'INDIVIDUAL') {
        return !!data.vehicle && typeof data.vehicle.registration === 'string' && data.vehicle.registration.trim().length >= 3;
      }
      return true;
    },
    {
      message: 'Un client individuel doit avoir un véhicule.',
      path: ['vehicle'],
    }
  );

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).optional(),
  type: z.enum(['Hôpital', 'Entreprise', 'ONG', 'Logistique', 'Service Public']).optional(),
  location: z.string().min(2).optional(),
  contactPerson: z.string().min(2).optional(),
  phone: z.string().min(6).optional(),
  requestedLiters: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const vehicleSchema = z.object({
  registration: z.string().min(3, 'Immatriculation invalide'),
  type: z.string().min(2, 'Type de véhicule requis'),
  organizationId: z.string().min(1, 'Organisation obligatoire'),
  driverName: z.string().optional().default('Non assigné'),
});

export const updateVehicleSchema = z.object({
  registration: z.string().min(3).optional(),
  type: z.string().min(2).optional(),
  organizationId: z.string().min(1).optional(),
  driverName: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateSessionSchema = z.object({
  status: z.enum(['Active', 'Terminée']).optional(),
  notes: z.string().optional(),
  pricePerLiter: z.number().int().positive().optional(),
});

export const createOrderSchema = z.object({
  scheduledDate: z.string().min(1, 'Date prévue obligatoire (YYYY-MM-DD)'),
  title: z.string().optional(),
  sessionId: z.string().min(1, 'Session requise'),
  locationId: z.string().min(1, 'Emplacement requis'),
  vehicleIds: z.array(z.string()).min(1, 'Au moins un véhicule requis dans le programme'),
});

export const reorderItemsSchema = z.object({
  orderedItemIds: z.array(z.string()).min(1, 'Ordre des éléments requis'),
});

export const updateItemStatusSchema = z.object({
  status: z.enum(['WAITING', 'CURRENT', 'SERVED', 'ABSENT']),
});

export const workerSchema = z.object({
  name: z.string().min(2, 'Nom du pompiste requis'),
  email: z.string().email('Email valide requis'),
  password: z.string().min(6, 'Mot de passe de 6 caractères minimum').optional(),
  locationId: z.string().min(1, 'Affectation de dépôt obligatoire'),
  isActive: z.boolean().optional().default(true),
});

export const updateWorkerSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().optional(),
  locationId: z.string().optional(),
});

export const createContractSchema = z.object({
  customerType: z.enum(['ORGANIZATION', 'INDIVIDUAL']),
  organizationId: z.string().min(1, 'Identifiant du client requis'),
  contractedLiters: z.number().int().positive('Les litres contractés doivent être supérieurs à zéro'),
  startDate: z.string().min(1, 'Date de début de contrat requise'),
});

export const suspendContractSchema = z.object({
  adminPin: z.string().optional(),
  reason: z.string().optional(),
});

/**
 * Helper middleware that validates request body against a Zod schema.
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = (result.error.issues || []).map((e: any) => e.message).join(', ') || result.error.message;
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: issues },
      });
    }
    req.body = result.data;
    next();
  };
}
