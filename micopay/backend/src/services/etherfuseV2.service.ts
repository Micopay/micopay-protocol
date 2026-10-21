// Cliente de la API v2 de Etherfuse (docs.etherfuse.com/llms.txt).
//
// Modelo: cada usuario de MicoPay necesita su propia "personal organization"
// hija de la nuestra. Nuestra API key actua sobre esas hijas. El `sub` del JWT
// que firma `signLaunchToken` es el id de la personal org.
//
// Este archivo cubre solo lo que WP1 necesita en este slice: crear la org,
// mandar los datos de verificacion y leer el estado. Payment accounts, quotes
// y orders llegan en el siguiente slice.

import { breakers } from '../lib/breakers.js';
import { breakerFetch, isIdempotentMethod } from '../lib/circuitBreaker.js';
import { signLaunchToken } from '../lib/etherfuseJwt.js';

const V2_API = process.env.ETHERFUSE_V2_API_URL ?? process.env.ETHERFUSE_API_URL ?? 'https://api.sand.etherfuse.com';
const V2_APP = process.env.ETHERFUSE_V2_APP_URL ?? 'https://sandbox.etherfuse.com';

export class EtherfuseV2Error extends Error {
  constructor(public status: number, public code: string | null, message: string, public body?: unknown) {
    super(message);
    this.name = 'EtherfuseV2Error';
  }
}

async function v2Fetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.ETHERFUSE_API_KEY;
  if (!apiKey) throw new Error('ETHERFUSE_API_KEY no esta configurado');
  // v2 usa Authorization: Bearer <key> (v1 era sin prefijo, hay que cuidarlo).
  const res = await breakerFetch(breakers.etherfuse, `${V2_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  }, { idempotent: isIdempotentMethod(init.method) });
  return res;
}

async function v2Json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await v2Fetch(path, init);
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { /* vacio */ }
    const b = body as { code?: string; message?: string } | undefined;
    throw new EtherfuseV2Error(res.status, b?.code ?? null, b?.message ?? `${res.status} ${res.statusText}`, body);
  }
  return (await res.json()) as T;
}

// ---- Organizations ------------------------------------------------------

export type OrgAccountType = 'personal' | 'business';

export interface CreateOrgRequest {
  accountType: OrgAccountType;
  displayName: string;
  /** UUID; debe coincidir con el `sub` del JWT para que el launch amarre. */
  id: string;
  userInfo: { email: string; displayName: string };
}

export interface Organization {
  id: string;
  displayName: string;
  accountType: OrgAccountType;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Crea una personal org para un usuario. Idempotente desde el cliente: si
 * Etherfuse responde 409 porque la id ya existe, hace GET y devuelve la
 * existente. Asi la ruta publica puede llamarse mas de una vez.
 */
export async function createPersonalOrg(req: CreateOrgRequest): Promise<Organization> {
  try {
    return await v2Json<Organization>('/organization', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  } catch (err) {
    if (err instanceof EtherfuseV2Error && err.status === 409) {
      return await getOrganization(req.id);
    }
    throw err;
  }
}

export async function getOrganization(id: string): Promise<Organization> {
  return v2Json<Organization>(`/organization/${encodeURIComponent(id)}`);
}

// ---- Verification (KYC personal) ----------------------------------------

export interface VerificationAddress {
  street: string;
  city: string;
  /** ISO 3166-1 alpha-3, p.ej. "MEX". */
  country: string;
  region?: string | null;
  postalCode?: string | null;
  buildingNumber?: string | null;
  flatNumber?: string | null;
}

export interface SubmitVerificationRequest {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  /** RFC en Mexico. */
  taxId: string;
  /** ISO 3166-1 alpha-3. */
  country: string;
  address: VerificationAddress;
}

export type KycRequirementStatus = 'satisfied' | 'awaitingReview' | 'actionRequired' | 'requiresLaunch';

export interface VerificationStatus {
  overall: 'approved' | 'pending' | 'actionRequired' | 'rejected' | 'notStarted';
  personalData?: KycRequirementStatus;
  identityDocument?: KycRequirementStatus;
  taxDocument?: KycRequirementStatus;
  selfie?: KycRequirementStatus;
  occupation?: KycRequirementStatus;
  /** Mensaje legible devuelto por Etherfuse, si lo hay. */
  userMessage?: string | null;
}

export async function submitVerification(customerOrgId: string, data: SubmitVerificationRequest): Promise<VerificationStatus> {
  return v2Json<VerificationStatus>(`/organization/${encodeURIComponent(customerOrgId)}/verification`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getVerificationStatus(customerOrgId: string): Promise<VerificationStatus> {
  return v2Json<VerificationStatus>(`/organization/${encodeURIComponent(customerOrgId)}/verification/status`);
}

// ---- Launch de /idv -----------------------------------------------------

export interface LaunchForm {
  /** POST a esta URL con los `fields` como `application/x-www-form-urlencoded`. */
  url: string;
  fields: Record<string, string>;
}

/**
 * Devuelve lo necesario para abrir /idv en el navegador del telefono. El
 * cliente lo abre con POST (grant_type JWT bearer). Si queremos abrirlo sin
 * form, Etherfuse tambien acepta GET con los campos como query (no documentado
 * tan claro; preferimos POST para que el token no termine en el historial).
 *
 * @param customerOrgId  UUID de la personal org del usuario (= sub del JWT).
 * @param userInfo       email y nombre, exigidos en el JWT.
 * @param target         ruta del app (p.ej. "/kyc").
 * @param returnUrl      a donde regresar si el usuario sale.
 */
export function buildLaunchForm(
  customerOrgId: string,
  userInfo: { email: string; name: string },
  target: string = '/kyc',
  returnUrl?: string
): LaunchForm {
  const aud = `${V2_API.replace(/\/$/, '')}/auth/token`;
  const token = signLaunchToken(customerOrgId, {
    ttlSeconds: 300,
    extraClaims: {
      aud,
      scope: 'kyc',
      email: userInfo.email,
      name: userInfo.name,
    },
  });
  const fields: Record<string, string> = {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: token,
    target,
  };
  if (returnUrl) fields.return_url = returnUrl;
  return { url: `${V2_APP.replace(/\/$/, '')}/auth/launch`, fields };
}

// Para pruebas: permite inyectar hosts sin tocar process.env.
export const _INTERNAL = {
  getApiHost: () => V2_API,
  getAppHost: () => V2_APP,
};
