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
import { BitflowSDK, type QuoteResult } from '@bitflowlabs/core-sdk';
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
  assetName?: string;
  tokenId?: string; // Added for Bitflow
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
    if (token.symbol === 'STX' || token.address === 'token-wstx') {
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

  // Dynamic Token Discovery via Bitflow SDK
  useEffect(() => {
    let isMounted = true;

    const CACHE_KEY = 'velumx_bitflow_tokens_v1';
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour

    const mapTokens = (list: any[]): Token[] =>
      list
        .map((t: any) => {
          const contractAddress = t.tokenContract || '';
          const rawIcon = t.logoUrl || '';
          const logoUrl = rawIcon
            ? `/api/image-proxy?url=${encodeURIComponent(rawIcon)}`
            : '';
          return {
            symbol: t.symbol || 'Unknown',
            name: t.name || t.symbol || 'Unknown Token',
            address: contractAddress,
            decimals: t.tokenDecimals || 6,
            logoUrl,
            tokenId: t.tokenId,
          };
        })
        .filter(t => t.symbol !== 'Unknown' && t.address && t.address.includes('.'));

    const applyTokens = (mapped: Token[]) => {
      if (!isMounted) return;
      setTokens(() => {
        const unique = [FALLBACK_STX, ...VELUMX_PRIORITY_TOKENS];
        mapped.forEach(mt => {
          const existingIdx = unique.findIndex(
            ut => ut.address.toLowerCase() === mt.address.toLowerCase()
          );
          if (existingIdx === -1) {
            unique.push(mt);
          } else if (mt.logoUrl || mt.tokenId) {
            unique[existingIdx] = { ...unique[existingIdx], ...mt };
          }
        });
        return unique;
      });
    };

    const fetchBitflowTokens = async () => {
      try {
        setIsDiscovering(true);
        const bitflow = new BitflowSDK();
        const bitflowTokens = await bitflow.getAvailableTokens();
        
        if (bitflowTokens?.length > 0) {
          applyTokens(mapTokens(bitflowTokens));
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: bitflowTokens }));
          } catch (e) {}
        }
      } catch (e) {
        console.error("Swap: Discovery Critical Failure", e);
      } finally {
        if (isMounted) setIsDiscovering(false);
      }
    };

    fetchBitflowTokens();
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
      const bitflow = new BitflowSDK();
      
      const tokenInId = state.inputToken.tokenId || state.inputToken.address;
      const tokenOutId = state.outputToken.tokenId || state.outputToken.address;
      const amountIn = parseFloat(state.inputAmount);

      console.log(`Swap: Bitflow Quote request — ${tokenInId} → ${tokenOutId}, amount: ${amountIn}`);

      const quoteResult: QuoteResult = await bitflow.getQuoteForRoute(tokenInId, tokenOutId, amountIn);
      const bestRoute = quoteResult.bestRoute;

      if (!bestRoute || !bestRoute.quote) {
        throw new Error('No liquidity found for this pair on Bitflow');
      }

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
        },
        isFetchingQuote: false,
      }));
    } catch (error) {
      console.error('Failed to fetch quote via Bitflow SDK:', error);
      setState(prev => ({
        ...prev,
        error: 'No liquidity pool found for this pair on Bitflow.',
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
        // Use VelumX SDK for gasless swaps via Bitflow
        const { executeBitflowGaslessSwap } = await import('@/lib/helpers/bitflow-gasless-swap');
        
        const txid = await executeBitflowGaslessSwap({
          userAddress: stacksAddress,
          userPublicKey: stacksPublicKey || undefined,
          tokenIn: state.inputToken.address,
          tokenInId: state.inputToken.tokenId || state.inputToken.address,
          tokenOut: state.outputToken.address,
          tokenOutId: state.outputToken.tokenId || state.outputToken.address,
          amountIn: state.inputAmount,
          feeToken: state.selectedGasToken?.address || '',
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
      } else {
        // Standard non-gasless swap via Bitflow SDK
        const bitflow = new BitflowSDK();
        
        const tokenInId = state.inputToken.tokenId || state.inputToken.address;
        const tokenOutId = state.outputToken.tokenId || state.outputToken.address;
        const amountIn = parseFloat(state.inputAmount);

        const quoteResult: QuoteResult = await bitflow.getQuoteForRoute(tokenInId, tokenOutId, amountIn);
        const bestRoute = quoteResult.bestRoute;
        if (!bestRoute) throw new Error('No swap route found on Bitflow');

        const swapParams = await bitflow.getSwapParams({
          route: bestRoute as any,
          amount: amountIn,
          tokenXDecimals: state.inputToken.decimals,
          tokenYDecimals: state.outputToken.decimals,
        }, stacksAddress, state.slippage / 100);

        const { getStacksConnect } = await import('@/lib/stacks-loader');
        const connect = await getStacksConnect();

        await connect.openContractCall({
          contractAddress: swapParams.contractAddress,
          contractName: swapParams.contractName,
          functionName: swapParams.functionName,
          functionArgs: swapParams.functionArgs,
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
