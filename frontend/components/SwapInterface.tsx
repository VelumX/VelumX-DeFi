/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks using our AMM swap contract
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { useConfig, getConfig } from '@/lib/config';
import { ArrowDownUp, Settings, Info, Loader2, AlertTriangle, Wallet, ChevronDown, Zap } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { encodeStacksAddress, bytesToHex } from '@/lib/utils/address-encoding';
import { getVelumXClient } from '@/lib/velumx';
import { BitflowSDK, type QuoteResult } from '@bitflowlabs/core-sdk';
import { getBitflowSDK } from '@/lib/bitflow';
import { useTokenStore } from '@/lib/hooks/useTokenStore';
import { TokenInput } from './ui/TokenInput';
import { SettingsPanel } from './ui/SettingsPanel';
import { GaslessToggle } from './ui/GaslessToggle';
import { TransactionStatus } from './ui/TransactionStatus';

/** Timeout for quote API calls (ms) */
const QUOTE_TIMEOUT_MS = 20_000;
/** Debounce delay before firing a quote request (ms) */
const QUOTE_DEBOUNCE_MS = 600;

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  assetName?: string;
  tokenId?: string; // Added for Bitflow
}

interface SwapQuote {
  amountOut: string;
  priceImpact: string;
  fee: string;
  rate: string;
  bestRoute?: any;
  allRoutes?: any[]; // All available routes from Bitflow
}

interface SwapState {
  inputToken: Token | null;
  outputToken: Token | null;
  inputAmount: string;
  outputAmount: string;
  gaslessMode: boolean;
  selectedGasToken: Token | null; // New: Universal Gas Token
  isProcessing: boolean;
  isFetchingQuote: boolean;
  error: string | null;
  success: string | null;
  quote: SwapQuote | null;
  gasFee: string;
  slippage: number;
  showSettings: boolean;
  isRegistering: boolean;
  feeEstimate: any | null;
}

// Maps known token symbols/IDs (as stored in developer dashboard) to their
// mainnet Stacks contract principals. Used to resolve gas tokens returned
// by the relayer that may be stored as symbols rather than contract addresses.
const KNOWN_TOKEN_CONTRACTS: Record<string, string> = {
  'ALEX':                    'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
  'age000-governance-token': 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
  'token-alex':              'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
  'USDCx':                   'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
  'usdcx':                   'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
  'aeUSDC':                  'SP3Y2ZSH8P7D50B0JLZVGKMBC7PX3RVRGWJKWKY38.token-aeusdc',
  'token-aeusdc':            'SP3Y2ZSH8P7D50B0JLZVGKMBC7PX3RVRGWJKWKY38.token-aeusdc',
  'sBTC':                    'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  'sbtc-token':              'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
};

/**
 * Resolves a token identifier (symbol, ALEX ID, or contract principal) to
 * a full Stacks contract principal. Returns the input unchanged if it already
 * looks like a principal (contains a dot).
 */
function resolveTokenAddress(tokenId: string): string {
  if (tokenId.includes('.')) return tokenId; // already a contract principal
  return KNOWN_TOKEN_CONTRACTS[tokenId] || KNOWN_TOKEN_CONTRACTS[tokenId.toLowerCase()] || tokenId;
}


