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
import { type QuoteResult } from '@bitflowlabs/core-sdk';
import { getBitflowSDK } from '@/lib/bitflow';
import { getParallelQuote, getRoutableTokenIds } from '@/lib/helpers/bitflow-parallel-quote';
import { getAlexQuote } from '@/lib/helpers/alex-swap';
import { isAlexPair } from '@/lib/alex';
import { useTokenStore } from '@/lib/hooks/useTokenStore';
import { TokenInput } from './ui/TokenInput';
import { SettingsPanel } from './ui/SettingsPanel';
import { GaslessToggle } from './ui/GaslessToggle';
import { TransactionStatus } from './ui/TransactionStatus';

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
  selectedGasToken: Token | null;
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
  /** ALEX quote when ALEX wins the best-route race; null when Bitflow wins */
  alexQuote: import('@/lib/helpers/alex-swap').AlexQuoteResult | null;
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
    alexQuote: null,
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

  // ── Routable output tokens ────────────────────────────────────────────────
  // Set of tokenIds reachable from the current input token — used to filter
  // ── Routable output tokens ────────────────────────────────────────────────
  // Union of Bitflow routes AND ALEX-supported tokens reachable from the
  // current input token. Updated whenever the input token changes.
  const [routableTokenIds, setRoutableTokenIds] = React.useState<Set<string>>(new Set());

  useEffect(() => {
    if (!state.inputToken) return;
    const getTokenId = (token: Token) =>
      token.tokenId || tokens.find(t => t.address.toLowerCase() === token.address.toLowerCase())?.tokenId || token.address;
    const tokenInId = getTokenId(state.inputToken);

    // Helper: merge a new set into the current routable set
    const merge = (extra: Set<string>) =>
      setRoutableTokenIds(prev => {
        if (extra.size === 0) return prev;
        const merged = new Set([...prev, ...extra]);
        return merged.size === prev.size ? prev : merged;
      });

    // 1. Bitflow — sync from cache immediately, then poll for completion
    const cached = getRoutableTokenIds(tokenInId);
    if (cached.size > 0) setRoutableTokenIds(cached);

    let cancelled = false;
    const poll = setInterval(() => {
      const fresh = getRoutableTokenIds(tokenInId);
      if (fresh.size > 0 && !cancelled) {
        setRoutableTokenIds(fresh);
        clearInterval(poll);
      }
    }, 500);
    const timeout = setTimeout(() => clearInterval(poll), 30_000);

    // 2. ALEX — fetch supported tokens async and add them to the set
    // We map each ALEX token back to the tokenId used in the Bitflow token store
    // so the dropdown filter works correctly.
    const alexInputAddress = state.inputToken.address;
    import('alex-sdk').then(({ AlexSDK }) => {
      if (cancelled) return;
      const alex = new AlexSDK();
      alex.fetchSwappableCurrency().then((alexTokens) => {
        if (cancelled) return;
        // Find the ALEX ID for the input token
        const inputAlexId = alexTokens.find((t: any) => {
          const stripAsset = (s: string) => s?.split('::')[0] ?? '';
          const wrapContract       = stripAsset(t.wrapToken ?? '');
          const underlyingContract = stripAsset(t.underlyingToken ?? '');
          const addrLower = alexInputAddress?.toLowerCase();
          return (
            wrapContract.toLowerCase()       === addrLower ||
            underlyingContract.toLowerCase() === addrLower ||
            t.id?.toLowerCase()              === addrLower ||
            (alexInputAddress === 'STX' && t.id === 'token-wstx')
          );
        })?.id;

        if (!inputAlexId) return; // input token not on ALEX

        // Get all tokens reachable from this input on ALEX
        alex.getAllPossibleRoutes(inputAlexId as any, '' as any)
          .catch(() => alexTokens) // fallback: all ALEX tokens are potentially reachable
          .then(() => {
            // Add all ALEX token IDs to the routable set, mapped to the
            // tokenId/address used in the Bitflow token store
            const alexIds = new Set<string>();
            for (const alexTok of alexTokens) {
              // Skip the input token itself
              if (alexTok.id === inputAlexId) continue;
              // Find the matching token in our store by wrapToken contract address
              const contractAddr = (alexTok as any).wrapToken
                ? (alexTok as any).wrapToken.split('::')[0]
                : '';
              const storeToken = tokens.find(t => {
                const stripAsset = (s: string) => s?.split('::')[0] ?? '';
                const wrapContract       = stripAsset((alexTok as any).wrapToken ?? '');
                const underlyingContract = stripAsset((alexTok as any).underlyingToken ?? '');
                return (
                  t.address?.toLowerCase() === wrapContract.toLowerCase() ||
                  t.address?.toLowerCase() === underlyingContract.toLowerCase() ||
                  t.tokenId === alexTok.id
                );
              });
              if (storeToken) {
                // Add both the tokenId and address so the filter catches it
                if (storeToken.tokenId) alexIds.add(storeToken.tokenId);
                if (storeToken.address) alexIds.add(storeToken.address);
              } else {
                // Token not in Bitflow store — add the ALEX ID directly
                // so it shows up if the token store later includes it
                alexIds.add(alexTok.id);
              }
            }
            if (!cancelled) merge(alexIds);
          });
      }).catch(() => {}); // ALEX fetch failure is non-fatal
    }).catch(() => {});

    return () => { cancelled = true; clearInterval(poll); clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.inputToken, tokens]);

  /**
   * Fetch the best swap quote by running Bitflow and ALEX in parallel.
   * Whichever gives a higher output amount wins — no user toggle needed.
   * ALEX is only attempted when the token pair is supported by ALEX.
   */
  const fetchQuote = useCallback(async (retryCount = 0) => {
    if (!state.inputToken || !state.outputToken || !state.inputAmount) return;

    const generation = ++quoteGenRef.current;
    setState(prev => ({ ...prev, isFetchingQuote: true, error: null }));

    try {
      const getTokenId = (token: Token) => {
        if (token.tokenId) return token.tokenId;
        const match = tokens.find(t => t.address.toLowerCase() === token.address.toLowerCase());
        return match?.tokenId || token.address;
      };

      const tokenInId  = getTokenId(state.inputToken);
      const tokenOutId = getTokenId(state.outputToken);
      const amountIn   = parseFloat(state.inputAmount);

      // Run both quotes in parallel — ALEX only if the pair is not known-unsupported
      const alexSupported = isAlexPair(state.inputToken.address, state.outputToken.address);

      const [bitflowResult, alexResult] = await Promise.all([
        getParallelQuote(tokenInId, tokenOutId, amountIn).catch(() => null),
        alexSupported && stacksAddress
          ? getAlexQuote(
              state.inputToken.address,
              state.outputToken.address,
              amountIn,
              state.inputToken.decimals,
              state.outputToken.decimals,
              stacksAddress,
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (generation !== quoteGenRef.current) return; // stale — newer request fired

      const bitflowBest = bitflowResult?.bestRoute?.quote ?? 0;
      const alexBest    = alexResult?.amountOut ?? 0;

      // Pick the winner
      const alexWins = alexBest > 0 && alexBest > bitflowBest;

      if (alexWins && alexResult) {
        // ALEX gives a better rate
        const outputAmount = alexResult.amountOut.toFixed(6);
        setState(prev => ({
          ...prev,
          outputAmount,
          alexQuote: alexResult,
          quote: {
            amountOut: outputAmount,
            priceImpact: '—',
            fee: '0.3%',
            rate: (alexResult.amountOut / amountIn).toFixed(6),
            bestRoute: null,   // signals "ALEX won" to handleSwap
            allRoutes: [],
          },
          isFetchingQuote: false,
        }));
      } else if (bitflowBest > 0 && bitflowResult?.bestRoute) {
        // Bitflow wins (or ALEX not supported / no result)
        const bestRoute = bitflowResult.bestRoute;
        const outputAmount = bestRoute.quote!.toFixed(6);
        setState(prev => ({
          ...prev,
          outputAmount,
          alexQuote: null,
          quote: {
            amountOut: outputAmount,
            priceImpact: '0.30',
            fee: '0.3%',
            rate: (bestRoute.quote! / amountIn).toFixed(6),
            bestRoute,
            allRoutes: bitflowResult.allRoutes?.filter(r => r.quote !== null) || [],
          },
          isFetchingQuote: false,
        }));
      } else {
        throw new Error(
          `No liquidity found for ${state.inputToken.symbol} → ${state.outputToken.symbol}.`
        );
      }
    } catch (error: any) {
      if (generation !== quoteGenRef.current) return;
      if (retryCount < 1) {
        console.warn('[Swap] Quote failed, retrying...', error?.message);
        return fetchQuote(retryCount + 1);
      }
      setState(prev => ({
        ...prev,
        error: error?.message?.includes('timed out')
          ? 'Quote request timed out. Please try again.'
          : (error?.message || 'No liquidity pool found for this pair.'),
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
      setState(prev => ({ ...prev, outputAmount: '', quote: null, alexQuote: null }));
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

      // ── Determine which DEX to execute on ──────────────────────────────────
      // If the active quote came from ALEX (alexQuote is set and bestRoute is null),
      // use the ALEX paymaster. Otherwise use the existing Bitflow path.
      const useAlex = !!state.alexQuote && !state.quote?.bestRoute;

      if (useAlex) {
        // ── ALEX gasless swap via simple-paymaster-v3 ─────────────────────────
        const { executeAlexGaslessSwap } = await import('@/lib/helpers/alex-swap');

        const txid = await executeAlexGaslessSwap({
          userAddress: stacksAddress,
          tokenInAddress: state.inputToken.address,
          tokenOutAddress: state.outputToken.address,
          amountIn: parseFloat(state.inputAmount),
          tokenInDecimals: state.inputToken.decimals,
          tokenOutDecimals: state.outputToken.decimals,
          feeToken: state.selectedGasToken?.address || '',
          slippage: state.slippage / 100,
          quote: state.alexQuote ?? undefined,
          feeEstimate: state.feeEstimate,
          onProgress: (step) => setState(prev => ({ ...prev, success: step })),
        });

        setState(prev => ({
          ...prev,
          isProcessing: false,
          success: `ALEX swap submitted! TX: ${txid}. Waiting for confirmation...`,
          inputAmount: '',
          outputAmount: '',
          quote: null,
          alexQuote: null,
        }));

        if (fetchBalances && stacksAddress) {
          const inputToken = state.inputToken;
          const prevBal = getBalance(inputToken);
          let attempts = 0;
          const poll = async () => {
            attempts++;
            await fetchBalances();
            if (getBalance(inputToken) !== prevBal) {
              setState(prev => ({ ...prev, success: `ALEX swap confirmed! TX: ${txid}` }));
              return;
            }
            if (attempts < 60) setTimeout(poll, 15000);
          };
          setTimeout(poll, 10000);
        }
        return;
      }

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

        const { request: stacksRequest } = await import('@stacks/connect');
        const result = await stacksRequest('stx_callContract', {
          contract: `${swapParams.contractAddress}.${swapParams.contractName}`,
          functionName: swapParams.functionName,
          functionArgs: swapParams.functionArgs,
          network: 'mainnet',
          postConditionMode: 'allow',
          postConditions: [],
        });

        const txid = (result as any).txid;
        setState(prev => ({
          ...prev,
          isProcessing: false,
          success: `Swap submitted! TX: ${txid}. Waiting for confirmation...`,
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
              setState(prev => ({ ...prev, success: `Swap confirmed! TX: ${txid}` }));
              return;
            }
            if (attempts < maxAttempts) setTimeout(poll, 15000);
          };
          setTimeout(poll, 10000);
        }
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
            Swap
          </h2>
          <button
            onClick={() => setState(prev => ({ ...prev, showSettings: !prev.showSettings }))}
            className="p-2 rounded-xl transition-all"
            style={{
              backgroundColor: state.showSettings ? 'rgba(37,99,235,0.1)' : 'transparent',
              border: `1px solid ${state.showSettings ? 'rgba(37,99,235,0.3)' : 'var(--border-color)'}`,
              color: state.showSettings ? '#2563EB' : 'var(--text-secondary)',
            }}
          >
            <Settings className={`w-5 h-5 ${state.showSettings ? 'animate-spin-slow' : ''}`} />
          </button>
        </div>

        {/* Token Discovery Label */}
        <div className="flex items-center gap-2 mb-6 px-1">
          <div className={`w-1.5 h-1.5 rounded-full ${isDiscovering ? 'bg-yellow-500 animate-pulse' : 'bg-blue-500'}`} />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
            {isDiscovering ? 'Discovering Liquidity...' : `${tokens.length} Assets Available`}
          </span>
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
            setToken={(t) => setState(prev => ({ ...prev, inputToken: t, outputAmount: '', quote: null, success: null, error: null }))}
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
              className="rounded-full p-2.5 transition-all disabled:opacity-50 hover:scale-110 active:scale-95"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: `1px solid var(--border-color)`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
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
            setToken={(t) => setState(prev => ({ ...prev, outputToken: t, outputAmount: '', quote: null, success: null, error: null }))}
            tokens={routableTokenIds.size > 0
              ? tokens.filter(t => {
                  const id = t.tokenId || t.address;
                  return routableTokenIds.has(id);
                })
              : tokens}
            balance={getBalance(state.outputToken)}
            isProcessing={state.isProcessing}
            isLoadingTokens={isDiscovering || (routableTokenIds.size === 0 && !!state.inputToken)}
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
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0"
                              style={{ backgroundColor: 'rgba(37,99,235,0.12)', color: '#2563EB' }}>
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
                        <span className="text-xs font-bold shrink-0"
                          style={{ color: isBest ? '#2563EB' : 'var(--text-primary)' }}>
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
            <div className="mt-4 p-4 rounded-2xl transition-all duration-300" style={{
              border: '1px solid rgba(37,99,235,0.2)',
              backgroundColor: 'rgba(37,99,235,0.04)',
            }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" style={{ color: '#2563EB' }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#2563EB' }}>
                    Pay Gas With
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative" ref={gasDropdownRef}>
                    <button
                      onClick={() => setState(prev => ({ ...prev, isRegistering: !prev.isRegistering }))}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs transition-all hover:opacity-80 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                        color: 'white',
                        boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                      }}
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
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}>{t.symbol[0]}</div>
                                )}
                                <div className="text-left">
                                   <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{t.symbol}</div>
                                   <div className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Bal: {parseFloat(getBalance(t)).toFixed(2)}</div>
                                </div>
                             </div>
                             {t.symbol === state.selectedGasToken?.symbol && (
                               <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#2563EB' }} />
                             )}
                           </button>
                         ))}
                       </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Fee</div>
                    <div className="text-xs font-mono font-bold" style={{ color: '#2563EB' }}>
                      {state.gasFee ? `${state.gasFee} ${state.selectedGasToken?.symbol}` : '—'}
                    </div>
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
                className="w-full mt-5 font-bold py-4 rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                color: 'white',
                boxShadow: '0 8px 24px rgba(37,99,235,0.35)',
              }}
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

        {/* Footer */}
        <div className="mt-6 pt-5 flex items-center justify-center gap-6 text-[10px] font-semibold uppercase tracking-widest"
          style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-secondary)', opacity: 0.6 }}>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            AMM Protocol
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            L2 Settlement
          </span>
        </div>
      </div>
    </div>
  );
}
