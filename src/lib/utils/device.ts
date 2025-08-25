import { browser } from '$app/environment';

export interface DeviceCapabilities {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  screenWidth: number;
  maxTouchPoints: number;
  supportsTouch: boolean;
}

function detectDevice(): DeviceCapabilities {
  if (!browser) {
    // Server-side fallback
    return {
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      screenWidth: 1920,
      maxTouchPoints: 0,
      supportsTouch: false
    };
  }

  const userAgent = navigator.userAgent;
  const screenWidth = window.innerWidth;
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const supportsTouch = true; //'ontouchstart' in window;
  
  // Mobile detection based on user agent and screen size
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isMobileScreen = screenWidth < 768;
  const isMobile = isMobileUA || (isMobileScreen && supportsTouch);
  
  // Tablet detection - larger screen but still touch-enabled
  const isTablet = !isMobile && supportsTouch && screenWidth >= 768 && screenWidth < 1024;
  
  const isDesktop = !isMobile && !isTablet;

  return {
    isMobile,
    isTablet,
    isDesktop,
    screenWidth,
    maxTouchPoints,
    supportsTouch
  };
}

export const deviceCapabilities = detectDevice();

export function isMobileDevice(): boolean {
  return deviceCapabilities.isMobile;
}

export function isTabletDevice(): boolean {
  return deviceCapabilities.isTablet;
}

export function isDesktopDevice(): boolean {
  return deviceCapabilities.isDesktop;
}

export function shouldUseRedirect(): boolean {
  // Use redirect mode for mobile devices, iframe for desktop
  return deviceCapabilities.isMobile;
}

// Re-detect device capabilities (useful for responsive testing)
export function updateDeviceCapabilities(): DeviceCapabilities {
  const newCapabilities = detectDevice();
  Object.assign(deviceCapabilities, newCapabilities);
  return newCapabilities;
}