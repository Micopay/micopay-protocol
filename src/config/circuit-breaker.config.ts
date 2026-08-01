export interface CircuitBreakerConfig {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
  rollingCountTimeout: number;
  rollingCountBuckets: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface CircuitBreakerConfigs {
  stellarRpc: CircuitBreakerConfig & RetryConfig;
  etherfuse: CircuitBreakerConfig & RetryConfig;
  didit: CircuitBreakerConfig & RetryConfig;
}

export function loadCircuitBreakerConfigs(): CircuitBreakerConfigs {
  return {
    stellarRpc: {
      // Circuit breaker
      timeout: parseInt(process.env.STELLAR_RPC_TIMEOUT_MS || '10000'),
      errorThresholdPercentage: parseInt(process.env.STELLAR_RPC_CB_THRESHOLD || '50'),
      resetTimeout: parseInt(process.env.STELLAR_RPC_CB_RESET_MS || '30000'),
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      // Retry
      maxRetries: parseInt(process.env.STELLAR_RPC_MAX_RETRIES || '3'),
      baseDelayMs: parseInt(process.env.STELLAR_RPC_RETRY_BASE_MS || '2000'),
      maxDelayMs: parseInt(process.env.STELLAR_RPC_RETRY_MAX_MS || '10000'),
    },
    etherfuse: {
      timeout: parseInt(process.env.ETHERFUSE_TIMEOUT_MS || '15000'),
      errorThresholdPercentage: 50,
      resetTimeout: 60000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      maxRetries: parseInt(process.env.ETHERFUSE_MAX_RETRIES || '3'),
      baseDelayMs: parseInt(process.env.ETHERFUSE_RETRY_BASE_MS || '2000'),
      maxDelayMs: 30000,
    },
    didit: {
      timeout: parseInt(process.env.DIDIT_TIMEOUT_MS || '20000'),
      errorThresholdPercentage: parseInt(process.env.DIDIT_CB_THRESHOLD || '50'),
      resetTimeout: parseInt(process.env.DIDIT_CB_RESET_MS || '60000'),
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      maxRetries: 2,
      baseDelayMs: 3000,
      maxDelayMs: 15000,
    },
  };
}
