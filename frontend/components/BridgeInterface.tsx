/**
 * BridgeInterface Component
 * Main UI for bridging USDC between Ethereum and Stacks
 */

'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { useConfig, getConfig, USDC_ABI, XRESERVE_ABI } from '@/lib/config';
import { createWalletClient, createPublicClient, custom, http, parseUnits, formatUnits } from 'viem';
import { Buffer } from 'buffer';
import { mainnet, sepolia } from 'viem/chains';
import { Shield, ArrowRight, Loader2, Unplug, RefreshCw, ArrowDownUp, Zap, AlertCircle, CheckCircle } from 'lucide-react';
import { encodeStacksAddress, bytesToHex, encodeEthereumAddress as encodeEthereumAddressUtil } from '@/lib/utils/address-encoding';
import { getStacksTransactions, getStacksNetwork, getStacksCommon, getStacksConnect, getNetworkInstance } from '@/lib/stacks-loader';
import { getVelumXClient } from '@/lib/velumx';

type BridgeDirection = 'eth-to-stacks' | 'stacks-to-eth';

interface BridgeState {
  amount: string;
  direction: BridgeDirection;
  gaslessMode: boolean;
  isProcessing: boolean;
  error: string | null;
  success: string | null;
  feeEstimate: {
    stx: string;
    usdcx: string;
  } | null;
  isRegistering: boolean;
}

