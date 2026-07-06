import "./config.js";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyJwt from "@fastify/jwt";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { cashRoutes } from "./routes/cash.js";
import { reputationRoutes } from "./routes/reputation.js";
import { fundRoutes } from "./routes/fund.js";
import { serviceRoutes } from "./routes/services.js";
import { demoRoutes } from "./routes/demo.js";
import { cetesRoutes } from "./routes/cetes.js";
import { blendRoutes } from "./routes/blend.js";
import { kycRoutes } from "./routes/kyc.js";
import { rampRoutes } from "./routes/ramp.js";
import { merchantRoutes } from "./routes/merchants.js";
import { tradeMessagesRoutes } from "./routes/trade-messages.js";
import { zkRoutes } from "./routes/zk.js";
import { inferenceRoutes } from "./routes/inference.js";
import { credentialRoutes } from "./routes/credentials.js";
import { bazaarRoutes } from "./routes/bazaar.js";
import { initAuthChallengesTable } from "./db/auth.js";
import { config } from "./config.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const NODE_ENV = process.env.NODE_ENV ?? "development";

if (process.env.X402_MOCK_MODE === "true" && NODE_ENV === "production") {
  throw new Error("X402_MOCK_MODE=true is not allowed in production — it bypasses all payment validation");
}

/**
 * Configure CORS based on environment and allowed origins.
 * Development: allows localhost and 127.0.0.1
 * Production: requires explicit CORS_ALLOWED_ORIGINS configuration
 */
function getCorsOptions() {
  const origins = config.corsAllowedOrigins;

  if (origins.length === 0) {
    // Fail-safe: if no origins configured in production, reject all CORS
    if (NODE_ENV === "production") {
      console.warn("[SECURITY] No CORS origins configured in production. CORS requests will be rejected.");
      return {
        origin: false,
        credentials: false,
      };
    }
    // Development with no explicit config: use defaults
    return {
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    };
  }

  // Specific origins configured
  return {
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, // 24 hours
  };
}

export async function createApp() {
  const app = Fastify({
    logger: NODE_ENV === "development",
    trustProxy: true,
  });

  // Register security headers via @fastify/helmet
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://soroban-testnet.stellar.org", "https://soroban.stellar.org"],
      },
    },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: "deny",
    },
    noSniff: true,
    xssFilter: true,
  });

  // Register CORS with secure configuration
  app.register(fastifyCors, getCorsOptions());

  app.register(fastifyJwt, { secret: config.jwtSecret });

  registerRateLimit(app);

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(userRoutes);
  app.register(cashRoutes);
  app.register(reputationRoutes);
  app.register(fundRoutes);
  app.register(serviceRoutes);
  app.register(demoRoutes);
  app.register(bazaarRoutes);

  if (config.enableInvestments) {
    app.register(cetesRoutes);
    app.register(blendRoutes);
    app.register(kycRoutes);
    app.register(rampRoutes);
  }

  app.register(merchantRoutes);
  app.register(tradeMessagesRoutes);
  app.register(zkRoutes);
  app.register(inferenceRoutes);
  app.register(credentialRoutes);

  return app;
}

async function start() {
  const app = await createApp();
  await initAuthChallengesTable();
  
  // Log security configuration on startup
  console.log(`[SECURITY] NODE_ENV: ${NODE_ENV}`);
  console.log(`[SECURITY] CORS Allowed Origins: ${config.corsAllowedOrigins.length > 0 ? config.corsAllowedOrigins.join(", ") : "NONE (all CORS requests rejected)"}`);
  console.log(`[SECURITY] Security Headers: Helmet enabled with CSP, HSTS, X-Frame-Options, X-Content-Type-Options`);
  
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`MicoPay API running on http://localhost:${PORT}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  start();
}
