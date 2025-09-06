/**
 * Contract Registry Service
 * 
 * Manages multiple contract pairs, provides contract discovery, health checking,
 * and centralized access to contract metadata and configuration.
 */

import type {
  ContractPair,
  MultiContractConfig,
  ContractHealthStatus,
  ContractContext,
  ContractPerformanceMetrics,
  ContractStatus
} from '$lib/types/multiContract';
import { contractUtils, getActiveContracts, getGameplayContracts } from '$lib/utils/contractUtils';
import { NETWORK_CONFIG } from '$lib/constants/network';
import algosdk from 'algosdk';

export class ContractRegistry {
  private config: MultiContractConfig | null = null;
  private healthStatuses: Map<string, ContractHealthStatus> = new Map();
  private performanceMetrics: Map<string, ContractPerformanceMetrics> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private algodClient: algosdk.Algodv2;
  private subscribers: Set<(context: ContractContext) => void> = new Set();

  constructor() {
    this.algodClient = new algosdk.Algodv2(
      NETWORK_CONFIG.token,
      NETWORK_CONFIG.nodeUrl,
      NETWORK_CONFIG.port
    );
  }

  /**
   * Initialize the registry with contract configuration
   */
  async initialize(config: MultiContractConfig): Promise<void> {
    // Validate configuration
    const validation = contractUtils.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid contract configuration: ${validation.errors.join(', ')}`);
    }

    this.config = config;
    
    // Initialize health statuses with default values (no immediate API calls)
    this.initializeDefaultHealthStatuses();

    // Start periodic health checks if enabled
    if (this.config.globalSettings.healthCheckInterval > 0) {
      this.startPeriodicHealthChecks();
    }

    // Load initial performance metrics
    await this.loadPerformanceMetrics();

    console.log(`Contract registry initialized with ${this.config.contracts.length} contracts`);
  }

  /**
   * Get all configured contracts
   */
  getAllContracts(): ContractPair[] {
    return this.config?.contracts || [];
  }

  /**
   * Get contracts filtered by criteria
   */
  getContracts(criteria?: {
    status?: ContractStatus[];
    gameplayEnabled?: boolean;
    depositsEnabled?: boolean;
    withdrawalsEnabled?: boolean;
    houseDashboardEnabled?: boolean;
    playerSelectionEnabled?: boolean;
  }): ContractPair[] {
    let contracts = this.getAllContracts();

    if (!criteria) {
      return contracts;
    }

    if (criteria.status && criteria.status.length > 0) {
      contracts = contracts.filter(c => criteria.status!.includes(c.status));
    }

    if (criteria.gameplayEnabled !== undefined) {
      contracts = contracts.filter(c => c.features.gameplayEnabled === criteria.gameplayEnabled);
    }

    if (criteria.depositsEnabled !== undefined) {
      contracts = contracts.filter(c => c.features.depositsEnabled === criteria.depositsEnabled);
    }

    if (criteria.withdrawalsEnabled !== undefined) {
      contracts = contracts.filter(c => c.features.withdrawalsEnabled === criteria.withdrawalsEnabled);
    }

    if (criteria.houseDashboardEnabled !== undefined) {
      contracts = contracts.filter(c => c.features.houseDashboardEnabled === criteria.houseDashboardEnabled);
    }

    if (criteria.playerSelectionEnabled !== undefined) {
      contracts = contracts.filter(c => c.features.playerSelectionEnabled === criteria.playerSelectionEnabled);
    }

    return contracts;
  }

  /**
   * Get contract by ID or slotMachineAppId
   */
  getContract(identifier: string): ContractPair | null {
    const allContracts = this.getAllContracts();
    
    // First try to find by ID
    let result = contractUtils.findById(allContracts, identifier);
    if (result) return result;
    
    // If not found, try to find by slotMachineAppId
    result = allContracts.find(contract => 
      contract.slotMachineAppId.toString() === identifier
    ) || null;
    
    return result;
  }

  /**
   * Get default contract
   */
  getDefaultContract(): ContractPair | null {
    if (!this.config) return null;
    return this.getContract(this.config.defaultContractId);
  }

  /**
   * Get active contracts only
   */
  getActiveContracts(): ContractPair[] {
    return getActiveContracts(this.getAllContracts());
  }

  /**
   * Get contracts available for gameplay
   */
  getGameplayContracts(): ContractPair[] {
    return getGameplayContracts(this.getAllContracts());
  }

  /**
   * Get contract health status
   */
  getContractHealth(contractId: string): ContractHealthStatus | null {
    return this.healthStatuses.get(contractId) || null;
  }

  /**
   * Get all health statuses
   */
  getAllHealthStatuses(): Record<string, ContractHealthStatus> {
    const result: Record<string, ContractHealthStatus> = {};
    for (const [id, status] of this.healthStatuses.entries()) {
      result[id] = status;
    }
    return result;
  }

  /**
   * Get contract performance metrics
   */
  getContractPerformance(contractId: string): ContractPerformanceMetrics | null {
    return this.performanceMetrics.get(contractId) || null;
  }

  /**
   * Get all performance metrics
   */
  getAllPerformanceMetrics(): Record<string, ContractPerformanceMetrics> {
    const result: Record<string, ContractPerformanceMetrics> = {};
    for (const [id, metrics] of this.performanceMetrics.entries()) {
      result[id] = metrics;
    }
    return result;
  }

  /**
   * Check if a contract is healthy and available
   */
  isContractAvailable(contractId: string): boolean {
    const contract = this.getContract(contractId);
    if (!contract) return false;

    if (contract.status !== 'active' && contract.status !== 'testing') {
      return false;
    }

    const healthStatus = this.getContractHealth(contractId);
    return healthStatus ? contractUtils.isHealthy(healthStatus) : false;
  }

  /**
   * Refresh health status for a specific contract
   */
  async refreshContractHealth(contractId: string): Promise<ContractHealthStatus> {
    const contract = this.getContract(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const startTime = Date.now();
    const healthStatus = await this.performHealthCheck(contract);
    const checkDuration = Date.now() - startTime;

    healthStatus.checkDuration = checkDuration;
    this.healthStatuses.set(contractId, healthStatus);

    // Notify subscribers
    this.notifySubscribers();

    return healthStatus;
  }

  /**
   * Refresh health statuses for all contracts
   */
  async refreshAllContractHealth(): Promise<void> {
    const contracts = this.getAllContracts();
    const promises = contracts.map(contract => 
      this.refreshContractHealth(contract.id).catch(error => {
        console.error(`Failed to refresh health for contract ${contract.id}:`, error);
        return null;
      })
    );

    await Promise.all(promises);
  }

  /**
   * Subscribe to contract context changes
   */
  subscribe(callback: (context: ContractContext) => void): () => void {
    this.subscribers.add(callback);
    
    // Send initial context
    callback(this.getContext());

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get current contract context
   */
  getContext(): ContractContext {
    return {
      selectedContract: this.getDefaultContract(), // Can be extended with selection logic
      availableContracts: this.getAllContracts(),
      healthStatuses: this.getAllHealthStatuses(),
      isLoading: false, // Can be extended with loading state
      error: null // Can be extended with error state
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.subscribers.clear();
  }

  /**
   * Initialize health statuses with default values (no API calls)
   */
  private initializeDefaultHealthStatuses(): void {
    if (!this.config) return;

    for (const contract of this.config.contracts) {
      // Set default unknown status without making API calls
      this.healthStatuses.set(contract.id, {
        contractId: contract.id,
        status: 'unknown',
        checks: {
          slotMachineContract: { status: 'warn', message: 'Not yet checked', timestamp: Date.now() },
          ybtContract: { status: 'warn', message: 'Not yet checked', timestamp: Date.now() },
          networkConnection: { status: 'warn', message: 'Not yet checked', timestamp: Date.now() },
          balanceConsistency: { status: 'warn', message: 'Not yet checked', timestamp: Date.now() }
        },
        lastChecked: 0,
        checkDuration: 0
      });
    }
  }

  /**
   * Initialize health statuses for all contracts (with API calls)
   */
  private async initializeHealthStatuses(): Promise<void> {
    if (!this.config) return;

    for (const contract of this.config.contracts) {
      try {
        const healthStatus = await this.performHealthCheck(contract);
        this.healthStatuses.set(contract.id, healthStatus);
      } catch (error) {
        console.error(`Failed to initialize health status for contract ${contract.id}:`, error);
        // Set default unhealthy status
        this.healthStatuses.set(contract.id, {
          contractId: contract.id,
          status: 'error',
          checks: {
            slotMachineContract: { status: 'fail', message: 'Health check failed', timestamp: Date.now() },
            ybtContract: { status: 'fail', message: 'Health check failed', timestamp: Date.now() },
            networkConnection: { status: 'fail', message: 'Health check failed', timestamp: Date.now() },
            balanceConsistency: { status: 'fail', message: 'Health check failed', timestamp: Date.now() }
          },
          lastChecked: Date.now(),
          checkDuration: 0
        });
      }
    }
  }

  /**
   * Perform health check for a contract
   */
  private async performHealthCheck(contract: ContractPair): Promise<ContractHealthStatus> {
    const timestamp = Date.now();
    const checks = {
      slotMachineContract: { status: 'pass' as const, message: 'Contract accessible', timestamp },
      ybtContract: { status: 'pass' as const, message: 'Contract accessible', timestamp },
      networkConnection: { status: 'pass' as const, message: 'Network connection stable', timestamp },
      balanceConsistency: { status: 'pass' as const, message: 'Balances consistent', timestamp }
    };

    try {
      // Check slot machine contract
      try {
        await this.algodClient.getApplicationByID(contract.slotMachineAppId).do();
      } catch (error) {
        checks.slotMachineContract = {
          status: 'fail',
          message: `Slot machine contract not accessible: ${error}`,
          timestamp
        };
      }

      // Check YBT contract
      try {
        await this.algodClient.getApplicationByID(contract.ybtAppId).do();
      } catch (error) {
        checks.ybtContract = {
          status: 'fail',
          message: `YBT contract not accessible: ${error}`,
          timestamp
        };
      }

      // Check network connection
      try {
        await this.algodClient.status().do();
      } catch (error) {
        checks.networkConnection = {
          status: 'fail',
          message: `Network connection failed: ${error}`,
          timestamp
        };
      }

      // Balance consistency check could be more sophisticated
      // For now, just mark as pass if other checks passed
      if (checks.slotMachineContract.status === 'fail' || checks.ybtContract.status === 'fail') {
        checks.balanceConsistency = {
          status: 'warn',
          message: 'Cannot verify balance consistency due to contract issues',
          timestamp
        };
      }

    } catch (error) {
      // If any general error occurs, mark all as failed
      Object.keys(checks).forEach(key => {
        checks[key as keyof typeof checks] = {
          status: 'fail',
          message: `Health check error: ${error}`,
          timestamp
        };
      });
    }

    // Determine overall status
    const failedChecks = Object.values(checks).filter(check => check.status === 'fail').length;
    const warningChecks = Object.values(checks).filter(check => check.status === 'warn').length;

    let status: 'healthy' | 'warning' | 'error' | 'unknown';
    if (failedChecks > 0) {
      status = 'error';
    } else if (warningChecks > 0) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    return {
      contractId: contract.id,
      status,
      checks,
      lastChecked: timestamp,
      checkDuration: 0 // Will be set by the caller
    };
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicHealthChecks(): void {
    if (!this.config) return;

    const interval = this.config.globalSettings.healthCheckInterval;
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.refreshAllContractHealth();
      } catch (error) {
        console.error('Error during periodic health check:', error);
      }
    }, interval);
  }

  /**
   * Load performance metrics for all contracts
   */
  private async loadPerformanceMetrics(): Promise<void> {
    // This would typically load from an API or calculate from blockchain data
    // For now, we'll create placeholder metrics
    if (!this.config) return;

    for (const contract of this.config.contracts) {
      // Placeholder performance metrics
      const metrics: ContractPerformanceMetrics = {
        contractId: contract.id,
        totalValueLocked: BigInt(0),
        totalVolume: BigInt(0),
        activeUsers: 0,
        averageDailyVolume: BigInt(0),
        actualHouseEdge: contract.metadata.houseEdge,
        transactionSuccessRate: 95.0,
        averageTransactionTime: 3000,
        last24h: {
          volume: BigInt(0),
          transactions: 0,
          uniqueUsers: 0,
          totalPayout: BigInt(0)
        },
        historical: []
      };

      this.performanceMetrics.set(contract.id, metrics);
    }
  }

  /**
   * Notify all subscribers of context changes
   */
  private notifySubscribers(): void {
    const context = this.getContext();
    this.subscribers.forEach(callback => {
      try {
        callback(context);
      } catch (error) {
        console.error('Error notifying subscriber:', error);
      }
    });
  }
}

// Create singleton instance
export const contractRegistry = new ContractRegistry();