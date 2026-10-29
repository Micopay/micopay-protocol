# Docker Deployment

## Quick Start

```bash
# 1. Copy environment file
cp .env.docker.example .env

# 2. Configure your wallet (required for payments)
# Generate a keypair: stellar keys generate
# Set PLATFORM_SECRET_KEY=your_secret_key in .env

# 3. Start services
docker-compose up -d

# 4. Check health
curl http://localhost:3000/health

# 5. View logs
docker-compose logs -f api
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| API | 3000 | MicoPay Protocol API (x402) |
| Web | 5186 | Protocol Dashboard |
| PostgreSQL | 5432 | Database (user: micopay) |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PLATFORM_SECRET_KEY` | Yes | - | Stellar secret key for receiving payments |
| `STELLAR_RPC_URL` | No | testnet URL | Stellar RPC endpoint |
| `ESCROW_CONTRACT_ID` | No | testnet ID | Deployed escrow contract |
| `MOCK_STELLAR` | No | false | Skip on-chain verification (demo only) |

## Production Notes

1. **Generate a new wallet**: `stellar keys generate`
2. **Fund with testnet XLM**: Use Stellar laboratory or friendbot
3. **Configure firewall**: Only expose ports 3000 (API) and 5186 (Web)
4. **Use secrets manager**: Store `PLATFORM_SECRET_KEY` in env, not in docker-compose.yml

## Troubleshooting

```bash
# View API logs
docker-compose logs api

# Restart services
docker-compose restart

# Rebuild after code changes
docker-compose up -d --build

# Stop all services
docker-compose down

# Reset database
docker-compose down -v
docker-compose up -d
```