export function SwapInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances, stacksPublicKey, recoverPublicKey } = useWallet();
  const config = useConfig();

  React.useEffect(() => {
    if (!stacksAddress) return;
    (async () => {
      try {
        await fetchBalances();
      } catch (e) {
        console.warn('Balance refresh failed:', e);
      }
    })();
  }, [stacksAddress, fetchBalances]);

  const getBalance = (token: Token | null): string => {
    if (!token) return '0';

    // STX
    if (token.symbol === 'STX' || token.address === 'token-wstx' || token.address.includes('token-wstx')) {
      return (balances as any).stx || '0';
    }

    // Hiro API balance (for SIP-010 tokens)
    const byPrincipal = (balances as any)[token.address];
    if (byPrincipal !== undefined && byPrincipal !== null && byPrincipal !== '0') {
      const storedDecimals = (balances as any)[`decimals:${token.address}`];
      const decimals = storedDecimals !== undefined ? parseInt(storedDecimals) : token.decimals;
      const num = Number(byPrincipal) / Math.pow(10, decimals);
      return isNaN(num) ? '0' : num.toFixed(6);
    }

    // Fuzzy match on Hiro balances
    const allKeys = Object.keys(balances as any).filter(k =>
      !k.startsWith('decimals:') && !k.startsWith('name:') && !k.startsWith('symbol:')
    );
    const fuzzyKey = allKeys.find(k =>
      k.startsWith(token.address) ||
      token.address.startsWith(k) ||
      k.toLowerCase().includes(token.symbol.toLowerCase())
    );
    if (fuzzyKey) {
      const raw = (balances as any)[fuzzyKey];
      if (raw && raw !== '0') {
        const storedDecimals = (balances as any)[`decimals:${fuzzyKey}`];
        const decimals = storedDecimals !== undefined ? parseInt(storedDecimals) : token.decimals;
        const num = Number(raw) / Math.pow(10, decimals);
        return isNaN(num) ? '0' : num.toFixed(6);
      }
    }

    return (balances as any)[token.symbol.toLowerCase()] || '0';
  };

  const { tokens, isLoading: isDiscovering } = useTokenStore();
  const [supportedGasTokens, setSupportedGasTokens] = useState<string[]>([]); // from developer settings
  const [sponsorshipPolicy, setSponsorshipPolicy] = useState<string>('USER_PAYS');
  const gasDropdownRef = React.useRef<HTMLDivElement>(null);

  // Close gas dropdown on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (gasDropdownRef.current && !gasDropdownRef.current.contains(e.target as Node)) {
        setState(prev => ({ ...prev, isRegistering: false }));
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch developer's supported gas tokens from relayer config via SDK
  React.useEffect(() => {
    const fetchRelayerConfig = async () => {
      try {
        const velumxClient = getVelumXClient();
        const data = await velumxClient.getConfig();
        
        if (data.sponsorshipPolicy) {
          setSponsorshipPolicy(data.sponsorshipPolicy);
          if (data.sponsorshipPolicy === 'DEVELOPER_SPONSORS') {
            setState(prev => ({ ...prev, gaslessMode: true }));
          }
        }
        
        if (data.supportedGasTokens?.length > 0) {
          setSupportedGasTokens(data.supportedGasTokens);
          // Set default gas token to first supported one if current default isn't in the list
          setState(prev => {
            const currentAddr = prev.selectedGasToken?.address || '';
            const isCurrentSupported = data.supportedGasTokens.includes(currentAddr);
            if (!isCurrentSupported) {
              const firstAddr = resolveTokenAddress(data.supportedGasTokens[0]);
              const matchedToken = tokens.find(t => t.address === firstAddr) || 
                { symbol: 'Token', name: firstAddr, address: firstAddr, decimals: 6 };
              return { ...prev, selectedGasToken: matchedToken };
            }
            return prev;
          });
        }
      } catch (err) {
        console.warn('Failed to fetch relayer config:', err);
      }
    };
    
    if (tokens.length > 0) {
      fetchRelayerConfig();
    }
  }, [tokens]);
  const [state, setState] = useState<SwapState>({
    inputToken: null,
    outputToken: null,
    inputAmount: '',
    outputAmount: '',
    gaslessMode: true,
    selectedGasToken: null,
    isProcessing: false,
    isFetchingQuote: false,
    error: null,
    success: null,
    quote: null,
    gasFee: '0',
    slippage: 0.5,
    showSettings: false,
    isRegistering: false,
    feeEstimate: null,
  });

  // Auto-select default tokens once the shared store has tokens
  useEffect(() => {
    if (tokens.length === 0) return;
    setState(prev => {
      if (prev.inputToken && prev.outputToken) return prev;
      const stx = tokens.find(t => t.symbol === 'STX' || t.tokenId === 'token-stx');
      const usdcx = tokens.find(t => t.symbol === 'USDCx');
      const aeusdc = tokens.find(t => t.symbol === 'aeUSDC');
      const usda = tokens.find(t => t.symbol === 'USDA');
      const defaultStable = usdcx || aeusdc || usda || tokens[1];
      return {
        ...prev,
        inputToken: prev.inputToken || stx || tokens[0] || null,
        outputToken: prev.outputToken || defaultStable || tokens[1] || null,
        selectedGasToken: prev.selectedGasToken || defaultStable || stx || tokens[0] || null,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  // ── Quote staleness tracking ──────────────────────────────────────────────
  const quoteGenRef = useRef(0);

  /**
   * Fetch a swap quote from Bitflow with:
   *   • 20-second timeout — prevents the UI from hanging on slow / dead APIs
   *   • Generation counter — discards stale responses that arrive after a
   *     newer request has already been fired
   *   • Single retry — automatically retries once on transient failures
   */
  const fetchQuote = useCallback(async (retryCount = 0) => {
    if (!state.inputToken || !state.outputToken || !state.inputAmount) return;

    // Bump generation so stale responses are ignored
    const generation = ++quoteGenRef.current;

    setState(prev => ({ ...prev, isFetchingQuote: true, error: null }));

    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const bitflow = getBitflowSDK();
      
      // Helper to find tokenId from the discovered tokens list if missing
      const getTokenId = (token: Token) => {
        if (token.tokenId) return token.tokenId;
        // Fallback: look up in discovered tokens by address
        const match = tokens.find(t => t.address.toLowerCase() === token.address.toLowerCase());
        return match?.tokenId || token.address;
      };

      const tokenInId = getTokenId(state.inputToken);
      const tokenOutId = getTokenId(state.outputToken);
      const amountIn = parseFloat(state.inputAmount);

      console.log(`[Swap] Requesting Quote (gen ${generation}): ${state.inputToken.symbol} (${tokenInId}) -> ${state.outputToken.symbol} (${tokenOutId}) | Amount: ${amountIn}`);

      // Race the SDK call against a timeout
      const quotePromise = bitflow.getQuoteForRoute(tokenInId, tokenOutId, amountIn);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Quote request timed out'));
        }, QUOTE_TIMEOUT_MS);
      });

      const quoteResult: QuoteResult = await Promise.race([quotePromise, timeoutPromise]);

      // Clear the timeout if the quote succeeded
      if (timeoutId) clearTimeout(timeoutId);

      // If a newer request was fired while we were waiting, discard this result
      if (generation !== quoteGenRef.current) {
        console.log(`[Swap] Discarding stale quote (gen ${generation})`);
        return;
      }

      console.log('[Swap] Bitflow Quote Result:', JSON.stringify({
        hasBestRoute: !!quoteResult?.bestRoute,
        allRoutesCount: quoteResult?.allRoutes?.length,
        bestRouteQuote: quoteResult?.bestRoute?.quote
      }, null, 2));

      const bestRoute = quoteResult.bestRoute;

      if (!bestRoute || !bestRoute.quote) {
        console.warn(`[Swap] No route found for ${tokenInId} -> ${tokenOutId}`);
        throw new Error(`No liquidity found for ${state.inputToken.symbol} to ${state.outputToken.symbol} on Bitflow`);
      }

      console.log(`[Swap] Success (gen ${generation}): ${bestRoute.quote} units`);

      const outputAmountFormatted = bestRoute.quote.toFixed(6);
      const rate = (bestRoute.quote / amountIn).toFixed(6);

      setState(prev => ({
        ...prev,
        outputAmount: outputAmountFormatted,
        quote: {
          amountOut: outputAmountFormatted,
          priceImpact: '0.30', // Placeholder
          fee: '0.3%',
          rate,
          bestRoute, // Store the actual route object for execution
          allRoutes: quoteResult.allRoutes?.filter(r => r.quote !== null) || [],
        },
        isFetchingQuote: false,
      }));
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);

      // Ignore stale errors
      if (generation !== quoteGenRef.current) return;

      // Retry once on transient failures (timeout, network blip)
      if (retryCount < 1) {
        console.warn(`[Swap] Quote failed (gen ${generation}), retrying...`, error?.message);
        return fetchQuote(retryCount + 1);
      }

      console.error('Failed to fetch quote via Bitflow SDK:', error);
      setState(prev => ({
        ...prev,
        error: error?.message?.includes('timed out')
          ? 'Quote request timed out. Please try again.'
          : 'No liquidity pool found for this pair on Bitflow.',
        isFetchingQuote: false,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.inputToken, state.outputToken, state.inputAmount, tokens]);

  // Fetch fee estimate for universal gas mode
  const fetchFeeEstimate = useCallback(async () => {
    if (!state.gaslessMode || !state.selectedGasToken) return;

    try {
      const velumxClient = getVelumXClient();
      const estimate = await velumxClient.estimateFee({
        feeToken: state.selectedGasToken.address, 
        estimatedGas: 250000 
      });
        
      if (estimate) {
        setState(prev => ({ 
          ...prev, 
          gasFee: (Number(estimate.maxFee) / Math.pow(10, state.selectedGasToken?.decimals || 6)).toFixed(4),
          feeEstimate: estimate
        }));
      }
    } catch (error) {
      console.error('Failed to fetch universal fee estimate:', error);
    }
  }, [state.gaslessMode, state.selectedGasToken]);

  useEffect(() => {
    if (state.inputToken && state.outputToken && state.inputAmount && parseFloat(state.inputAmount) > 0) {
      const timer = setTimeout(() => {
        fetchQuote();
      }, QUOTE_DEBOUNCE_MS);
      return () => {
        clearTimeout(timer);
      };
    } else {
      setState(prev => ({ ...prev, outputAmount: '', quote: null }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.inputToken, state.outputToken, state.inputAmount]);



  // Separate effect for fee estimate — doesn't block or delay quotes
  useEffect(() => {
    if (state.gaslessMode && state.selectedGasToken && state.inputToken && state.outputToken) {
      fetchFeeEstimate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.gaslessMode, state.selectedGasToken]);

  // ── Eagerly pre-load Stacks Connect & Network ──────────────────────────────
  // These are needed by the wallet signing popup. Loading them before the user
  // clicks "Swap" ensures openContractCall fires within the browser's
  // user-gesture timeout window (~1s), preventing popup-block issues.
  const connectRef = useRef<any>(null);
  const networkRef = useRef<any>(null);

  useEffect(() => {
    if (!stacksConnected) return;
    let cancelled = false;
    (async () => {
      try {
        const { getStacksConnect, getNetworkInstance } = await import('@/lib/stacks-loader');
        const [c, n] = await Promise.all([
          getStacksConnect(),
          getNetworkInstance(true),
        ]);
        if (!cancelled) {
          connectRef.current = c;
          networkRef.current = n;
          console.log('[Swap] Stacks Connect & Network pre-loaded');
        }
      } catch (e) {
        console.warn('[Swap] Failed to pre-load Stacks modules:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [stacksConnected]);

  const switchTokens = () => {
    setState(prev => ({
      ...prev,
      inputToken: prev.outputToken,
      outputToken: prev.inputToken,
      inputAmount: prev.outputAmount,
      outputAmount: prev.inputAmount,
      quote: null,
      success: null,
      error: null,
    }));
  };

  const handleSwap = async () => {
    if (!stacksAddress || !state.inputToken || !state.outputToken) {
      setState(prev => ({ ...prev, error: 'Please connect wallet and select tokens' }));
      return;
    }

    if (!state.inputAmount || parseFloat(state.inputAmount) <= 0) {
      setState(prev => ({ ...prev, error: 'Please enter a valid amount' }));
      return;
    }
    
    // Validate sufficient balance
    const currentBalance = parseFloat(getBalance(state.inputToken));
    if (parseFloat(state.inputAmount) > currentBalance) {
      setState(prev => ({ ...prev, error: `Insufficient ${state.inputToken?.symbol} balance` }));
      return;
    }

    if (!state.quote) {
      setState(prev => ({ ...prev, error: 'Please wait for quote' }));
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null, success: null }));

    try {
      const useGasless = state.gaslessMode;

      if (useGasless) {
        // Use VelumX SDK for gasless swaps via Bitflow
        const { executeBitflowGaslessSwap } = await import('@/lib/helpers/bitflow-gasless-swap');
        
        // Helper to find tokenId from the discovered tokens list if missing
        const getTokenId = (token: Token) => {
          if (token.tokenId) return token.tokenId;
          const match = tokens.find(t => t.address.toLowerCase() === token.address.toLowerCase());
          return match?.tokenId || token.address;
        };

        const txid = await executeBitflowGaslessSwap({
          userAddress: stacksAddress,
          userPublicKey: stacksPublicKey || undefined,
          tokenIn: state.inputToken.address,
          tokenInId: getTokenId(state.inputToken),
          tokenOut: state.outputToken.address,
          tokenOutId: getTokenId(state.outputToken),
          amountIn: state.inputAmount,
          tokenInDecimals: state.inputToken.decimals,
          tokenOutDecimals: state.outputToken.decimals,
          feeToken: state.selectedGasToken?.address || '',
          sponsorshipPolicy: sponsorshipPolicy,
          quoteResult: state.quote ? {
            bestRoute: state.quote.bestRoute,
            allRoutes: state.quote.allRoutes ?? [],
            inputData: { tokenX: getTokenId(state.inputToken), tokenY: getTokenId(state.outputToken), amountInput: parseFloat(state.inputAmount) },
          } : undefined,
          feeEstimate: state.feeEstimate,
          preloadedConnect: connectRef.current,
          preloadedNetwork: networkRef.current,
          onProgress: (step) => {
            setState(prev => ({ ...prev, success: step }));
          }
        });

        setState(prev => ({
          ...prev,
          isProcessing: false,
          success: `Swap submitted! TX: ${txid}. Waiting for confirmation...`,
          inputAmount: '',
          outputAmount: '',
          quote: null,
        }));

        // Poll for balance change after gasless swap (same pattern as non-gasless path)
        if (fetchBalances && stacksAddress) {
          const inputToken = state.inputToken;
          const prevInputBalance = getBalance(inputToken);
          const maxAttempts = 60;
          let attempts = 0;
          const poll = async () => {
            attempts++;
            await fetchBalances();
            const newBalance = getBalance(inputToken);
            if (newBalance !== prevInputBalance) {
              setState(prev => ({ ...prev, success: `Swap confirmed! TX: ${txid}` }));
              return;
            }
            if (attempts < maxAttempts) setTimeout(poll, 15000);
          };
          setTimeout(poll, 10000);
        }
      } else {
        // Standard non-gasless swap via Bitflow SDK
        const bitflow = getBitflowSDK();
        
        // Use the route stored in our quote state to ensure consistency
        const bestRoute = state.quote.bestRoute;
        if (!bestRoute) throw new Error('No valid swap route found in state. Please refresh the quote.');

        const amountIn = parseFloat(state.inputAmount);

        console.log('[Swap] Generating params for route:', bestRoute);

        const swapParams = await bitflow.getSwapParams({
          route: bestRoute,
          amount: amountIn,
          tokenXDecimals: state.inputToken.decimals,
          tokenYDecimals: state.outputToken.decimals,
        }, stacksAddress, state.slippage / 100);

        // Use pre-loaded connect/network, fallback to dynamic import if needed
        let connect = connectRef.current;
        let network = networkRef.current;
        if (!connect || !network) {
          const loader = await import('@/lib/stacks-loader');
          connect = connect || await loader.getStacksConnect();
          network = network || await loader.getNetworkInstance(true);
        }

        await connect.openContractCall({
          contractAddress: swapParams.contractAddress,
          contractName: swapParams.contractName,
          functionName: swapParams.functionName,
          functionArgs: swapParams.functionArgs,
          network: network,
          anchorMode: 'any',
          postConditionMode: 'allow',
          postConditions: [],
          onFinish: (data: any) => {
            setState(prev => ({
              ...prev,
              isProcessing: false,
              success: `Swap submitted! TX: ${data.txid}. Waiting for confirmation...`,
              inputAmount: '',
              outputAmount: '',
              quote: null,
            }));
            if (fetchBalances && stacksAddress) {
              const inputToken = state.inputToken;
              const prevInputBalance = getBalance(inputToken);
              const maxAttempts = 60;
              let attempts = 0;
              const poll = async () => {
                attempts++;
                await fetchBalances();
                const newBalance = getBalance(inputToken);
                if (newBalance !== prevInputBalance) {
                  setState(prev => ({ ...prev, success: `Swap confirmed! TX: ${data.txid}` }));
                  return;
                }
                if (attempts < maxAttempts) setTimeout(poll, 15000);
              };
              setTimeout(poll, 10000);
            }
          },
          onCancel: () => {
            setState(prev => ({ ...prev, isProcessing: false }));
          }
        });
      }
    } catch (error) {
      console.error('Swap error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: (error as Error).message || 'Failed to execute swap',
      }));
    }
  };

  // Check if balances is in scope by moving getBalance usage inside component or ensure scope is correct


  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-3xl vellum-shadow transition-all duration-300" style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid var(--border-color)`,
        padding: '2rem'
      }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Swap Interface
          </h2>
          <button
            onClick={() => setState(prev => ({ ...prev, showSettings: !prev.showSettings }))}
            className={`p-2 rounded-lg transition-all ${state.showSettings ? 'bg-purple-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            style={{ color: state.showSettings ? '' : 'var(--text-secondary)' }}
          >
            <Settings className={`w-5 h-5 ${state.showSettings ? 'animate-spin-slow' : ''}`} />
          </button>
        </div>

        {/* Token Discovery Label */}
        <div className="flex items-center gap-2 mb-6 px-1">
          <div className={`w-2 h-2 rounded-full ${isDiscovering ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
            {isDiscovering ? 'Discovering Liquidity...' : `${tokens.length} Assets Synchronized`}
          </span>
          {isDiscovering && (
             <span className="text-[10px] font-bold text-purple-500 ml-2 animate-pulse">
               Connecting...
             </span>
          )}
        </div>

        {/* Skeleton UI — shown while tokens are loading for the first time */}
        {isDiscovering && tokens.length === 0 && (
          <div className="space-y-3 mb-4 animate-pulse">
            {[0, 1].map(i => (
              <div key={i} className="rounded-2xl p-6" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}>
                <div className="flex items-center justify-between mb-6">
                  <div className="h-3 w-8 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
                  <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-32 rounded" style={{ backgroundColor: 'var(--border-color)' }} />
                  <div className="h-10 w-28 rounded-xl" style={{ backgroundColor: 'var(--border-color)' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <SettingsPanel
          slippage={state.slippage}
          setSlippage={(val: number) => setState(prev => ({ ...prev, slippage: val }))}
          isOpen={state.showSettings}
        />


        <div className="relative overflow-visible" style={{ isolation: 'auto' }}>
          <TokenInput
            label="Sell"
            amount={state.inputAmount}
            setAmount={(val: string) => setState(prev => ({ ...prev, inputAmount: val, error: null }))}
            token={state.inputToken}
            setToken={(t) => setState(prev => ({ ...prev, inputToken: t, success: null, error: null }))}
            tokens={tokens}
            balance={getBalance(state.inputToken)}
            isProcessing={state.isProcessing}
            isLoadingTokens={isDiscovering}
            onMax={() => setState(prev => ({ ...prev, inputAmount: getBalance(state.inputToken) }))}
            variant="purple"
            getTokenBalance={getBalance}
          />

          {/* Switch Button */}
          <div className="flex justify-center my-4">
            <button
              onClick={switchTokens}
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

          <TokenInput
            label="Buy"
            amount={state.outputAmount}
            setAmount={() => { }}
            token={state.outputToken}
            setToken={(t) => setState(prev => ({ ...prev, outputToken: t, success: null, error: null }))}
            tokens={tokens}
            balance={getBalance(state.outputToken)}
            isProcessing={state.isProcessing}
            isLoadingTokens={isDiscovering}
            variant="blue"
            getTokenBalance={getBalance}
          />
        </div>

        <div className="mt-6">
          {/* Route Display */}
          {state.quote?.allRoutes && state.quote.allRoutes.length > 0 && (
            <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
              <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                  Routes ({state.quote.allRoutes.length})
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                {state.quote.allRoutes
                  .sort((a: any, b: any) => (b.quote || 0) - (a.quote || 0))
                  .map((route: any, i: number) => {
                    const isBest = route === state.quote?.bestRoute ||
                      (route.quote !== null && route.quote === state.quote?.bestRoute?.quote);
                    const dexPath: string[] = route.dexPath || route.dex_path || [];
                    const tokenPath: string[] = route.tokenPath || route.token_path || [];
                    const quoteVal: number | null = route.quote;

                    return (
                      <div
                        key={i}
                        className="px-4 py-3 flex items-center justify-between gap-3 transition-colors"
                        style={{
                          backgroundColor: isBest ? 'rgba(139,92,246,0.08)' : 'transparent',
                        }}
                      >
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {isBest && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 shrink-0">
                              Best
                            </span>
                          )}
                          {/* DEX path badges */}
                          <div className="flex items-center gap-1 flex-wrap">
                            {dexPath.length > 0 ? dexPath.map((dex: string, j: number) => (
                              <span key={j} className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                                {dex}
                              </span>
                            )) : (
                              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                {tokenPath.join(' → ')}
                              </span>
                            )}
                          </div>
                          {/* Token path */}
                          {tokenPath.length > 0 && (
                            <span className="text-[10px] truncate" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                              {tokenPath.map((t: string) => t.replace('token-', '').toUpperCase()).join(' → ')}
                            </span>
                          )}
                        </div>
                        <span className={`text-xs font-bold shrink-0 ${isBest ? 'text-purple-400' : ''}`}
                          style={{ color: isBest ? undefined : 'var(--text-primary)' }}>
                          {quoteVal !== null ? quoteVal.toFixed(4) : '—'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <GaslessToggle
            enabled={state.gaslessMode}
            setEnabled={(val: boolean) => setState(prev => ({ ...prev, gaslessMode: val }))}
            disabled={state.isProcessing}
          />

          {/* Universal Gas Token Selector — hidden when developer sponsors gas */}
          {state.gaslessMode && sponsorshipPolicy !== 'DEVELOPER_SPONSORS' && (
            <div className="mt-8 p-6 rounded-3xl transition-all duration-300 border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-purple-700 dark:text-purple-300">
                    Pay Gas With
                  </span>
                </div>
                
                <div className="flex items-center gap-3 bg-white/5 p-1 rounded-2xl border border-white/10 group/gas-container">
                  <div className="relative" ref={gasDropdownRef}>
                    <button
                      onClick={() => setState(prev => ({ ...prev, isRegistering: !prev.isRegistering }))}
                      className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all hover:shadow-purple-500/20 active:scale-95 whitespace-nowrap"
                    >
                      {state.selectedGasToken?.logoUrl ? (
                         <img 
                           src={state.selectedGasToken.logoUrl} 
                           alt={state.selectedGasToken.symbol} 
                           className="w-4 h-4 rounded-full" 
                           onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                           crossOrigin="anonymous"
                         />
                      ) : (
                         <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[8px]">{state.selectedGasToken?.symbol[0]}</div>
                      )}
                      <span>{state.selectedGasToken?.symbol}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${state.isRegistering ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* Floating Dropdown for Gas Token */}
                    {state.isRegistering && (
                       <div 
                        className="absolute right-0 mt-3 w-64 max-h-64 overflow-y-auto rounded-2xl shadow-2xl z-[9999] border p-2"
                        style={{ 
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-color)'
                        }}
                       >
                         {tokens
                           .filter(t => t.symbol !== 'STX')
                           .filter(t => supportedGasTokens.length === 0 || supportedGasTokens.map(resolveTokenAddress).includes(t.address))
                           .map(t => (
                           <button
                              key={t.symbol}
                              onClick={() => {
                                setState(prev => ({ ...prev, selectedGasToken: t, isRegistering: false }));
                              }}
                              className="w-full flex items-center justify-between p-3 rounded-xl transition-colors"
                              style={{ backgroundColor: t.symbol === state.selectedGasToken?.symbol ? 'var(--bg-primary)' : 'transparent' }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = t.symbol === state.selectedGasToken?.symbol ? 'var(--bg-primary)' : 'transparent'; }}
                           >
                             <div className="flex items-center gap-3">
                                {t.logoUrl ? (
                                  <img 
                                    src={t.logoUrl} 
                                    alt={t.symbol} 
                                    className="w-6 h-6 rounded-full" 
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white">{t.symbol[0]}</div>
                                )}
                                <div className="text-left">
                                   <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{t.symbol}</div>
                                   <div className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Bal: {parseFloat(getBalance(t)).toFixed(2)}</div>
                                </div>
                             </div>
                             {t.symbol === state.selectedGasToken?.symbol && (
                               <div className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                             )}
                           </button>
                         ))}
                       </div>
                    )}
                  </div>
                  
                  <div className="h-6 w-px bg-white/10 mx-1" />
                  
                  <div className="flex flex-col items-end pr-3">
                    <span className="text-[9px] uppercase tracking-widest font-black opacity-50" style={{ color: 'var(--text-secondary)' }}>
                      Gas Fee
                    </span>
                    <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
                      {state.gasFee ? `${state.gasFee} ${state.selectedGasToken?.symbol}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <TransactionStatus error={state.error} success={state.success} />

          {(() => {
            const inputVal = parseFloat(state.inputAmount) || 0;
            const inputBalance = parseFloat(getBalance(state.inputToken));
            const gasFeeVal = parseFloat(state.gasFee) || 0;
            const gasTokenBalance = parseFloat(getBalance(state.selectedGasToken));
            
            let isInsufficient = false;
            let disabledReason = "";

            if (inputVal > inputBalance) {
                isInsufficient = true;
                disabledReason = `Insufficient ${state.inputToken?.symbol} Balance`;
            } else if (state.gaslessMode && gasFeeVal > gasTokenBalance) {
                isInsufficient = true;
                disabledReason = `Insufficient Gas Token (${state.selectedGasToken?.symbol})`;
            } else if (state.gaslessMode && state.inputToken?.address === state.selectedGasToken?.address) {
                if (inputVal + gasFeeVal > inputBalance) {
                    isInsufficient = true;
                    disabledReason = "Insufficient Balance for Swap + Fee";
                }
            }

            return (
              <button
                onClick={handleSwap}
                disabled={!stacksConnected || state.isProcessing || !state.inputAmount || !state.outputAmount || isInsufficient}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-2xl shadow-purple-500/30 dark:shadow-purple-500/50 hover:shadow-purple-500/50 dark:hover:shadow-purple-500/70 hover:scale-[1.02] active:scale-[0.98]"
              >
                {state.isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : !stacksConnected ? (
                  'Connect Wallet'
                ) : isInsufficient ? (
                  disabledReason
                ) : state.gaslessMode && !stacksPublicKey ? (
                  <span onClick={async (e) => {
                    e.preventDefault();
                    await recoverPublicKey();
                  }} className="flex items-center gap-2 cursor-pointer w-full justify-center h-full">
                    Verify Wallet (Enable Gasless)
                  </span>
                ) : (
                  <>
                    <ArrowDownUp className="w-5 h-5" />
                    Swap Tokens
                  </>
                )}
              </button>
            );
          })()}
        </div>

        {/* Info Footer */}
        <div className="mt-6 pt-6 text-xs text-center space-y-1" style={{
          borderTop: `1px solid var(--border-color)`,
          color: 'var(--text-secondary)'
        }}>
          <div className="flex items-center justify-center gap-8 opacity-70">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              AMM Protocol
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              L2 Settlement
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
