# Circuit Breakers and Retry Policies

## Overview

This document describes the circuit breaker and retry policies implemented for external dependencies.

## Architecture

### Circuit Breaker Pattern

The circuit breaker pattern prevents cascading failures by stopping requests to a failing service:

1. **Closed**: Requests flow normally
2. **Open**: Requests fail immediately (circuit is open)
3. **Half-Open**: Limited requests allowed to test if service recovered

### Retry with Exponential Backoff

Failed requests are retried with exponential backoff:
- Base delay: 2s
- Max retries: 3
- Max delay: 10s

## Services

### Stellar RPC

| Configuration | Default | Description |
|---------------|---------|-------------|
| `STELLAR_RPC_TIMEOUT_MS` | 10000 | Request timeout |
| `STELLAR_RPC_CB_THRESHOLD` | 50 | Error threshold % |
| `STELLAR_RPC_CB_RESET_MS` | 30000 | Reset timeout |
| `STELLAR_RPC_MAX_RETRIES` | 3 | Max retry attempts |
| `STELLAR_RPC_RETRY_BASE_MS` | 2000 | Base retry delay |

### Etherfuse

| Configuration | Default | Description |
|---------------|---------|-------------|
| `ETHERFUSE_TIMEOUT_MS` | 15000 | Request timeout |
| `ETHERFUSE_MAX_RETRIES` | 3 | Max retry attempts |
| `ETHERFUSE_RETRY_BASE_MS` | 2000 | Base retry delay |

### Didit

| Configuration | Default | Description |
|---------------|---------|-------------|
| `DIDIT_TIMEOUT_MS` | 20000 | Request timeout |
| `DIDIT_CB_THRESHOLD` | 50 | Error threshold % |
| `DIDIT_CB_RESET_MS` | 60000 | Reset timeout |

## Metrics

| Metric | Description |
|--------|-------------|
| `circuit_open_total` | Number of times circuit opened |
| `fallback_triggered_total` | Number of fallback executions |
| `retry_attempts_total` | Total retry attempts |

## Fallback Behaviors

### Stellar RPC
- Returns cached balance
- Queues transactions for retry

### Etherfuse
- Queues ramp operations for retry
- Returns Level 0 KYC for review

### Didit
- Allows Level 0 (account-only)
- Blocks cash↔crypto operations

## Alerting

- Circuit opens: Alert on-call team
- Fallback triggered: Alert ops team
- High retry rate: Alert dev team

## Runbook

### Manual Circuit Reset

To manually reset a circuit breaker:

```bash
# Reset Stellar RPC circuit
curl -X POST /admin/circuit/reset/stellar-rpc

# Reset Etherfuse circuit
curl -X POST /admin/circuit/reset/etherfuse

# Reset Didit circuit
curl -X POST /admin/circuit/reset/didit
