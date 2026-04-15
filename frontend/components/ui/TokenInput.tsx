import { ChevronDown, Loader2, Search } from 'lucide-react';
import React from 'react';

interface Token {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    logoUrl?: string;
    assetName?: string;
}

interface TokenInputProps {
    label: string;
    amount: string;
    setAmount: (val: string) => void;
    token: Token | null;
    setToken: (token: Token) => void;
    tokens: Token[];
    balance: string;
    isProcessing: boolean;
    onMax?: () => void;
    variant?: 'purple' | 'blue';
    getTokenBalance?: (token: Token) => string;
}

export function TokenInput({
    label,
    amount,
    setAmount,
    token,
    setToken,
    tokens,
    balance,
    isProcessing,
    onMax,
    variant = 'purple',
    getTokenBalance,
}: TokenInputProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [imageErrors, setImageErrors] = React.useState<Set<string>>(new Set());
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    const gradientClass = variant === 'purple'
        ? 'bg-purple-600 shadow-purple-500/50'
        : 'bg-blue-600 shadow-blue-500/50';

    const filteredTokens = (tokens || []).filter(t =>
        (t.symbol?.toLowerCase() || '').includes(search.toLowerCase()) ||
        (t.name?.toLowerCase() || '').includes(search.toLowerCase())
    );

    const handleImageError = (tokenAddress: string) => {
        setImageErrors(prev => new Set(prev).add(tokenAddress));
    };

    const shouldShowImage = (t: Token | null) => {
        return t?.logoUrl && !imageErrors.has(t.address);
    };

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="group rounded-2xl p-6 transition-all duration-300"
            style={{ border: `1px solid var(--border-color)`, backgroundColor: 'var(--bg-surface)' }}
        >
            <div className="flex items-center justify-between mb-6">
                <span className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{label}</span>
                <div className="flex items-center gap-2">
                    {tokens.length <= 4 && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20">
                            <Loader2 className="w-2.5 h-2.5 text-purple-500 animate-spin" />
                            <span className="text-[8px] font-black uppercase tracking-tighter text-purple-600 dark:text-purple-400">Discovering...</span>
                        </div>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Balance: <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-4xl font-mono outline-none placeholder:opacity-30 min-w-0"
                    style={{ color: 'var(--text-primary)' }}
                    disabled={isProcessing}
                />

                {/* Token Selector */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => !isProcessing && setIsOpen(!isOpen)}
                        className={`flex items-center gap-2 ${gradientClass} text-white px-4 py-2.5 rounded-xl font-bold shadow-lg transition-transform active:scale-95 whitespace-nowrap`}
                        disabled={isProcessing}
                    >
                        {shouldShowImage(token) ? (
                            <img src={token!.logoUrl} alt={token!.symbol} className="w-5 h-5 rounded-full"
                                onError={() => handleImageError(token!.address)} crossOrigin="anonymous" />
                        ) : (
                            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                                {token?.symbol?.[0]}
                            </div>
                        )}
                        <span>{token?.symbol || 'Select'}</span>
                        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown */}
                    {isOpen && (
                        <>
                            {/* Click-outside backdrop */}
                            <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />

                            {/* Panel */}
                            <div
                                className="absolute right-0 mt-2 w-72 rounded-2xl shadow-2xl z-[9999] flex flex-col overflow-hidden"
                                style={{
                                    border: '1.5px solid var(--border-color)',
                                    backgroundColor: 'var(--bg-surface)',
                                }}
                            >
                                {/* Search */}
                                <div className="p-3" style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search tokens..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className="w-full rounded-xl py-2 pl-9 pr-3 text-sm outline-none font-medium"
                                            style={{
                                                backgroundColor: 'var(--bg-primary)',
                                                color: 'var(--text-primary)',
                                                border: '1px solid var(--border-color)',
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* List */}
                                <div className="overflow-y-auto max-h-64" style={{ backgroundColor: 'var(--bg-surface)' }}>
                                    {filteredTokens.length > 0 ? filteredTokens.map(t => {
                                        const tokenBal = getTokenBalance ? getTokenBalance(t) : '0';
                                        const hasBalance = parseFloat(tokenBal) > 0;
                                        return (
                                        <button
                                            key={t.address + t.symbol}
                                            onClick={() => { setToken(t); setIsOpen(false); setSearch(''); }}
                                            className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                                            style={{ backgroundColor: t.symbol === token?.symbol ? 'var(--bg-primary)' : 'var(--bg-surface)' }}
                                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = t.symbol === token?.symbol ? 'var(--bg-primary)' : 'var(--bg-surface)'; }}
                                        >
                                            <div className="flex items-center gap-3">
                                                {shouldShowImage(t) ? (
                                                    <img src={t.logoUrl} alt={t.symbol} className="w-8 h-8 rounded-full"
                                                        onError={() => handleImageError(t.address)} crossOrigin="anonymous" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white uppercase">
                                                        {t.symbol[0]}
                                                    </div>
                                                )}
                                                <div className="text-left">
                                                    <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{t.symbol}</div>
                                                    <div className="text-[10px] truncate max-w-[140px]" style={{ color: 'var(--text-secondary)' }}>{t.name}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {getTokenBalance && (
                                                    <span className={`text-xs font-mono font-semibold ${hasBalance ? '' : 'opacity-30'}`} style={{ color: 'var(--text-primary)' }}>
                                                        {hasBalance ? parseFloat(tokenBal).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0'}
                                                    </span>
                                                )}
                                                {t.symbol === token?.symbol && (
                                                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                                                )}
                                            </div>
                                        </button>
                                        );
                                    }) : (
                                        <div className="p-8 text-center text-sm italic" style={{ color: 'var(--text-secondary)' }}>No tokens found</div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {onMax && (
                <div className="flex justify-between items-center mt-6">
                    <button
                        onClick={onMax}
                        className={`text-[10px] font-black tracking-widest uppercase px-3 py-1.5 rounded-lg transition-all border ${variant === 'purple'
                            ? 'border-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10'
                            : 'border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10'
                            }`}
                        disabled={isProcessing}
                    >
                        MAX
                    </button>
                    {amount && parseFloat(amount) > 0 && token && (
                        <span className="text-[10px] font-bold opacity-40" style={{ color: 'var(--text-secondary)' }}>
                            ≈ ${(parseFloat(amount) * 1.5).toFixed(2)} USD
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
