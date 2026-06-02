import "./config.js";
import Fastify from "fastify";
import { seedDemoData } from "./scripts/seed.js";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { cashRoutes } from "./routes/cash.js";
import { reputationRoutes } from "./routes/reputation.js";
import { fundRoutes } from "./routes/fund.js";
import { serviceRoutes } from "./routes/services.js";
import { demoRoutes } from "./routes/demo.js";
import { cetesRoutes } from "./routes/cetes.js";
import { merchantRoutes } from "./routes/merchants.js";
import { tradeMessagesRoutes } from "./routes/trade-messages.js";
import { initAuthChallengesTable } from "./db/auth.js";
import { config } from "./config.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const NODE_ENV = process.env.NODE_ENV ?? "development";

const app = Fastify({
  logger: NODE_ENV === "development",
  trustProxy: true,
});

app.register(fastifyCors, { origin: "*" });

app.register(fastifyJwt, { secret: config.jwtSecret });

registerRateLimit(app);

app.register(healthRoutes);
app.register(authRoutes);
app.register(cashRoutes);
app.register(reputationRoutes);
app.register(fundRoutes);
app.register(serviceRoutes);
app.register(demoRoutes);

if (config.enableInvestments) {
  app.register(cetesRoutes);
  app.register(blendRoutes);
}

app.register(merchantRoutes);
app.register(tradeMessagesRoutes);

async function start() {
  await initAuthChallengesTable();
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`MicoPay API running on http://localhost:${PORT}`);
}

start();
