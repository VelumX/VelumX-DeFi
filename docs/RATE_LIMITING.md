# Rate Limiting & Pricing Oracle Documentation

## Overview

The VelumX Relayer now includes comprehensive rate limiting and multi-oracle pricing to ensure reliability, prevent abuse, and provide accurate fee estimations.

## Rate Limiting

### Implementation

Rate limiting is implemented per API key with in-memory storage. Each endpoint has customized limits based on its criticality and expected usage patterns.

### Rate Limit Tiers

| Endpoint | Limit | Window | Purpose |
|----------|-------|--------|---------|
| `/api/v1/estimate` | 60 req/min | 1 minute | Fee estimation queries |
| `/api/v1/sponsor` | 30 req/min | 1 minute | Transaction sponsorship |
| `/api/v1/broadcast` | 20 req/min | 1 minute | Raw transaction broadcast |
| `/api/dashboard/*` | 120 req/min | 1 minute | Dashboard analytics |

### Response Headers

When rate limited, the following headers are included:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1234567890
Retry-After: 45
```

### Rate Limit Response

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests, please try again later.",
  "retryAfter": 45
}
```

HTTP Status: `429 Too Many Requests`

### Configuration

Rate limits can be adjusted in `src/middleware/rateLimiter.ts`:

```typescript
export const createRateLimiters = () => {
    return {
        estimate: new RateLimiter({
            windowMs: 60000,        // 1 minute
            maxRequests: 60,        // Adjust this value
            message: 'Custom message'
        }),
        // ... other limiters
    };
};
```

### Production Considerations

For production deployments with multiple relayer instances:

1. **Use Redis for distributed rate limiting**:
   ```typescript
   import Redis from 'ioredis';
   const redis = new Redis(process.env.REDIS_URL);
   ```

2. **Implement sliding window algorithm** for more accurate limiting

3. **Add per-user rate limits** in addition to per-API-key limits

4. **Monitor rate limit hits** to adjust thresholds

## Pricing Oracle Service

### Multi-Oracle Architecture

The pricing oracle uses a fallback chain to ensure reliable pricing even when primary sources fail.

### STX Price Sources (in order)

1. **CoinGecko** (Primary)
   - Endpoint: `https://api.coingecko.com/api/v3/simple/price`
   - Free tier available
   - 5-second timeout

2. **CoinMarketCap** (Secondary)
   - Requires API key: `COINMARKETCAP_API_KEY`
   - Professional-grade data
   - 5-second timeout

3. **Binance** (Tertiary)
   - Public API
   - Real-time exchange data
   - 5-second timeout

4. **Fallback** (Last resort)
   - Conservative fixed price: $2.50
   - Ensures service continuity

### Token Rate Sources (in order)

1. **ALEX SDK** (Primary)
   - On-chain DEX pricing
   - Real-time liquidity data
   - Most accurate for Stacks tokens

2. **Velar DEX** (Secondary)
   - Alternative DEX pricing
   - *Currently placeholder - requires implementation*

3. **Hardcoded Fallback** (Last resort)
   - Conservative rates for common tokens:
     - sBTC: 20,000 STX
     - USDC/USDCx: 0.4 STX
     - ALEX: 0.5 STX
     - aeUSDC: 0.4 STX

### Caching

Prices are cached for 60 seconds to reduce API calls and improve performance:

```typescript
private readonly CACHE_TTL = 60000; // 1 minute
```

### Usage Example

```typescript
import { PricingOracleService } from './services/PricingOracleService';

const oracle = new PricingOracleService();

// Get STX price in USD
const stxPrice = await oracle.getStxPrice();
console.log(`STX: $${stxPrice}`);

// Get token rate relative to STX
const tokenRate = await oracle.getTokenRate('SP...sbtc');
console.log(`Token rate: ${tokenRate} STX`);

// Convert token amount to USD
const usdValue = await oracle.convertToUsdcx('1000000', 'SP...usdc');
console.log(`USD value: $${usdValue}`);
```

### Cache Management

```typescript
// Clear specific cache entry
oracle.clearCache('stx-usd');

// Clear all cache
oracle.clearCache();

// Get cache statistics
const stats = oracle.getCacheStats();
console.log(stats);
```

