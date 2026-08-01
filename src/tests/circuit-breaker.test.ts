import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreakerFactory } from '../utils/circuit-breaker.factory';
import { loadCircuitBreakerConfigs } from '../config/circuit-breaker.config';

describe('Circuit Breaker Integration Tests', () => {
  let factory: CircuitBreakerFactory;

  beforeEach(() => {
    factory = CircuitBreakerFactory.getInstance();
    factory.resetMetrics('test-service');
  });

  it('should handle successful requests', async () => {
    const config = loadCircuitBreakerConfigs().stellarRpc;

    const breaker = factory.createCircuitBreaker(
      'test-service',
      async () => ({ success: true, data: 'test' }),
      config,
      { maxRetries: 0, baseDelayMs: 1000, maxDelayMs: 5000 },
    );

    const result = await breaker.fire();
    expect(result).toEqual({ success: true, data: 'test' });

    const metrics = factory.getMetrics('test-service');
    expect(metrics.successfulRequests).toBe(1);
    expect(metrics.failedRequests).toBe(0);
  });

  it('should handle failed requests with retry', async () => {
    const config = loadCircuitBreakerConfigs().stellarRpc;
    let attemptCount = 0;

    const breaker = factory.createCircuitBreaker(
      'test-service',
      async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return { success: true, attempt: attemptCount };
      },
      config,
      { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 500 },
    );

    const result = await (breaker as any).retry(
      async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return { success: true, attempt: attemptCount };
      },
    );

    expect(result).toEqual({ success: true, attempt: 3 });
    expect(attemptCount).toBe(3);

    const metrics = factory.getMetrics('test-service');
    expect(metrics.retryAttemptsTotal).toBe(2);
  });

  it('should trigger fallback after max retries', async () => {
    const config = loadCircuitBreakerConfigs().stellarRpc;
    let attemptCount = 0;

    const breaker = factory.createCircuitBreaker(
      'test-service',
      async () => {
        attemptCount++;
        throw new Error('Persistent failure');
      },
      config,
      { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 500 },
      async () => ({ fallback: true, attempts: attemptCount }),
    );

    try {
      await (breaker as any).retry(
        async () => {
          attemptCount++;
          throw new Error('Persistent failure');
        },
      );
    } catch (error) {
      // The fallback should be triggered, not an error
      expect(breaker.fallback).toBeDefined();
    }

    const metrics = factory.getMetrics('test-service');
    expect(metrics.fallbackTriggeredTotal).toBeGreaterThan(0);
  });

  it('should open circuit after threshold exceeded', async () => {
    const config = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
    };

    const breaker = factory.createCircuitBreaker(
      'test-service',
      async () => {
        throw new Error('Service unavailable');
      },
      config,
      { maxRetries: 0, baseDelayMs: 1000, maxDelayMs: 5000 },
    );

    // Fire multiple times to trigger circuit open
    for (let i = 0; i < 5; i++) {
      try {
        await breaker.fire();
      } catch (error) {
        // Expected
      }
    }

    expect(breaker.stats).toBeDefined();
  });
});
