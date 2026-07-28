const ETHERFUSE_API = process.env.ETHERFUSE_API_URL ?? "https://api.etherfuse.com";

export interface EtherfuseRampAsset {
  identifier: string; // "CODE:ISSUER" on Stellar
  symbol: string;
  name: string;
  currency: string | null;
  balance: string | null;
  image: string | null;
}

// Authenticated client for the /ramp/* endpoints. Sandbox keys go in the
// Authorization header with no "Bearer" prefix — unlike most REST APIs.
function etherfuseRampClient(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.ETHERFUSE_API_KEY;
  if (!apiKey) {
    throw new Error("ETHERFUSE_API_KEY not configured");
  }

  return fetch(`${ETHERFUSE_API}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

// GET /ramp/assets requires blockchain, currency (sort priority), and a
// wallet address (Etherfuse uses it to enrich the response with balances).
export async function getRampAssets(
  wallet: string,
  currency = "mxn"
): Promise<EtherfuseRampAsset[]> {
  const params = new URLSearchParams({ blockchain: "stellar", currency, wallet });
  const response = await etherfuseRampClient(`/ramp/assets?${params}`);
  if (!response.ok) {
    throw new Error(`Etherfuse API error: ${response.status}`);
  }
  const data = (await response.json()) as { assets: EtherfuseRampAsset[] };
  return data.assets;
}

export async function getCetesIdentifier(wallet: string): Promise<string> {
  const assets = await getRampAssets(wallet, "mxn");
  const cetes = assets.find((a) => a.symbol === "CETES");
  if (!cetes) {
    throw new Error("CETES asset not found in Etherfuse /ramp/assets response");
  }
  return cetes.identifier;
}

export interface EtherfuseBondCost {
  bond_cost_in_payment_token: string;
  bond_cost_in_usd: string;
  fiat_exchange_rate_with_usd: number;
  bond_cost_in_fiat: string;
  current_basis_points: number;
  bond_symbol: string;
  currency: string;
  current_time: string;
  mint: string;
  symbol: string;
}

export interface EtherfuseBondInfo {
  symbol: string;
  name: string;
  apy: number;
  price_mxn: number;
  mint: string;
  network: string;
}

export async function getCETESRate(): Promise<EtherfuseBondCost> {
  const response = await fetch(`${ETHERFUSE_API}/lookup/bonds/cost/CETES`);
  if (!response.ok) {
    throw new Error(`Etherfuse API error: ${response.status}`);
  }
  return response.json() as Promise<EtherfuseBondCost>;
}

export async function getAllBondCosts(): Promise<Record<string, EtherfuseBondCost>> {
  const response = await fetch(`${ETHERFUSE_API}/lookup/bonds/cost`);
  if (!response.ok) {
    throw new Error(`Etherfuse API error: ${response.status}`);
  }
  return response.json() as Promise<Record<string, EtherfuseBondCost>>;
}

export function formatCETESRate(bondCost: EtherfuseBondCost): EtherfuseBondInfo {
  const basisPoints = bondCost.current_basis_points;
  const apy = (basisPoints / 10000) * 100;

  return {
    symbol: bondCost.bond_symbol,
    name: "Certificados de la Tesorería de la Federación",
    apy: parseFloat(apy.toFixed(2)),
    price_mxn: parseFloat(bondCost.bond_cost_in_fiat),
    mint: bondCost.mint,
    network: "Stellar",
  };
}

export function calculateCETESPreview(
  amount: number,
  sourceAsset: "XLM" | "USDC" | "MXNe",
  bondCost: EtherfuseBondCost
): { cetes: number; priceImpact: number } {
  const pricePerCetes = parseFloat(bondCost.bond_cost_in_fiat);
  const usdToMxn = bondCost.fiat_exchange_rate_with_usd;

  let mxnAmount: number;

  if (sourceAsset === "XLM") {
    const xlmPerUsdc = usdToMxn / parseFloat(bondCost.bond_cost_in_usd);
    mxnAmount = (amount / xlmPerUsdc) * usdToMxn;
  } else if (sourceAsset === "USDC") {
    mxnAmount = amount * usdToMxn;
  } else {
    mxnAmount = amount;
  }

  const cetes = mxnAmount / pricePerCetes;

  return {
    cetes: parseFloat(cetes.toFixed(2)),
    priceImpact: 0,
  };
}
