import { error } from '@sveltejs/kit';
import { MULTI_CONTRACT_CONFIG } from '$lib/constants/network';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  const { slotMachineId } = params;
  
  // Get contracts directly from config (server-side safe)
  const allContracts = MULTI_CONTRACT_CONFIG?.contracts || [];
  
  // Validate that the contract exists
  const contract = allContracts.find(c => c.id === slotMachineId || c.slotMachineAppId === parseInt(slotMachineId));
  
  if (!contract) {
    throw error(404, {
      message: `Slot machine "${slotMachineId}" not found`,
      code: 'CONTRACT_NOT_FOUND'
    });
  }
  
  // Ensure gameplay is enabled for this contract
  if (!contract.features.gameplayEnabled) {
    throw error(403, {
      message: `Slot machine "${contract.name}" is not available for gameplay`,
      code: 'GAMEPLAY_DISABLED'
    });
  }
  
  // Check if contract is active
  if (contract.status !== 'active' && contract.status !== 'testing') {
    throw error(503, {
      message: `Slot machine "${contract.name}" is currently ${contract.status}`,
      code: 'CONTRACT_UNAVAILABLE'
    });
  }
  
  return {
    contract,
    slotMachineId
  };
};