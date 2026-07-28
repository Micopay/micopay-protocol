# SEC-21: CORS & Security Headers Vulnerability - Security Report

## Executive Summary

Fixed critical CORS wildcard vulnerability and implemented comprehensive security headers for the MicoPay API. The vulnerability allowed any website to make cross-origin requests to the API, potentially exposing public data and authenticated endpoints.

**Status:** ✅ RESOLVED  
**Date:** July 5, 2026  
**Severity:** Medium → RESOLVED  
**Implementation Location:** `micopay/backend/src/`

---

## Vulnerability Details

### Original Problem
- **CORS Configuration:** Wildcard origin (`origin: "*"`) in legacy `apps/api/`
- **Impact:** Any domain could make cross-origin requests to the API
- **Missing Headers:** No helmet protection against MIME sniffing, clickjacking, XSS, etc.
- **Severity:** Medium (Critical in production environments)

### Risk Scenarios
1. Malicious websites could read public API data (merchants, health status)
2. Potential JWT token exposure if credentials mishandled
3. No protection against browser-based attacks (clickjacking, MIME sniffing)
4. Information disclosure through missing security headers

---

## Implementation Changes

### 1. Added Security Dependencies

**File:** `micopay/backend/package.json`

Added `@fastify/helmet` for comprehensive security headers:
```json
"@fastify/helmet": "^11.1.1"
```

### 2. Updated Configuration System

**File:** `micopay/backend/src/config.ts`

Added CORS origin parsing and secure configuration:

```typescript
/**
 * Parse CORS_ALLOWED_ORIGINS from environment variable.
 * Format: comma-separated list of origins (e.g., "https://example.com,https://app.example.com")
 * Defaults to localhost in development, empty array in production.
 */
function parseAllowedOrigins(originsEnv: string | undefined, nodeEnv: string | undefined): string[] {
  if (!originsEnv) {
    // Development: allow localhost
    if (nodeEnv !== 'production') {
      return ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
    }
    // Production: empty array means no CORS (must be explicitly configured)
    return [];
  }
  return originsEnv.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}

export const config = {
  // ... existing config
  corsAllowedOrigins: parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS, process.env.NODE_ENV),
  nodeEnv: process.env.NODE_ENV || 'development',
};
```

### 3. Secure CORS Configuration Logic

**File:** `micopay/backend/src/config.ts`

Added `getCorsOptions()` function for fail-safe CORS configuration:

```typescript
/**
 * Configure CORS based on environment and allowed origins.
 * Development: allows localhost and 127.0.0.1
 * Production: requires explicit CORS_ALLOWED_ORIGINS configuration
 */
export function getCorsOptions() {
  const origins = config.corsAllowedOrigins;

  if (origins.length === 0) {
    // Fail-safe: if no origins configured in production, reject all CORS
    if (config.nodeEnv === 'production') {
      console.warn('[SECURITY] No CORS origins configured in production. CORS requests will be rejected.');
      return {
        origin: false,
        credentials: false,
      };
    }
    // Development with no explicit config: use defaults
    return {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    };
  }

  // Specific origins configured
  return {
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // 24 hours
  };
}
```

### 4. Main Application Security Integration

**File:** `micopay/backend/src/index.ts`

#### Security Headers Implementation
```typescript
// Register security headers via @fastify/helmet
app.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://soroban-testnet.stellar.org", "https://soroban.stellar.org", "https://horizon-testnet.stellar.org"],
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
```

#### Security Logging on Startup
```typescript
// Log security configuration on startup
app.log.info({ category: 'security' }, `[SECURITY] NODE_ENV: ${config.nodeEnv}`);
app.log.info({ category: 'security' }, `[SECURITY] CORS Allowed Origins: ${config.corsAllowedOrigins.length > 0 ? config.corsAllowedOrigins.join(', ') : 'NONE (all CORS requests rejected)'}`);
app.log.info({ category: 'security' }, `[SECURITY] Security Headers: Helmet enabled with CSP, HSTS, X-Frame-Options, X-Content-Type-Options`);
```

