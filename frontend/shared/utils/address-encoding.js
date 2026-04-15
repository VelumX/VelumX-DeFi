"use strict";
/**
 * Address encoding utilities for cross-chain bridge
 * Handles conversion between Stacks addresses and bytes32 format
 * Based on official Stacks USDCx bridging documentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeStacksAddress = encodeStacksAddress;
exports.decodeStacksAddress = decodeStacksAddress;
exports.encodeEthereumAddress = encodeEthereumAddress;
exports.decodeEthereumAddress = decodeEthereumAddress;
exports.isValidStacksAddress = isValidStacksAddress;
exports.isValidEthereumAddress = isValidEthereumAddress;
const transactions_1 = require("@stacks/transactions");
const viem_1 = require("viem");
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
function encodeStacksAddress(address) {
    const stacksAddr = (0, transactions_1.createAddress)(address);
    const buffer = new Uint8Array(32);
    // 11 zero bytes (padding)
    buffer.fill(0, 0, 11);
    // 1 version byte
    buffer[11] = stacksAddr.version;
    // 20 hash160 bytes
    const hash = hexToBytes(stacksAddr.hash160);
    buffer.set(hash, 12);
    return (0, viem_1.toHex)(buffer);
}
/**
 * Decodes a bytes32 value back to a Stacks address
 *
 * @param bytes32 - 32-byte hex string
 * @returns Stacks address string
 */
function decodeStacksAddress(bytes32) {
    const buffer = (0, viem_1.toBytes)(bytes32);
    // Skip 11 zero bytes
    // Extract version byte (position 11)
    const version = buffer[11];
    // Extract 20 hash160 bytes (positions 12-31)
    const hash = buffer.slice(12, 32);
    const hash160 = bytesToHex(hash);
    return (0, transactions_1.addressToString)({
        hash160,
        version,
        type: 0, // Address type constant
    });
}
/**
 * Encodes an Ethereum address to bytes32 format
 * Left-padded with zeros
 *
 * @param address - Ethereum address (e.g., "0x1234...")
 * @returns 32-byte hex string
 */
function encodeEthereumAddress(address) {
    // Ensure address is lowercase and has 0x prefix
    const normalizedAddress = address.toLowerCase().startsWith('0x')
        ? address.toLowerCase()
        : `0x${address.toLowerCase()}`;
    // Convert to bytes, pad to 32 bytes, then convert back to hex
    const addressBytes = (0, viem_1.toBytes)(normalizedAddress);
    const paddedBytes = new Uint8Array(32);
    paddedBytes.fill(0); // Fill with zeros
    paddedBytes.set(addressBytes, 12); // Place address at the end (left-padded)
    console.log('Before toHex, paddedBytes:', paddedBytes);
    const result = (0, viem_1.toHex)(paddedBytes);
    console.log('After toHex, result type:', typeof result, 'value:', result);
    return result;
}
/**
 * Decodes a bytes32 value back to an Ethereum address
 *
 * @param bytes32 - 32-byte hex string
 * @returns Ethereum address string
 */
function decodeEthereumAddress(bytes32) {
    const buffer = (0, viem_1.toBytes)(bytes32);
    // Extract last 20 bytes (Ethereum address is 20 bytes)
    const addressBytes = buffer.slice(12, 32);
    // Convert to hex with proper padding to ensure 40 characters (20 bytes)
    const hexAddress = bytesToHex(addressBytes);
    return `0x${hexAddress}`;
}
/**
 * Validates a Stacks address format
 *
 * @param address - Address to validate
 * @returns true if valid Stacks address
 */
function isValidStacksAddress(address) {
    try {
        (0, transactions_1.createAddress)(address);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Validates an Ethereum address format
 *
 * @param address - Address to validate
 * @returns true if valid Ethereum address
 */
function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
// ============ Helper Functions ============
/**
 * Converts hex string to Uint8Array
 */
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}
/**
 * Converts Uint8Array to hex string
 */
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
//# sourceMappingURL=address-encoding.js.map