### Adding New Price Sources

To add a new STX price source:

```typescript
{
    name: 'NewExchange',
    getPrice: async () => {
        try {
            const response = await fetch('https://api.newexchange.com/price/stx');
            if (response.ok) {
                const data = await response.json();
                return data.price || null;
            }
            return null;
        } catch (e) {
            console.warn('NewExchange fetch failed:', e);
            return null;
        }
    }
}
```

To add a new token rate source:

```typescript
{
    name: 'NewDEX',
    getRate: async (token: string) => {
        try {
            // Implement DEX integration
            const rate = await fetchFromNewDEX(token);
            return rate;
        } catch (e) {
            console.warn('NewDEX fetch failed:', e);
            return null;
        }
    }
}
```

## Environment Variables

Add to `.env`:

```bash
# Optional: CoinMarketCap API key for enhanced pricing
COINMARKETCAP_API_KEY=your_api_key_here

# Optional: Redis URL for distributed rate limiting (production)
REDIS_URL=redis://localhost:6379
```

## Monitoring

### Rate Limit Metrics

Monitor these metrics in production:

- Rate limit hit rate per endpoint
- Average requests per API key
- Peak usage times
- Blocked requests count

### Pricing Oracle Metrics

Monitor these metrics:

- Oracle source success rates
- Fallback usage frequency
- Cache hit rate
- Price deviation alerts

### Logging

The system logs:

```
✅ STX price from CoinGecko: $2.45
✅ Token rate from ALEX: sbtc = 19500 STX
⚠️  ALEX SDK rate fetch failed for token: Pool not found
⚠️  Using fallback rate for usdc: 0.4 STX
```

## Testing

### Rate Limiter Tests

```bash
# Test rate limiting
curl -X POST http://localhost:4000/api/v1/estimate \
  -H "x-api-key: your_key" \
  -H "Content-Type: application/json" \
  -d '{"intent": {"feeToken": "SP...usdc"}}'

# Repeat 61 times to trigger rate limit
```

### Pricing Oracle Tests

```bash
# Test STX price
curl http://localhost:4000/health

# Check cache stats (add endpoint if needed)
curl http://localhost:4000/api/v1/pricing/stats \
  -H "x-api-key: your_key"
```

## Security Considerations

1. **Rate Limiting**:
   - Prevents DoS attacks
   - Protects against fee draining
   - Ensures fair resource allocation

2. **Pricing Oracle**:
   - Multiple sources prevent manipulation
   - Conservative fallbacks protect users
   - Caching reduces external dependencies

3. **API Key Validation**:
   - Rate limits are per API key
   - Invalid keys are rejected before rate limiting
   - Revoked keys cannot bypass limits

## Troubleshooting

### Rate Limit Issues

**Problem**: Legitimate users hitting rate limits

**Solution**: 
- Increase limits in `rateLimiter.ts`
- Implement request batching in SDK
- Add premium tier with higher limits

### Pricing Issues

**Problem**: Inaccurate prices

**Solution**:
- Check oracle source status
- Verify API keys are valid
- Review fallback rates
- Add more oracle sources

**Problem**: All oracles failing

**Solution**:
- Check network connectivity
- Verify API endpoints are accessible
- Review timeout settings
- Ensure fallback is working

## Future Enhancements

1. **Distributed Rate Limiting**:
   - Redis-based storage
   - Sliding window algorithm
   - Per-user limits

2. **Advanced Pricing**:
   - Weighted average from multiple sources
   - Outlier detection and filtering
   - Historical price tracking
   - Volatility-based adjustments

3. **Monitoring Dashboard**:
   - Real-time rate limit metrics
   - Oracle health status
   - Price deviation alerts
   - Usage analytics

4. **Dynamic Rate Limits**:
   - Adjust based on system load
   - Premium tiers with higher limits
   - Burst allowances for legitimate spikes

## Support

For issues or questions:
- Check logs for detailed error messages
- Review rate limit headers in responses
- Monitor oracle fallback usage
- Contact support with API key ID for investigation