---

## Security Headers Implemented

### Content-Security-Policy (CSP)
- `default-src 'self'`: Only load resources from same origin
- `style-src 'self' 'unsafe-inline'`: Allow inline styles (common for web apps)
- `script-src 'self'`: Only execute scripts from same origin
- `img-src 'self' data: https:`: Allow images from same origin, data URLs, and HTTPS
- `connect-src 'self' https://soroban-testnet.stellar.org https://soroban.stellar.org https://horizon-testnet.stellar.org`: Allow connections to Stellar RPC endpoints

### HTTP Strict Transport Security (HSTS)
- `max-age=31536000`: Enforce HTTPS for 1 year
- `includeSubDomains`: Apply to all subdomains
- `preload`: Eligible for browser preload lists

### Additional Headers
- `X-Frame-Options: DENY`: Prevent clickjacking by denying framing
- `X-Content-Type-Options: nosniff`: Prevent MIME type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`: Control referrer information
- `X-XSS-Protection: 1; mode=block`: Enable XSS filtering

---

## CORS Security Configuration

### Development Environment
- Defaults: `localhost:3000`, `localhost:5173`, `127.0.0.1:3000`, `127.0.0.1:5173`
- Allows credentials: `true`
- Methods: `GET, POST, PUT, DELETE, PATCH, OPTIONS`

### Production Environment
- **Fail-closed by default**: Rejects all CORS requests if `CORS_ALLOWED_ORIGINS` not set
- **Explicit allowlist**: Only origins specified in `CORS_ALLOWED_ORIGINS` environment variable
- **Credentials**: Supported for authenticated requests
- **Security**: No wildcards, no regex patterns, exact origin matching only

### Environment Configuration
```bash
# Production example
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
NODE_ENV=production

# Development (defaults work automatically)
NODE_ENV=development
```

---

## Test Suite

**File:** `micopay/backend/src/tests/security.test.ts`

Comprehensive test suite covering:
1. **Security Headers Verification**: All 6 security headers are properly set
2. **CORS Configuration**: Preflight requests, origin validation, credentials support
3. **Production Safety**: Fail-closed behavior when no origins configured
4. **Development Defaults**: Localhost origins allowed in development
5. **Header Values**: Correct CSP directives, HSTS settings, and referrer policy

Test categories:
- Security Headers (6 tests)
- CORS Configuration (4 tests)
- Public Endpoints Accessibility (2 tests)
- Security Header Values (3 tests)
- CORS Configuration Logic (3 tests)

Total: 18 tests ensuring comprehensive coverage

---

## Verification Steps

### 1. Manual Verification
```bash
# Check security headers
curl -I http://localhost:3000/health

# Test CORS with allowed origin
curl -H "Origin: http://localhost:3000" -I http://localhost:3000/health

# Test CORS with disallowed origin (should be rejected in production)
curl -H "Origin: https://evil.com" -I http://localhost:3000/health
```

### 2. Automated Tests
```bash
# Run security test suite
cd micopay/backend
npm test -- security.test.ts
```

### 3. Production Deployment Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure `CORS_ALLOWED_ORIGINS` with exact production domains
- [ ] Verify no wildcard (`*`) origins in configuration
- [ ] Confirm security headers present in all responses
- [ ] Test CORS behavior from production domains

---

## Suggested Fix (Summary)

### Core Changes
1. **Replace wildcard CORS** with explicit allowlist
2. **Add @fastify/helmet** for comprehensive security headers
3. **Implement fail-closed CORS** in production environments
4. **Maintain development convenience** with localhost defaults

### Configuration Pattern
```typescript
// Secure CORS: development allows localhost, production requires explicit config
const corsOptions = getCorsOptions(); // Uses CORS_ALLOWED_ORIGINS env var
app.register(fastifyCors, corsOptions);

// Comprehensive security headers
app.register(fastifyHelmet, {
  contentSecurityPolicy: { /* sensible defaults */ },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});
