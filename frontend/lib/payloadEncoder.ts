/**
 * Payload encoding utilities for Bitflow swap executor
 * Encodes swap parameters into a 152-byte binary payload for the bitflow-executor-v1 contract
 * 
 * Payload Format (152 bytes total):
 * - Bytes 0-40: token-in principal (40 bytes)
 * - Bytes 40-80: token-out principal (40 bytes)
 * - Bytes 80-96: amount-in as uint128 big-endian (16 bytes)
 * - Bytes 96-112: min-amount-out as uint128 big-endian (16 bytes)
 * - Bytes 112-152: router-address principal (40 bytes)
 */

import { getStacksTransactions } from './stacks-loader';

/**
 * Swap parameters for encoding
 */
export interface SwapPayload {
  tokenIn: string;           // Principal of input token (e.g., "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token")
  tokenOut: string;          // Principal of output token
  amountIn: bigint;          // Amount in micro-units
  minAmountOut: bigint;      // Minimum acceptable output
  routerAddress: string;     // Bitflow router principal
}

/**
 * Encodes swap parameters into a 152-byte hex-encoded payload
 * 
 * @param params - Swap parameters to encode
 * @returns Hex-encoded string with "0x" prefix (304 characters: "0x" + 152 bytes * 2)
 * @throws Error if parameters are invalid or encoding fails
 */
export async function encodeSwapPayload(params: SwapPayload): Promise<string> {
  // Validate parameters
  if (!params.tokenIn || !params.tokenOut || !params.routerAddress) {
    throw new Error('Missing required principal parameters');
  }
  
  if (params.amountIn <= 0n) {
    throw new Error('amountIn must be positive');
  }
  
  if (params.minAmountOut < 0n) {
    throw new Error('minAmountOut must be non-negative');
  }

  // Create 152-byte buffer
  const buffer = new Uint8Array(152);
  
  // Encode token-in principal at offset 0 (40 bytes)
  const tokenInBytes = await encodePrincipal(params.tokenIn);
  buffer.set(tokenInBytes, 0);
  
  // Encode token-out principal at offset 40 (40 bytes)
  const tokenOutBytes = await encodePrincipal(params.tokenOut);
  buffer.set(tokenOutBytes, 40);
  
  // Encode amount-in at offset 80 (16 bytes, big-endian)
  const amountInBytes = encodeUint128(params.amountIn);
  buffer.set(amountInBytes, 80);
  
  // Encode min-amount-out at offset 96 (16 bytes, big-endian)
  const minAmountOutBytes = encodeUint128(params.minAmountOut);
  buffer.set(minAmountOutBytes, 96);
  
  // Encode router-address at offset 112 (40 bytes)
  const routerBytes = await encodePrincipal(params.routerAddress);
  buffer.set(routerBytes, 112);
  
  // Convert to hex string with "0x" prefix
  return '0x' + Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encodes a Stacks principal (address or contract) as 40 bytes
 * 
 * Format for standard principals:
 * - Byte 0: version byte (0x16 for mainnet standard, 0x1A for testnet standard)
 * - Bytes 1-20: hash160 (20 bytes)
 * - Bytes 21-39: zero padding (19 bytes)
 * 
 * Format for contract principals:
 * - Byte 0: version byte (0x05 for mainnet contract, 0x06 for testnet contract)
 * - Bytes 1-20: hash160 of address (20 bytes)
 * - Byte 21: contract name length
 * - Bytes 22-39: contract name (up to 18 bytes, zero-padded)
 * 
 * @param principal - Stacks principal string (e.g., "SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.token-name")
 * @returns 40-byte Uint8Array
 * @throws Error if principal format is invalid
 */
export async function encodePrincipal(principal: string): Promise<Uint8Array> {
  const transactions = await getStacksTransactions() as any;
  if (!transactions) {
    throw new Error('Stacks library not available');
  }
  
  const buffer = new Uint8Array(40);
  buffer.fill(0); // Initialize with zeros
  
  // Check if this is a contract principal (contains a dot)
  if (principal.includes('.')) {
    const [address, contractName] = principal.split('.');
    
    if (!contractName || contractName.length === 0) {
      throw new Error('Invalid contract principal: missing contract name');
    }
    
    if (contractName.length > 128) {
      throw new Error('Contract name too long (max 128 characters)');
    }
    
    // Parse the address part
    const stacksAddr = transactions.createAddress(address);
    
    // Byte 0: version byte for contract principal
    // Mainnet standard (22/0x16) -> Mainnet contract (5/0x05)
    // Testnet standard (26/0x1A) -> Testnet contract (6/0x06)
    buffer[0] = stacksAddr.version === 22 ? 0x05 : 0x06;
    
    // Bytes 1-20: hash160 of the address
    const hash = hexToBytes(stacksAddr.hash160);
    buffer.set(hash, 1);
    
    // Byte 21: contract name length
    buffer[21] = contractName.length;
    
    // Bytes 22-39: contract name (up to 18 bytes for this encoding, zero-padded)
    // Note: Full contract names can be up to 128 chars, but we only have 18 bytes here
    // This is a limitation of the 40-byte encoding format
    const contractNameBytes = new TextEncoder().encode(contractName.slice(0, 18));
    buffer.set(contractNameBytes, 22);
    
  } else {
    // Standard principal (address only)
    const stacksAddr = transactions.createAddress(principal);
    
    // Byte 0: version byte
    buffer[0] = stacksAddr.version;
    
    // Bytes 1-20: hash160
    const hash = hexToBytes(stacksAddr.hash160);
    buffer.set(hash, 1);
    
    // Bytes 21-39: zero padding (already initialized to zeros)
  }
  
  return buffer;
}

/**
 * Encodes a uint128 value as 16-byte big-endian
 * 
 * Big-endian means most significant byte first.
 * For example, the value 256 (0x100) is encoded as:
 * [0x00, 0x00, ..., 0x00, 0x01, 0x00] (15 zeros, then 0x01, then 0x00)
 * 
 * @param value - Unsigned 128-bit integer (bigint)
 * @returns 16-byte Uint8Array in big-endian format
 * @throws Error if value is negative or exceeds uint128 max
 */
export function encodeUint128(value: bigint): Uint8Array {
  // Validate value is non-negative
  if (value < 0n) {
    throw new Error('Value must be non-negative');
  }
  
  // Validate value fits in uint128 (max value is 2^128 - 1)
  const MAX_UINT128 = (1n << 128n) - 1n;
  if (value > MAX_UINT128) {
    throw new Error('Value exceeds uint128 maximum');
  }
  
  const buffer = new Uint8Array(16);
  
  // Encode as big-endian (most significant byte first)
  // Start from the least significant byte (rightmost) and work backwards
  let remaining = value;
  for (let i = 15; i >= 0; i--) {
    buffer[i] = Number(remaining & 0xFFn); // Get lowest byte
    remaining = remaining >> 8n; // Shift right by 8 bits
  }
  
  return buffer;
}

/**
 * Helper function to convert hex string to Uint8Array
 * 
 * @param hex - Hex string (without "0x" prefix)
 * @returns Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
