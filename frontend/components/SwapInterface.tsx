/**
 * SwapInterface Component
 * UI for swapping tokens on Stacks using our AMM swap contract
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/lib/hooks/useWallet';
import { useConfig, getConfig } from '@/lib/config';
import { ArrowDownUp, Settings, Info, Loader2, AlertTriangle, Wallet, ChevronDown, Zap } from 'lucide-react';
import { formatUnits, parseUnits } from 'viem';
import { getStacksTransactions, getStacksNetwork, getStacksCommon, getStacksConnect, getNetworkInstance } from '@/lib/stacks-loader';
import { encodeStacksAddress, bytesToHex } from '@/lib/utils/address-encoding';
import { getVelumXClient } from '@/lib/velumx';
import { AlexSDK } from 'alex-sdk';
import { TokenInput } from './ui/TokenInput';
import { SettingsPanel } from './ui/SettingsPanel';
import { GaslessToggle } from './ui/GaslessToggle';
import { SwapDetails } from './ui/SwapDetails';
import { TransactionStatus } from './ui/TransactionStatus';

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  assetName?: string; // Explicit asset name for post-conditions
}

interface SwapQuote {
  amountOut: string;
  priceImpact: string;
  fee: string;
  rate: string;
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

// Absolute minimal baseline for boot (STX is universal)
const FALLBACK_STX: Token = {
  symbol: 'STX',
  name: 'Stacks',
  address: 'token-wstx',
  decimals: 6,
  logoUrl: '', // Use letter avatar fallback
};

// High-priority VelumX assets that must be available even if discovery is pending
const VELUMX_PRIORITY_TOKENS: Token[] = [
  {
    symbol: 'USDCx',
    name: 'Circle USDC',
    address: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
    decimals: 6,
    logoUrl: '',
  },
  {
    symbol: 'ALEX',
    name: 'ALEX Token',
    address: 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
    decimals: 8,
    logoUrl: '',
  },
];

export function SwapInterface() {
  const { stacksAddress, stacksConnected, balances, fetchBalances, stacksPublicKey, recoverPublicKey } = useWallet();
  const config = useConfig();

  // ALEX SDK balances: keyed by ALEX Currency ID (e.g. 'age000-governance-token'),
  // values are bigint in 1e8 units. Used as primary source for ALEX-listed tokens.
  const [alexBalances, setAlexBalances] = React.useState<Record<string, bigint>>({});
  // Map from contract principal → ALEX Currency ID, built from fetchSwappableCurrency
  const [alexCurrencyMap, setAlexCurrencyMap] = React.useState<Record<string, string>>({});

  // Fetch ALEX SDK balances whenever the wallet address changes
  const refreshAlexBalances = React.useCallback(async () => {
    if (!stacksAddress) return;
    try {
      const alex = new AlexSDK();
      const bals = await alex.getBalances(stacksAddress) as Record<string, bigint>;
      setAlexBalances(bals);
    } catch (e) {
      console.warn('ALEX SDK getBalances refresh failed:', e);
    }
  }, [stacksAddress]);

  React.useEffect(() => {
    if (!stacksAddress) return;
    let cancelled = false;
    const alex = new AlexSDK();
    (async () => {
      try {
        // Build principal → currencyId map from token list
        const tokenInfos = await alex.fetchSwappableCurrency();
        const principalToId: Record<string, string> = {};
        for (const t of tokenInfos) {
          const principal = (t.wrapToken || t.underlyingToken || '').split('::')[0];
          if (principal) principalToId[principal.toLowerCase()] = (t as any).id;
        }
        if (!cancelled) setAlexCurrencyMap(principalToId);

        // Fetch balances — returns { [Currency]: bigint } in 1e8 units
        const bals = await alex.getBalances(stacksAddress) as Record<string, bigint>;
        if (!cancelled) setAlexBalances(bals);
      } catch (e) {
        console.warn('ALEX SDK getBalances failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [stacksAddress]);

  const getBalance = (token: Token | null): string => {
    if (!token) return '0';

    // STX — ALEX SDK uses Currency.STX = 'token-wstx', value is bigint in 1e8
    if (token.symbol === 'STX' || token.address === 'token-wstx') {
      const alexBal = alexBalances['token-wstx'];
      if (alexBal !== undefined) return (Number(alexBal) / 1e8).toFixed(6);
      return (balances as any).stx || '0';
    }

    // Try ALEX SDK balance first — look up by contract principal → Currency ID
    const currencyId = alexCurrencyMap[token.address.toLowerCase()];
    if (currencyId) {
      const alexBal = alexBalances[currencyId];
      if (alexBal !== undefined) return (Number(alexBal) / 1e8).toFixed(6);
    }

    // Fallback: Hiro API balance (for wallet-only tokens like Pepe, Nothing, etc.)
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

  const [tokens, setTokens] = useState<Token[]>([FALLBACK_STX, ...VELUMX_PRIORITY_TOKENS]);
  const [isDiscovering, setIsDiscovering] = useState(false);
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

  // Fetch developer's supported gas tokens from relayer config
  React.useEffect(() => {
    fetch('/api/velumx/proxy/config', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.sponsorshipPolicy) {
          setSponsorshipPolicy(data.sponsorshipPolicy);
        }
        if (data.supportedGasTokens?.length > 0) {
          setSupportedGasTokens(data.supportedGasTokens);
          // Set default gas token to first supported one if current default isn't in the list
          setState(prev => {
            const currentAddr = prev.selectedGasToken?.address || '';
            const isCurrentSupported = data.supportedGasTokens.includes(currentAddr);
            if (!isCurrentSupported) {
              // Resolve symbol/ID to a real contract principal
              const firstAddr = resolveTokenAddress(data.supportedGasTokens[0]);
              const matchedToken = [FALLBACK_STX, ...VELUMX_PRIORITY_TOKENS].find(
                t => t.address === firstAddr
              ) || { symbol: firstAddr.split('.').pop()?.toUpperCase() || 'Token', name: firstAddr, address: firstAddr, decimals: 6 };
              return { ...prev, selectedGasToken: matchedToken };
            }
            return prev;
          });
        }
      })
      .catch(() => {});
  }, []);
  const [state, setState] = useState<SwapState>({
    inputToken: FALLBACK_STX,
    outputToken: VELUMX_PRIORITY_TOKENS[0], // USDCx
    inputAmount: '',
    outputAmount: '',
    gaslessMode: true,
    selectedGasToken: VELUMX_PRIORITY_TOKENS[0], // USDCx
    isProcessing: false,
    isFetchingQuote: false,
    error: null,
    success: null,
    quote: null,
    gasFee: '0',
    slippage: 0.5,
    showSettings: false,
    isRegistering: false,
  });

  // Dynamic Token Discovery via ALEX SDK
  useEffect(() => {
    let isMounted = true;

    const CACHE_KEY = 'velumx_alex_tokens_v2';
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour

    const mapTokens = (list: any[]): Token[] =>
      list
        .map((t: any) => {
          // wrapToken is the actual Stacks contract principal (e.g. SP...token-alex::token-alex)
          // underlyingToken is the fallback for tokens without a wrap
          const wrapPrincipal = t.wrapToken ? t.wrapToken.split('::')[0] : '';
          const underlyingPrincipal = t.underlyingToken ? t.underlyingToken.split('::')[0] : '';
          const contractAddress = wrapPrincipal || underlyingPrincipal || t.contractAddress || t.address || '';
          // Resolve known ALEX SDK IDs to correct contract principals
          const resolvedAddress = resolveTokenAddress(contractAddress || t.id || '');
          const rawIcon = t.icon || '';
          const logoUrl = rawIcon
            ? `/api/image-proxy?url=${encodeURIComponent(rawIcon)}`
            : '';
          return {
            symbol: t.name || t.symbol || t.id || 'Unknown',
            name: t.name || t.symbol || 'Unknown Token',
            address: resolvedAddress || 'unknown-address',
            decimals: t.wrapTokenDecimals ?? t.underlyingTokenDecimals ?? t.decimals ?? 8,
            logoUrl,
          };
        })
        .filter(t => t.symbol !== 'Unknown' && t.address !== 'unknown-address');

    const applyTokens = (mapped: Token[]) => {
      if (!isMounted) return;
      setTokens(() => {
        const unique = [FALLBACK_STX, ...VELUMX_PRIORITY_TOKENS];
        mapped.forEach(mt => {
          const existingIdx = unique.findIndex(
            ut => ut.symbol.toLowerCase() === mt.symbol.toLowerCase() ||
                  ut.address.toLowerCase() === mt.address.toLowerCase()
          );
          if (existingIdx === -1) {
            unique.push(mt);
          } else if (mt.logoUrl) {
            // SDK version has logo/metadata — update the existing entry
            unique[existingIdx] = { ...unique[existingIdx], logoUrl: mt.logoUrl, name: mt.name };
          }
        });
        console.log(`Swap: ${unique.length} total assets available.`);
        return unique;
      });
    };

    const fetchAlexTokens = async () => {
      try {
        setIsDiscovering(true);

        // Option 1: Check localStorage cache first — show instantly if fresh
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_TTL && data?.length > 0) {
              console.log(`Swap: Loaded ${data.length} tokens from cache instantly`);
              applyTokens(mapTokens(data));
              setIsDiscovering(false);
              // Still refresh in background silently
              const alex = new AlexSDK();
              alex.fetchSwappableCurrency().then(fresh => {
                if (fresh?.length > 0) {
                  localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: fresh }));
                  applyTokens(mapTokens(fresh));
                }
              }).catch(() => {});
              return;
            }
          }
        } catch (e) { /* localStorage unavailable */ }

        // Option 3: Static import already done — no dynamic import delay
        // Just instantiate and fetch
        console.log("Swap: Fetching tokens from ALEX SDK...");
        const alex = new AlexSDK();
        let alexTokensList: any[] = [];

        try {
          const tokenInfos = await alex.fetchSwappableCurrency();
          if (tokenInfos?.length > 0) {
            alexTokensList = tokenInfos;
            // Save to cache
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: tokenInfos }));
            } catch (e) {}
          }
        } catch (innerError) {
          console.error("Swap: fetchSwappableCurrency failed:", innerError);
        }

        // Fallback if SDK fetch failed
        if (alexTokensList.length === 0) {
          alexTokensList = [
            { id: 'age000-governance-token', name: 'ALEX', icon: '' },
            { id: 'token-susdt', name: 'sUSDT', icon: '' },
            { id: 'token-wstx', name: 'wSTX', icon: '' },
            { id: 'token-wbtc', name: 'xBTC', icon: '' },
            { id: 'token-aeusdc', name: 'aeUSDC', icon: '' },
            { id: 'token-ausd', name: 'aUSD', icon: '' },
            { id: 'token-wslm', name: 'wSLM', icon: '' },
            { id: 'token-wnycc', name: 'wNYCC', icon: '' },
            { id: 'token-wmia', name: 'wMIA', icon: '' },
          ];
        }

        applyTokens(mapTokens(alexTokensList));
      } catch (e) {
        console.error("Swap: Discovery Critical Failure", e);
      } finally {
        if (isMounted) setIsDiscovering(false);
      }
    };

    fetchAlexTokens();
    return () => { isMounted = false; };
  }, []);

  // Merge wallet tokens into the token list — adds any token found in the wallet
  // that isn't already in the ALEX SDK list (e.g. Pepe, Nothing, etc.)
  useEffect(() => {
    const allKeys = Object.keys(balances as any);
    const principalKeys = allKeys.filter(k =>
      k.includes('.') && !k.startsWith('decimals:') && !k.startsWith('name:') && !k.startsWith('symbol:')
    );
    if (principalKeys.length === 0) return;

    setTokens(prev => {
      const updated = [...prev];
      let changed = false;
      for (const principal of principalKeys) {
        const alreadyExists = updated.some(t => t.address === principal);
        if (alreadyExists) continue;
        const rawBalance = (balances as any)[principal];
        if (!rawBalance || rawBalance === '0') continue; // skip zero-balance tokens
        const decimals = parseInt((balances as any)[`decimals:${principal}`] || '6');
        // Prefer metadata symbol, then derive a clean symbol from the contract name
        const contractName = principal.split('.')[1] || '';
        const derivedSymbol = contractName
          .replace(/-v\d+[a-z0-9]*$/i, '') // strip version suffix like -v4k68639zxz
          .split('-')[0]
          .toUpperCase();
        const symbol = (balances as any)[`symbol:${principal}`] || derivedSymbol || 'TOKEN';
        const name = (balances as any)[`name:${principal}`] || symbol;
        updated.push({ symbol, name, address: principal, decimals, logoUrl: '' });
        changed = true;
      }
      return changed ? updated : prev;
    });
  }, [balances]);

  const fetchQuote = async () => {
    if (!state.inputToken || !state.outputToken || !state.inputAmount) return;

    setState(prev => ({ ...prev, isFetchingQuote: true, error: null }));

    try {
      const alex = new AlexSDK() as any;

      // ALEX SDK expects amounts in 1e8 units regardless of token decimals
      // Convert: human amount → 1e8 micro units
      const ALEX_DECIMALS = 8;
      const amountInAlex = BigInt(Math.floor(
        parseFloat(state.inputAmount) * Math.pow(10, ALEX_DECIMALS)
      ));

      // ALEX SDK needs its internal currency ID, not the contract address.
      // For STX/wSTX use 'token-wstx'. For others, try to find the matching
      // token from fetchSwappableCurrency by matching the wrapToken contract address.
      const resolveAlexId = async (token: Token): Promise<string> => {
        if (token.symbol === 'STX' || token.address === 'token-wstx') return 'token-wstx';
        
        // Try to get the full token list and find the matching ALEX id
        try {
          const allTokens = await alex.fetchSwappableCurrency();
          const match = allTokens.find((t: any) => {
            const contractAddr = t.wrapToken ? t.wrapToken.split('::')[0] : t.id;
            return contractAddr?.toLowerCase() === token.address?.toLowerCase() ||
                   t.id?.toLowerCase() === token.address?.toLowerCase();
          });
          if (match) return match.id;
        } catch (e) {}
        
        // Fallback: use address directly (works for some tokens)
        return token.address;
      };

      const tokenIn = await resolveAlexId(state.inputToken);
      const tokenOut = await resolveAlexId(state.outputToken);

      console.log(`Swap: Quote request — ${tokenIn} → ${tokenOut}, amount: ${amountInAlex}`);

      const amountOut = await alex.getAmountTo(tokenIn, amountInAlex, tokenOut);

      if (amountOut === undefined || amountOut === null) {
        throw new Error('No liquidity found for this pair on ALEX');
      }

      // ALEX SDK always returns amounts in 1e8 units regardless of token decimals
      // Always divide by 1e8 for display
      const outputAmountFormatted = (Number(amountOut) / Math.pow(10, ALEX_DECIMALS)).toFixed(6);
      // Rate: both in human units
      const inputHuman = parseFloat(state.inputAmount);
      const outputHuman = Number(amountOut) / Math.pow(10, ALEX_DECIMALS);
      const rate = (outputHuman / inputHuman).toFixed(6);

      setState(prev => ({
        ...prev,
        outputAmount: outputAmountFormatted,
        quote: {
          amountOut: outputAmountFormatted,
          priceImpact: '0.30',
          fee: '0.3%',
          rate,
        },
        isFetchingQuote: false,
      }));
    } catch (error) {
      console.error('Failed to fetch quote via ALEX SDK:', error);
      setState(prev => ({
        ...prev,
        error: 'No liquidity pool found for this pair on ALEX.',
        isFetchingQuote: false,
      }));
    }
  };

  // Fetch fee estimate for universal gas mode
  const fetchFeeEstimate = useCallback(async () => {
    if (!state.gaslessMode || !state.selectedGasToken) return;

    try {
      const velumxClient = getVelumXClient();
      const estimate = await velumxClient.estimateFee({
        estimatedGas: 100000,
        feeToken: state.selectedGasToken.address // Pass the Universal Token address
      });

      if (estimate && estimate.maxFee) {
        const fee = estimate.maxFee;
        const tokenAmount = (Number(fee) / Math.pow(10, state.selectedGasToken?.decimals || 6)).toFixed(4);
        setState(prev => ({
          ...prev,
          gasFee: tokenAmount,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch universal fee estimate:', error);
    }
  }, [state.gaslessMode, state.selectedGasToken]);

  // Fetch quote and fee estimate when input changes
  useEffect(() => {
    if (state.inputToken && state.outputToken && state.inputAmount && parseFloat(state.inputAmount) > 0) {
      const timer = setTimeout(() => {
        fetchQuote();
        if (state.gaslessMode) {
          fetchFeeEstimate();
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setState(prev => ({ ...prev, outputAmount: '', quote: null }));
    }
  }, [state.inputToken, state.outputToken, state.inputAmount, state.gaslessMode, fetchFeeEstimate]);




  const switchTokens = () => {
    setState(prev => ({
      ...prev,
      inputToken: prev.outputToken,
      outputToken: prev.inputToken,
      inputAmount: prev.outputAmount,
      outputAmount: prev.inputAmount,
      quote: null,
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
        // Use VelumX SDK for gasless swaps
        const { executeSimpleGaslessSwap } = await import('@/lib/helpers/simple-gasless-swap');
        
        const amountInMicro = parseUnits(state.inputAmount, state.inputToken.decimals).toString();
        const minOutHuman = parseFloat(state.outputAmount) * (1 - state.slippage / 100);
        // ALEX SDK uses 1e8 internally for all tokens — minOut must be in 1e8 units
        const minAmountOutMicro = BigInt(Math.floor(minOutHuman * 1e8)).toString();

        const txid = await executeSimpleGaslessSwap({
          userAddress: stacksAddress,
          userPublicKey: stacksPublicKey || undefined,
          tokenIn: state.inputToken.symbol === 'STX' ? 'token-wstx' : state.inputToken.address,
          tokenOut: state.outputToken.symbol === 'STX' ? 'token-wstx' : state.outputToken.address,
          amountIn: amountInMicro,
          minOut: minAmountOutMicro,
          tokenInDecimals: state.inputToken.decimals,
          feeToken: state.selectedGasToken?.address,
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

        // Poll until balance changes or 15 minutes pass (Stacks blocks ~10 min)
        if (fetchBalances && stacksAddress) {
          const inputToken = state.inputToken;
          const prevInputBalance = getBalance(inputToken);
          const maxAttempts = 60; // 60 × 15s = 15 minutes
          let attempts = 0;

          const poll = async () => {
            attempts++;
            await fetchBalances();
            await refreshAlexBalances();
            const newBalance = getBalance(inputToken);
            if (newBalance !== prevInputBalance) {
              setState(prev => ({
                ...prev,
                success: `Swap confirmed! TX: ${txid}`,
              }));
              return;
            }
            if (attempts < maxAttempts) {
              setTimeout(poll, 15000);
            }
          };

          setTimeout(poll, 10000); // first check after 10s
        }
      } else {
        // Standard non-gasless swap via ALEX SDK
        const alex = new AlexSDK();
        
        const amountInMicro = BigInt(parseUnits(state.inputAmount, state.inputToken.decimals).toString());
        const minAmountOutMicro = BigInt(parseUnits(
          (parseFloat(state.outputAmount) * (1 - state.slippage / 100)).toFixed(6),
          state.outputToken.decimals
        ).toString());

        const tokenIn = (state.inputToken.symbol === 'STX' ? 'token-wstx' : state.inputToken.address) as any;
        const tokenOut = (state.outputToken.symbol === 'STX' ? 'token-wstx' : state.outputToken.address) as any;

        // Perform swap via Alex SDK
        // Note: ALEX SDK handles connect/wallet interaction internally or provides the tx hex
        // We'll use the connect integration for the best UX
        const { getStacksConnect } = await import('@/lib/stacks-loader');
        const connect = await getStacksConnect();

        // This is a simplified version of ALEX integration
        // In a real app, we might use alex.getSwapTransaction or similar
        // For now, we manually build the ALEX call to ensure compatibility with our loader
        const transactions = await import('@stacks/transactions');
        const { Cl, Pc } = transactions;
        
        // ALEX swaps often use multi-hops. The SDK's 'getRouter' provides the path.
        const router = await alex.getRouter(tokenIn, tokenOut);
        
        // Map ALEX router to contract calls
        // For simplicity, we use the direct vault call if possible
        const [contractAddress, contractName] = config.stacksSwapContractAddress.split('.');

        await connect.openContractCall({
          contractAddress,
          contractName,
          functionName: 'swap-helper', // Typical ALEX swap helper
          functionArgs: [
            Cl.principal(tokenIn),
            Cl.principal(tokenOut),
            Cl.uint(amountInMicro.toString()),
            Cl.uint(minAmountOutMicro.toString())
          ],
          network: 'mainnet',
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
          {tokens.length <= 1 && (
             <button 
                onClick={() => setTokens([FALLBACK_STX, ...VELUMX_PRIORITY_TOKENS])}
                className="text-[10px] font-bold text-purple-500 hover:underline ml-2"
             >
               Force Sync
             </button>
          )}
        </div>

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
            setToken={(t) => setState(prev => ({ ...prev, inputToken: t }))}
            tokens={tokens}
            balance={getBalance(state.inputToken)}
            isProcessing={state.isProcessing}
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
            setToken={(t) => setState(prev => ({ ...prev, outputToken: t }))}
            tokens={tokens}
            balance={getBalance(state.outputToken)}
            isProcessing={state.isProcessing}
            variant="blue"
            getTokenBalance={getBalance}
          />
        </div>

        <div className="mt-6">
          <SwapDetails
            quote={state.quote}
            inputSymbol={state.inputToken?.symbol || ''}
            outputSymbol={state.outputToken?.symbol || ''}
            outputAmount={state.outputAmount}
            slippage={state.slippage}
          />

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
                    <span className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400">
                      {state.gasFee} {state.selectedGasToken?.symbol}
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