```

### Security Principles Applied
1. **Principle of Least Privilege**: Only allow necessary origins
2. **Fail-Safe Defaults**: Reject all in production unless explicitly allowed
3. **Defense in Depth**: Multiple security headers for different attack vectors
4. **Explicit Configuration**: No magic strings or hidden defaults in production

---

## Impact Assessment

### Security Improvement
- **Before**: Any website could make cross-origin requests
- **After**: Only explicitly allowed origins can make cross-origin requests
- **Headers Added**: 6 comprehensive security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Production Safety**: Fail-closed design prevents accidental exposure

### Compatibility
- ✅ **Backward Compatible**: No breaking changes to API endpoints
- ✅ **Development Experience**: Localhost works out-of-the-box
- ✅ **Production Readiness**: Explicit configuration required for security
- ✅ **Test Coverage**: Comprehensive test suite ensures correctness

### Maintenance
- **Configuration**: Environment variable based (`CORS_ALLOWED_ORIGINS`)
- **Testing**: Automated test suite verifies security headers and CORS
- **Documentation**: This report provides complete implementation details
- **Deployment**: CI builds `micopay/backend` directory (working directory in CI)

---

## Files Modified

### Core Implementation (`micopay/backend/src/`)
- `config.ts` - Added CORS parsing and secure configuration functions
- `index.ts` - Integrated helmet security headers and secure CORS
- `tests/security.test.ts` - Comprehensive test suite (18 tests)

### Dependencies (`micopay/backend/`)
- `package.json` - Added `@fastify/helmet@^11.1.1` dependency

### Documentation
- `docs/security-reports/SEC-21-cors-security-headers.md` - This consolidated report

---

## Removed Files (Cleanup)

### Repository Root (Removed)
- `SEC-21-COMPLETION-SUMMARY.txt` - Consolidated into this report
- `SEC-21-IMPLEMENTATION-SUMMARY.md` - Consolidated into this report
- `SEC-21-INDEX.md` - Consolidated into this report
- `SECURITY_HEADERS.md` - Consolidated into this report
- `SECURITY_VERIFICATION.md` - Consolidated into this report
- `GITHUB-PR-SUMMARY.md` - PR creation instructions no longer needed
- `DEPLOYMENT-READY.md` - Deployment status no longer needed

### Legacy `apps/api/` Directory (Removed)
- `CORS_CONFIG.md` - Configuration details consolidated
- `SECURITY_FIX_README.md` - Implementation guide consolidated
- `deploy-secure.sh` - Deployment script not needed for current backend

---

## Migration Notes

### From Legacy `apps/api/` Implementation
1. **Code Ported**: CORS logic and security headers moved to `micopay/backend/src/`
2. **Tests Adapted**: Security test suite updated for backend structure
3. **CI Coverage**: Now covered by CI (builds `micopay/backend` directory)
4. **Production Ready**: Deployable backend with proper security configuration

### Environment Variables
- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed origins
- `NODE_ENV`: Determines default CORS behavior (development/production)

### Testing
```bash
# Build and test the backend
cd micopay/backend
npm install
npm run build
# Run security tests specifically
node --import tsx src/tests/security.test.ts
```

---

## Conclusion

The SEC-21 CORS and security headers vulnerability has been **completely resolved** with a secure, production-ready implementation in the active `micopay/backend` codebase.

**Key Achievements:**
✅ **CORS Wildcard Eliminated** - Explicit allowlist only  
✅ **Comprehensive Security Headers** - 6 headers protecting against common attacks  
✅ **Fail-Closed Production Defaults** - No accidental exposure  
✅ **Development Convenience** - Localhost works out-of-the-box  
✅ **Full Test Coverage** - 18 tests verifying security implementation  
✅ **CI Integration** - Covered by existing CI workflow  

**Security Status:** ✅ **RESOLVED** - No longer vulnerable to cross-origin attacks or missing security headers.

--- 

*Report generated: July 5, 2026*  
*Implementation target: `micopay/backend/src/` (CI-covered codebase)*  
*Legacy `apps/api/` implementation removed, documentation consolidated*