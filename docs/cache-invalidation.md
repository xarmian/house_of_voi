# Contract Data Cache Invalidation

## Overview

The contract data cache in `contractDataCache.ts` has been enhanced with a version-based invalidation mechanism to ensure the cache is refreshed when the smart contract is updated.

## Configuration

Two new environment variables control the cache behavior:

- `PUBLIC_CONTRACT_VERSION`: The current version of the deployed contract (e.g., "1.0.0")
- `PUBLIC_CONTRACT_CACHE_DURATION`: Cache duration in milliseconds (default: 3600000 = 1 hour)

## How It Works

1. **Version Tracking**: Each cached item stores the contract version when it was cached
2. **Version Validation**: When reading from cache, it checks if the stored version matches the current `PUBLIC_CONTRACT_VERSION`
3. **Automatic Invalidation**: If versions don't match, the cache is considered invalid and fresh data is fetched from the contract

## Usage

### When Deploying Contract Updates

1. Update the contract on-chain
2. Change `PUBLIC_CONTRACT_VERSION` in your environment variables
3. Restart the application
4. All users will automatically get fresh data from the updated contract

### Manual Cache Management

In development, you can use the browser console:

```javascript
// Check cache statistics
contractCache.stats()

// Force refresh all data
contractCache.forceRefresh('YOUR_WALLET_ADDRESS')

// Clear cache completely
contractCache.clear()

// Check current contract version
contractCache.version()

// Check cache duration
contractCache.cacheDuration()
```

## Benefits

- **No code changes required** when contract is updated - just change the version
- **Automatic invalidation** ensures users always see correct data
- **Configurable cache duration** for different environments
- **Manual controls** for testing and debugging
- **Backwards compatible** with existing cache data