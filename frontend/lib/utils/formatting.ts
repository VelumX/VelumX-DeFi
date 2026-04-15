/**
 * Formatting Utilities
 * Helper functions for formatting numbers, addresses, and links
 */

/**
 * Format token amount with specified decimal precision
 * @param amount - Amount as string or number
 * @param decimals - Number of decimal places (default: 6 for USDC/USDCx)
 * @returns Formatted string
 */
export function formatTokenAmount(amount: string | number, decimals: number = 6): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(num)) return '0.000000';
  
  // Format with specified decimals
  return num.toFixed(decimals);
}

/**
 * Format token amount with compact notation for large numbers
 * @param amount - Amount as string or number
 * @param decimals - Number of decimal places
 * @returns Formatted string (e.g., "1.5K", "2.3M")
 */
export function formatCompactAmount(amount: string | number, decimals: number = 2): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(num)) return '0';
  
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(decimals)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(decimals)}K`;
  }
  
  return num.toFixed(decimals);
}

/**
 * Shorten address for display
 * @param address - Full address
 * @param startChars - Number of characters to show at start (default: 6)
 * @param endChars - Number of characters to show at end (default: 4)
 * @returns Shortened address (e.g., "0x1234...5678")
 */
export function shortenAddress(address: string, startChars: number = 6, endChars: number = 4): string {
  if (!address) return '';
  if (address.length <= startChars + endChars) return address;
  
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Copy text to clipboard
 * @param text - Text to copy
 * @returns Promise that resolves to true if successful
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        textArea.remove();
        return true;
      } catch (err) {
        console.error('Fallback copy failed:', err);
        textArea.remove();
        return false;
      }
    }
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}

/**
 * Generate blockchain explorer link
 * @param chain - Chain name ('ethereum' or 'stacks')
 * @param type - Type of link ('tx', 'address', 'block')
 * @param value - Transaction hash, address, or block number
 * @param network - Network ('mainnet' or 'testnet')
 * @returns Explorer URL
 */
export function getExplorerLink(
  chain: 'ethereum' | 'stacks',
  type: 'tx' | 'address' | 'block',
  value: string,
  network: 'mainnet' | 'testnet' = 'testnet'
): string {
  if (chain === 'ethereum') {
    const baseUrl = network === 'mainnet' 
      ? 'https://etherscan.io' 
      : 'https://sepolia.etherscan.io';
    
    switch (type) {
      case 'tx':
        return `${baseUrl}/tx/${value}`;
      case 'address':
        return `${baseUrl}/address/${value}`;
      case 'block':
        return `${baseUrl}/block/${value}`;
      default:
        return baseUrl;
    }
  } else {
    const baseUrl = 'https://explorer.hiro.so';
    const chainParam = network === 'testnet' ? '?chain=testnet' : '';
    
    switch (type) {
      case 'tx':
        return `${baseUrl}/txid/${value}${chainParam}`;
      case 'address':
        return `${baseUrl}/address/${value}${chainParam}`;
      case 'block':
        return `${baseUrl}/block/${value}${chainParam}`;
      default:
        return baseUrl;
    }
  }
}

/**
 * Format timestamp to readable date/time
 * @param timestamp - Unix timestamp in milliseconds
 * @param includeTime - Whether to include time (default: true)
 * @returns Formatted date string
 */
export function formatTimestamp(timestamp: number, includeTime: boolean = true): string {
  const date = new Date(timestamp);
  
  const dateStr = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  
  if (!includeTime) return dateStr;
  
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  return `${dateStr} at ${timeStr}`;
}

/**
 * Format time ago (e.g., "2 minutes ago", "1 hour ago")
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Relative time string
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Validate and format decimal input
 * @param value - Input value
 * @param maxDecimals - Maximum decimal places allowed
 * @returns Formatted value or null if invalid
 */
export function formatDecimalInput(value: string, maxDecimals: number = 6): string | null {
  // Remove any non-numeric characters except decimal point
  const cleaned = value.replace(/[^\d.]/g, '');
  
  // Check for multiple decimal points
  const parts = cleaned.split('.');
  if (parts.length > 2) return null;
  
  // Limit decimal places
  if (parts.length === 2 && parts[1].length > maxDecimals) {
    return `${parts[0]}.${parts[1].slice(0, maxDecimals)}`;
  }
  
  return cleaned;
}

/**
 * Format percentage
 * @param value - Percentage value (e.g., 0.125 for 12.5%)
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}
