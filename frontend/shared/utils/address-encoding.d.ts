/**
 * Address encoding utilities for cross-chain bridge
 * Handles conversion between Stacks addresses and bytes32 format
 * Based on official Stacks USDCx bridging documentation
 */
import { type Hex } from 'viem';
/**
 * Encodes a Stacks address to bytes32 format for xReserve protocol
 * Format: [11 zero bytes][1 version byte][20 hash160 bytes]
 *
 * This implementation follows the official Stacks documentation:
 * https://docs.stacks.co/more-guides/bridging-usdcx
 *
 * @param address - Stacks address (e.g., "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM")
 * @returns 32-byte hex string
 */
export declare function encodeStacksAddress(address: string): Hex;
/**
 * Decodes a bytes32 value back to a Stacks address
 *
 * @param bytes32 - 32-byte hex string
 * @returns Stacks address string
 */
export declare function decodeStacksAddress(bytes32: Hex): string;
/**
 * Encodes an Ethereum address to bytes32 format
 * Left-padded with zeros
 *
 * @param address - Ethereum address (e.g., "0x1234...")
 * @returns 32-byte hex string
 */
export declare function encodeEthereumAddress(address: string): Hex;
/**
 * Decodes a bytes32 value back to an Ethereum address
 *
 * @param bytes32 - 32-byte hex string
 * @returns Ethereum address string
 */
export declare function decodeEthereumAddress(bytes32: Hex): Hex;
/**
 * Validates a Stacks address format
 *
 * @param address - Address to validate
 * @returns true if valid Stacks address
 */
export declare function isValidStacksAddress(address: string): boolean;
/**
 * Validates an Ethereum address format
 *
 * @param address - Address to validate
 * @returns true if valid Ethereum address
 */
export declare function isValidEthereumAddress(address: string): boolean;
//# sourceMappingURL=address-encoding.d.ts.map