export function BridgeInterface() {
  const {
    ethereumAddress,
    ethereumConnected,
    stacksAddress,
    stacksConnected,
    ethereumChainId,
    balances,
    fetchBalances,
    isFetchingBalances,
    switchEthereumNetwork,
    connectEthereum, // Added connectEthereum
    stacksPublicKey,
    recoverPublicKey,
  } = useWallet();

  const config = useConfig();


  // Manual refresh handler
  const handleRefreshBalances = async () => {
    if (fetchBalances) {
      await fetchBalances();
    }
  };

  // Format time ago
  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const [state, setState] = useState<BridgeState>({
    amount: '',
    direction: 'eth-to-stacks',
    gaslessMode: false,
    isProcessing: false,
    error: null,
    success: null,
    feeEstimate: null,
    isRegistering: false,
  });

  const [lastBalanceUpdate, setLastBalanceUpdate] = useState<number>(Date.now());

  // Update last balance update timestamp when balances change
  useEffect(() => {
    setLastBalanceUpdate(Date.now());
  }, [balances]);

  // Minimum bridge amounts
  const MIN_BRIDGE_IN = 10; // 10 USDC for mainnet
  const MIN_BRIDGE_OUT = 4.80;     // 4.80 USDCx for peg-out (covers bridge fees)

  // Validate amount
  const validateAmount = (amount: string): string | null => {
    if (!amount || amount === '0') {
      return 'Please enter an amount';
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return 'Invalid amount';
    }

    // Check minimum bridge amounts
    if (state.direction === 'eth-to-stacks') {
      if (numAmount < MIN_BRIDGE_IN) {
        return `Minimum deposit is ${MIN_BRIDGE_IN} USDC`;
      }
      const usdcBalance = parseFloat(balances.usdc);
      if (numAmount > usdcBalance) {
        return 'Insufficient USDC balance';
      }
    } else {
      if (numAmount < MIN_BRIDGE_OUT) {
        return `Minimum withdrawal is ${MIN_BRIDGE_OUT} USDCx (covers bridge fees)`;
      }
      
      const usdcxBalance = parseFloat(balances.usdcx);
      const gaslessFee = state.gaslessMode && state.feeEstimate ? parseFloat(state.feeEstimate.usdcx) : 0;
      
      if (numAmount + gaslessFee > usdcxBalance) {
        if (state.gaslessMode && gaslessFee > 0) {
          return `Insufficient USDCx balance (Amount + ${gaslessFee.toFixed(4)} fee)`;
        }
        return 'Insufficient USDCx balance';
      }
    }

    return null;
  };

  // Fetch fee estimate for gasless mode
  const fetchFeeEstimate = async () => {
    if (!state.gaslessMode || state.direction !== 'stacks-to-eth') return;

    try {
      const velumxClient = getVelumXClient();
      const config = getConfig();
      const estimate = await velumxClient.estimateFee({
        feeToken: config.stacksUsdcxAddress,
        estimatedGas: 100000
      });

      setState(prev => ({
        ...prev,
        feeEstimate: {
          stx: formatUnits(BigInt(estimate.estimatedGas || 100000), 6), 
          usdcx: formatUnits(BigInt(estimate.maxFee || 0), 6),
        },
      }));
    } catch (error) {
      console.error('Failed to fetch fee estimate via VelumX SDK:', error);
    }
  };


  // Fetch fee estimate when gasless mode, direction, or connection changes
  useEffect(() => {
    if (state.gaslessMode && state.direction === 'stacks-to-eth' && stacksConnected) {
      fetchFeeEstimate();
    } else if (!state.gaslessMode || state.direction !== 'stacks-to-eth') {
      setState(prev => ({ ...prev, feeEstimate: null }));
    }
  }, [state.gaslessMode, state.direction, stacksConnected]);

  // Auto-enable gasless mode if STX balance is low
  useEffect(() => {
    if (stacksConnected && balances.stx) {
      const stxBalance = parseFloat(balances.stx);
      if (stxBalance < 0.1) {
        setState(prev => ({ ...prev, gaslessMode: true }));
      }
    }
  }, [stacksConnected, balances.stx]);

  // Switch direction
  const switchDirection = () => {
    setState(prev => ({
      ...prev,
      direction: prev.direction === 'eth-to-stacks' ? 'stacks-to-eth' : 'eth-to-stacks',
      error: null,
      success: null,
      // Keep gaslessMode as is - usually if a user wants it for withdrawal, they want it to stay
    }));
  };


  // Encode Ethereum address to bytes32 for Stacks contract
  const encodeEthereumAddress = (address: string): Uint8Array => {
    const hex = encodeEthereumAddressUtil(address);
    // Defensive checks: ensure we have a hex string
    if (!hex || typeof hex !== 'string') {
      console.error('encodeEthereumAddressUtil returned invalid value', { address, hex });
      throw new Error('Invalid encoded hex for Ethereum address');
    }
    // Convert hex string to Uint8Array (remove 0x prefix)
    const hexWithoutPrefix = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (hexWithoutPrefix.length % 2 !== 0) {
      console.warn('Unexpected hex length when encoding ethereum address', { address, hex });
    }
    const bytes = new Uint8Array(hexWithoutPrefix.length / 2);
    for (let i = 0; i < hexWithoutPrefix.length; i += 2) {
      const byte = parseInt(hexWithoutPrefix.substring(i, i + 2), 16);
      if (Number.isNaN(byte)) {
        console.error('Failed to parse hex chunk while encoding ethereum address', { chunk: hexWithoutPrefix.substring(i, i + 2), address, hex });
        throw new Error('Invalid hex chunk while encoding ethereum address');
      }
      bytes[i / 2] = byte;
    }
    if (bytes.length !== 32) {
      console.warn('Encoded ethereum address length is unexpected', { address, bytesLength: bytes.length });
    }
    return bytes;
  };

  // Handle Ethereum to Stacks deposit
  const handleEthToStacks = async () => {
    if (!ethereumAddress || !stacksAddress) {
      setState(prev => ({ ...prev, error: 'Please connect both wallets' }));
      return;
    }

    const validationError = validateAmount(state.amount);
    if (validationError) {
      setState(prev => ({ ...prev, error: validationError }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      const ethChain = config.ethereumChainId === 1 ? mainnet : sepolia;
      
      const walletClient = createWalletClient({
        chain: ethChain,
        transport: custom((window as any).ethereum),
      });

      const publicClient = createPublicClient({
        chain: ethChain,
        transport: http(),
      });

      const amountInMicroUsdc = parseUnits(state.amount, 6);

      // Step 1: Check allowance
      const allowance = await publicClient.readContract({
        address: config.ethereumUsdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [ethereumAddress as `0x${string}`, config.ethereumXReserveAddress as `0x${string}`],
      });

      // Step 2: Approve if needed
      if ((allowance as bigint) < amountInMicroUsdc) {
        const approveHash = await walletClient.writeContract({
          address: config.ethereumUsdcAddress as `0x${string}`,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [config.ethereumXReserveAddress as `0x${string}`, amountInMicroUsdc],
          account: ethereumAddress as `0x${string}`,
        });

        // Wait for approval
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Step 3: Deposit to xReserve (Stacks official bridge)
      // Standard principals are required for the bridge recipient encoding
      const recipientBytes32 = await encodeStacksAddress(stacksAddress);

      const depositHash = await walletClient.writeContract({
        address: config.ethereumXReserveAddress as `0x${string}`,
        abi: XRESERVE_ABI,
        functionName: 'depositToRemote',
        args: [
          amountInMicroUsdc,
          config.stacksDomainId,
          recipientBytes32,
          config.ethereumUsdcAddress as `0x${string}`,
          parseUnits('0', 6), // Max fee: 0 USDC (as per Stacks docs)
          '0x' as `0x${string}`, // Empty hook data
        ],
        account: ethereumAddress as `0x${string}`,
      });

      // Wait for transaction receipt to get message hash
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });

      // Check if transaction was successful
      if (receipt.status === 'reverted') {
        throw new Error('Transaction failed - please check your USDC balance and try again');
      }

      // Extract message hash from xReserve transaction
      // For xReserve (Stacks official bridge), use transaction hash as message identifier
      // xReserve doesn't emit Circle's MessageSent event - it uses its own event system
      const messageHash = depositHash;

      // Step 4: Submit to monitoring service
      await fetch(`${config.backendUrl}/api/transactions/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: depositHash,
          type: 'deposit',
          sourceTxHash: depositHash,
          sourceChain: 'ethereum',
          destinationChain: 'stacks',
          amount: state.amount,
          sender: ethereumAddress,
          recipient: stacksAddress,
          ethereumAddress,
          stacksAddress,
          status: 'pending',
          currentStep: 'deposit',
          timestamp: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          isGasless: false,
          messageHash: messageHash || undefined,
        }),
      });

      setState(prev => ({
        ...prev,
        isProcessing: false,
        success: `Deposit initiated! Transaction: ${depositHash}`,
        amount: '',
      }));

      // Refresh balances after successful transaction
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
        }, 3000); // Wait 3 seconds for initial confirmation
      }
    } catch (error) {
      console.error('Deposit error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to process deposit',
      }));
    }
  };

  // Handle Stacks to Ethereum withdrawal
  const handleStacksToEth = async () => {
    if (!ethereumAddress || !stacksAddress) {
      setState(prev => ({ ...prev, error: 'Please connect both wallets' }));
      return;
    }

    const validationError = validateAmount(state.amount);
    if (validationError) {
      setState(prev => ({ ...prev, error: validationError }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      const useGasless = state.gaslessMode;

      if (useGasless) {
        // Use the simple Stacks-native gasless approach
        const { executeSimpleGaslessBridge } = await import('@/lib/helpers/simple-gasless-bridge');
        
        const txid = await executeSimpleGaslessBridge({
          userAddress: stacksAddress,
          amount: state.amount,
          recipientAddress: ethereumAddress,
          onProgress: (step) => {
            setState(prev => ({ ...prev, success: step }));
          }
        });

        setState(prev => ({
          ...prev,
          isProcessing: false,
          success: `Bridge successful! TX: ${txid}. Funds will arrive in ~15 minutes.`,
          amount: '',
        }));
      } else {
        // Standard non-gasless bridge (requires STX for gas)
        const transactions = await getStacksTransactions() as any;
        const { Cl } = transactions;
        const connect = await getStacksConnect() as any;
        const network = await getNetworkInstance();

        const amountInMicroUsdc = parseUnits(state.amount, 6);
        const recipientBytes = encodeEthereumAddress(ethereumAddress);

        const contractParts = config.stacksUsdcxProtocolAddress.split('.');
        if (contractParts.length !== 2) {
          throw new Error('Invalid bridge contract configuration');
        }

        const contractAddress = contractParts[0];
        const contractName = contractParts[1];

        const response = await connect.request('stx_callContract', {
          contract: `${contractAddress}.${contractName}`,
          functionName: 'burn',
          functionArgs: [
            Cl.uint(amountInMicroUsdc.toString()),
            Cl.uint("0"), // native-domain: 0 for Ethereum
            Cl.buffer(recipientBytes),
          ],
          network: 'mainnet',
          anchorMode: 'any',
          postConditionMode: 'allow',
          postConditions: [],
          appDetails: {
            name: 'VelumX Bridge',
            icon: typeof window !== 'undefined' ? window.location.origin + '/favicon.ico' : '',
          },
        });

        const finalTxId = response?.result?.txid;
        
        setState(prev => ({
          ...prev,
          isProcessing: false,
          success: `Bridge successful! TX: ${finalTxId}`,
          amount: '',
        }));
      }

      // Refresh balances after successful transaction
      if (fetchBalances) {
        setTimeout(() => {
          fetchBalances();
        }, 3000);
      }
    } catch (error) {
      console.error('Withdrawal error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to process withdrawal',
      }));
    }
  };

  // Handle bridge submission
  const handleBridge = async () => {
    if (state.direction === 'eth-to-stacks') {
      await handleEthToStacks();
    } else {
      await handleStacksToEth();
    }
  };

  // Check if both wallets are connected based on addresses (more reliable than flags during restoration)
  const isConnected = state.direction === 'eth-to-stacks'
    ? (ethereumConnected || !!ethereumAddress) && (stacksConnected || !!stacksAddress)
    : (stacksConnected || !!stacksAddress) && (ethereumConnected || !!ethereumAddress);

  const sourceBalance = state.direction === 'eth-to-stacks' ? balances.usdc : balances.usdcx;
  const sourceToken = state.direction === 'eth-to-stacks' ? 'USDC' : 'USDCx';
  const destToken = state.direction === 'eth-to-stacks' ? 'USDCx' : 'USDC';

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-3xl vellum-shadow transition-all duration-300" style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid var(--border-color)`,
        padding: '2rem'
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Cross-Chain Bridge
          </h2>
          <div className="text-xs px-3 py-1.5 rounded-full font-semibold" style={{
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            color: '#8B5CF6',
            border: '1px solid rgba(139, 92, 246, 0.2)'
          }}>
            {state.direction === 'eth-to-stacks' ? 'ETH → Stacks' : 'Stacks → ETH'}
          </div>
        </div>

        {/* From Section */}
        <div className="rounded-2xl p-6 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300" style={{
          border: `1px solid var(--border-color)`,
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                {state.direction === 'stacks-to-eth' ? 'Wallet Balance' : 'Balance'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {isFetchingBalances ? (
                    <Loader2 className="inline w-3 h-3 animate-spin" />
                  ) : (
                    <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{parseFloat(sourceBalance).toFixed(4)}</span>
                  )} {sourceToken}
                </span>
                <button
                  onClick={handleRefreshBalances}
                  disabled={isFetchingBalances}
                  className="p-0.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  title={`Last updated ${getTimeAgo(lastBalanceUpdate)}`}
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isFetchingBalances ? 'animate-spin' : ''}`} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="number"
              value={state.amount}
              onChange={(e) => setState(prev => ({ ...prev, amount: e.target.value, error: null }))}
              placeholder="0.00"
              className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
              style={{ color: 'var(--text-primary)' }}
              disabled={state.isProcessing}
            />
            <div className="flex items-center gap-3 bg-purple-600 dark:bg-purple-600 px-5 py-3 rounded-2xl shadow-lg shadow-purple-500/50 flex-shrink-0">
               <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold text-white">
                 {sourceToken[0]}
               </div>
               <span className="font-bold text-sm text-white">{sourceToken}</span>
            </div>
          </div>
          <button
            onClick={() => setState(prev => ({ ...prev, amount: sourceBalance }))}
            className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-4 font-bold transition-colors"
            disabled={state.isProcessing}
          >
            MAX
          </button>
        </div>

        {/* Switch Direction Button */}
        <div className="flex justify-center my-4 relative z-10">
          <button
            onClick={switchDirection}
            disabled={state.isProcessing}
            className="rounded-full p-3 transition-all disabled:opacity-50 hover:border-purple-600 dark:hover:border-purple-400 shadow-lg"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: `2px solid var(--border-color)`
            }}
          >
            <ArrowDownUp className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* To Section */}
        <div className="rounded-2xl p-6 mb-6" style={{
          border: `1px solid var(--border-color)`,
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>To</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 text-4xl font-mono min-w-0" style={{ color: 'var(--text-secondary)' }}>
              {state.amount || '0.00'}
            </div>
            <div className="flex items-center gap-3 bg-blue-600 dark:bg-blue-600 px-5 py-3 rounded-2xl shadow-lg shadow-blue-500/50 flex-shrink-0">
               <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-[10px] font-bold text-white">
                 {destToken[0]}
               </div>
               <span className="font-bold text-sm text-white">{destToken}</span>
            </div>
          </div>
        </div>

        {/* Gasless Mode Toggle (only for Stacks → Ethereum) */}
        {state.direction === 'stacks-to-eth' ? (
          <div className="rounded-lg p-4 mb-6" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'rgba(16, 185, 129, 0.05)'
          }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)'
                }}>
                  <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Gasless Mode</span>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Pay fees in USDCx</p>
                </div>
              </div>
              <button
                onClick={() => setState(prev => ({ ...prev, gaslessMode: !prev.gaslessMode }))}
                className={`relative w-14 h-7 rounded-full transition-all duration-300 ${state.gaslessMode ? 'bg-green-600 shadow-lg shadow-green-500/20' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                disabled={state.isProcessing}
              >
                <div
                  className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${state.gaslessMode ? 'translate-x-7' : ''
                    }`}
                />
              </button>
            </div>
            {state.gaslessMode && !stacksPublicKey && (
              <div className="mt-2 mb-2 p-3 bg-red-500/10 rounded-lg flex flex-col gap-2">
                <p className="text-xs text-red-600 dark:text-red-400">Gasless transactions require verification.</p>
                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    await recoverPublicKey();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors w-full"
                >
                  Verify Wallet & Enable Gasless
                </button>
              </div>
            )}
            {state.gaslessMode && state.feeEstimate && stacksPublicKey && (
              <div className="mt-4 pt-4 text-sm" style={{
                borderTop: `1px solid var(--border-color)`,
                color: 'var(--text-primary)'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fee:</span> <span className="font-mono font-semibold">{parseFloat(state.feeEstimate.usdcx).toFixed(4)}</span> USDCx
              </div>
            )}
          </div>
        ) : (
          /* eth-to-stacks direction */
          <div className="rounded-lg p-4 mb-6" style={{
            border: `1px solid var(--border-color)`,
            backgroundColor: 'rgba(16, 185, 129, 0.05)'
          }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)'
              }}>
                <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Sponsored Minting</span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1 rounded uppercase font-bold">Auto</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Zero STX required to receive tokens on Stacks</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {state.error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400 font-bold">{state.error}</p>
          </div>
        )}

        {/* Success Message */}
        {state.success && (
          <div className="flex items-start gap-3 rounded-xl p-4 mb-6 border" style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'var(--success-color)',
            color: 'var(--success-color)'
          }}>
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success-color)' }} />
            <p className="text-sm font-medium">{state.success}</p>
          </div>
        )}

        {/* Bridge Button */}
        <button
          onClick={handleBridge}
          disabled={!isConnected || state.isProcessing || !state.amount || !!validateAmount(state.amount)}
          className="w-full py-5 rounded-2xl font-bold text-lg transition-all vellum-shadow disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-1 active:translate-y-0"
          style={{
            background: state.isProcessing ? 'var(--bg-card)' : 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            color: 'white',
            border: state.isProcessing ? '1px solid var(--border-color)' : 'none'
          }}
        >
          {state.isProcessing ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing...</span>
            </div>
          ) : !isConnected ? (
            'Connect Both Wallets'
          ) : (
            (() => {
              if (state.direction === 'stacks-to-eth' && state.gaslessMode) {
                return 'Bridge USDCx';
              }
              return (
                <div className="flex items-center justify-center gap-2">
                  <ArrowDownUp className="w-5 h-5" />
                  <span>Bridge {sourceToken}</span>
                </div>
              );
            })()
          )}
        </button>

        {/* Info */}
        <div className="mt-6 pt-6 text-xs text-center space-y-1" style={{
          borderTop: `1px solid var(--border-color)`,
          color: 'var(--text-secondary)'
        }}>
          <p className="flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full dark:animate-pulse-glow animate-slide-progress"></span>
            Circle xReserve • 5-10 min confirmation
          </p>
          <p>Secure & trustless • Powered by USDC native bridging</p>
        </div>
      </div>
    </div>
  );
}
