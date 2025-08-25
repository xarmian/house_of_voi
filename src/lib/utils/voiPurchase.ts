import { browser } from '$app/environment';
import { goto } from '$app/navigation';

export interface PurchaseResult {
  status: 'success' | 'error' | 'cancelled';
  txId?: string;
  amount?: number;
  errorMessage?: string;
  timestamp?: number;
}

export function checkForPurchaseResult(): PurchaseResult | null {
  if (!browser) return null;
  
  const urlParams = new URLSearchParams(window.location.search);
  
  // Check if this is a return from VOI purchase
  const status = urlParams.get('voi_status');
  if (!status) return null;
  
  const result: PurchaseResult = {
    status: status as PurchaseResult['status']
  };
  
  if (status === 'success') {
    result.txId = urlParams.get('voi_tx_id') || undefined;
    result.amount = urlParams.get('voi_amount') ? parseFloat(urlParams.get('voi_amount')!) : undefined;
    result.timestamp = urlParams.get('voi_timestamp') ? parseInt(urlParams.get('voi_timestamp')!) : undefined;
  } else if (status === 'error') {
    result.errorMessage = urlParams.get('voi_error_message') || 'Purchase failed';
  }
  
  return result;
}

export function clearPurchaseParams() {
  if (!browser) return;
  
  const url = new URL(window.location.href);
  const paramsToRemove = [
    'voi_status',
    'voi_tx_id', 
    'voi_amount',
    'voi_error_message',
    'voi_timestamp'
  ];
  
  let hasParams = false;
  paramsToRemove.forEach(param => {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      hasParams = true;
    }
  });
  
  // Clean up URL if we had VOI purchase params
  if (hasParams) {
    const cleanUrl = url.pathname + (url.search ? url.search : '');
    goto(cleanUrl, { replaceState: true });
  }
}

export function showPurchaseNotification(result: PurchaseResult) {
  if (!browser) return;
  
  // Create a simple toast notification
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 z-50 max-w-sm p-4 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full`;
  
  if (result.status === 'success') {
    toast.className += ' bg-green-500 text-white';
    toast.innerHTML = `
      <div class="flex items-center gap-3">
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <div>
          <p class="font-medium">Purchase Successful!</p>
          ${result.amount ? `<p class="text-sm opacity-90">${result.amount} VOI purchased</p>` : ''}
        </div>
      </div>
    `;
  } else if (result.status === 'error') {
    toast.className += ' bg-red-500 text-white';
    toast.innerHTML = `
      <div class="flex items-center gap-3">
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <div>
          <p class="font-medium">Purchase Failed</p>
          <p class="text-sm opacity-90">${result.errorMessage}</p>
        </div>
      </div>
    `;
  } else if (result.status === 'cancelled') {
    toast.className += ' bg-gray-500 text-white';
    toast.innerHTML = `
      <div class="flex items-center gap-3">
        <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <div>
          <p class="font-medium">Purchase Cancelled</p>
          <p class="text-sm opacity-90">Transaction was cancelled by user</p>
        </div>
      </div>
    `;
  }
  
  document.body.appendChild(toast);
  
  // Animate in
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
  }, 100);
  
  // Animate out and remove
  setTimeout(() => {
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 5000);
}