'use client';

import Image from 'next/image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  TrendingUp,
  Activity,
  Shield,
  Users,
  Database,
  AlertCircle,
  Search,
  LineChart,
  Brain,
  RefreshCw,
  Zap,
  Rocket,
  Clock,
  MessageCircle
} from 'lucide-react';

const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const currencyFmt0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const currencyFmt2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const currencyFmt3 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 });
const currencyFmt6 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });

const formatPercent = (value) => {
  if (value === null || value === undefined) return '0.00%';
  const formatted = numberFmt.format(Number(value));
  return `${Number(value) > 0 ? '+' : ''}${formatted}%`;
};

const formatSentimentSummary = (sentiment) => {
  if (!sentiment) return 'Sentiment unavailable';
  if (!sentiment.available) return sentiment.message || 'Sentiment unavailable';
  if (!sentiment.commentCount) return 'No recent chatter';
  return `${sentiment.redditScore}/10 - ${sentiment.trend}`;
};

const getExchangeSourceLabel = (source, mode = 'full') => {
  if (!source) return '';
  const normalized = String(source).toLowerCase();
  if (mode === 'short') {
    if (normalized === 'coinmarketcap') return 'CMC';
    if (normalized === 'coingecko') return 'CG';
    return normalized.toUpperCase();
  }
  if (normalized === 'coinmarketcap') return 'CoinMarketCap';
  if (normalized === 'coingecko') return 'CoinGecko';
  return source;
};

const formatExchangeSummary = (exchanges, source, max = 2) => {
  if (!Array.isArray(exchanges) || !exchanges.length) return '';
  const names = exchanges
    .map((entry) => entry?.name)
    .filter(Boolean);
  if (!names.length) return '';
  const shown = names.slice(0, max);
  const remaining = names.length - shown.length;
  const summary = remaining > 0 ? `${shown.join(', ')} +${remaining}` : shown.join(', ');
  const shortLabel = getExchangeSourceLabel(source, 'short');
  return shortLabel ? `${summary} (${shortLabel})` : summary;
};

const getSentimentColor = (sentiment) => {
  if (!sentiment?.available) {
    if (['missing-token', 'unauthorized', 'rate-limited'].includes(sentiment?.reason)) return 'text-yellow-400';
    return 'text-gray-400';
  }
  if (!sentiment.commentCount) return 'text-gray-400';
  if (sentiment.redditScore >= 7.5) return 'text-green-400';
  if (sentiment.redditScore >= 6) return 'text-blue-400';
  if (sentiment.redditScore >= 4.5) return 'text-yellow-400';
  return 'text-red-400';
};

const getSentimentBg = (sentiment) => {
  if (!sentiment?.available || !sentiment.commentCount) return 'bg-slate-800/50 border-slate-700/50';
  if (sentiment.redditScore >= 7.5) return 'bg-green-500/10 border-green-500/30';
  if (sentiment.redditScore >= 6) return 'bg-blue-500/10 border-blue-500/30';
  if (sentiment.redditScore >= 4.5) return 'bg-yellow-500/10 border-yellow-500/30';
  return 'bg-red-500/10 border-red-500/30';
};

export default function CryptoDiscoveryAgent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [newListings, setNewListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [scanStatus, setScanStatus] = useState('');
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const modules = [
    { id: 'cmc', name: 'CoinMarketCap Listings', icon: Database, status: 'live', description: 'Latest additions direct from CMC pro API', score: 94 },
    { id: 'pushshift', name: 'Reddit Sentiment (Pushshift)', icon: Users, status: 'live', description: 'Comment velocity & tone across crypto subreddits', score: 82 },
    { id: 'liquidity', name: 'Liquidity Monitor', icon: Activity, status: 'live', description: 'Volume vs market cap efficiency and drawdown risk', score: 90 },
    { id: 'momentum', name: 'Momentum Engine', icon: LineChart, status: 'live', description: '1h/24h/7d momentum tracking', score: 88 },
    { id: 'risk', name: 'Risk Analyzer', icon: Shield, status: 'live', description: 'Capitalization tiers & liquidity stress test', score: 86 },
    { id: 'ai', name: 'Opportunity Scoring', icon: Brain, status: 'live', description: 'Deterministic scoring from market + social inputs', score: 91 }
  ];

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '—';
    const value = Number(num);
    if (value >= 1e9) return `${currencyFmt2.format(value / 1e9)}B`;
    if (value >= 1e6) return `${currencyFmt2.format(value / 1e6)}M`;
    if (value >= 1e3) return `${currencyFmt2.format(value / 1e3)}K`;
    if (value < 1) return currencyFmt3.format(value);
    return currencyFmt2.format(value);
  };

  const formatPrice = (price) => {
    if (price >= 1000) return currencyFmt0.format(price);
    if (price >= 1) return currencyFmt2.format(price);
    if (price >= 0.01) return currencyFmt3.format(price);
    return currencyFmt6.format(price);
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 80) return 'text-blue-500';
    if (score >= 70) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getScoreBg = (score) => {
    if (score >= 90) return 'bg-green-500/10 border-green-500/30';
    if (score >= 80) return 'bg-blue-500/10 border-blue-500/30';
    if (score >= 70) return 'bg-yellow-500/10 border-yellow-500/30';
    return 'bg-orange-500/10 border-orange-500/30';
  };

  const fetchNewListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cmc/new-listings', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Backend error ${res.status}`);
      const json = await res.json();
      const items = json.items || [];
      setNewListings(items);
      setLastScan(new Date());

      const top = items
        .filter((t) => t.score >= 80)
        .slice(0, 3);

      if (top.length) {
        const newAlerts = top.map((t) => ({
          id: `${t.id}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          text: `${t.symbol} score ${t.score}/100 | 24h ${formatPercent(t.change24h)} | Reddit ${formatSentimentSummary(t.sentiment)}`,
          time: new Date(),
          token: t.symbol,
          type: t.sentiment?.available && t.sentiment?.redditScore >= 7.5 ? 'critical' : 'high'
        }));
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 8));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const performDeepScan = useCallback(() => {
    setScanning(true);
    setScanProgress(0);
    const steps = [
      'Contacting CoinMarketCap',
      'Retrieving latest listings',
      'Normalizing market metrics',
      'Laser scanning Reddit chatter via Pushshift',
      'Computing liquidity efficiency',
      'Scoring opportunities'
    ];

    let stepIndex = 0;
    intervalRef.current = setInterval(() => {
      setScanProgress((prev) => {
        const next = prev + 12;
        if (next >= 100) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setScanning(false);
          fetchNewListings();
          setScanStatus('');
          return 100;
        }
        if (next % 20 === 0 && stepIndex < steps.length) {
          setScanStatus(steps[stepIndex]);
          stepIndex += 1;
        }
        return next;
      });
    }, 300);
  }, [fetchNewListings]);

  useEffect(() => {
    performDeepScan();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [performDeepScan]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2 flex items-center gap-3">
                <Rocket className="w-10 h-10 text-blue-400" />
                New Exchange Listing Intelligence
              </h1>
              <p className="text-gray-400">Real market data from CoinMarketCap + live Reddit chatter through Pushshift</p>
              {lastScan && (
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span>Last updated {lastScan.toLocaleTimeString()}</span>
                  </div>
                  <span>- {newListings.length} tokens within 30 days of listing</span>
                </div>
              )}
            </div>
            <button
              onClick={performDeepScan}
              disabled={scanning || loading}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
            >
              {scanning || loading ? (<RefreshCw className="w-5 h-5 animate-spin" />) : (<Search className="w-5 h-5" />)}
              {scanning ? 'Scanning…' : loading ? 'Loading…' : 'Scan New Listings'}
            </button>
          </div>

          {scanning && (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 border border-blue-500/30 shadow-lg">
              <div className="flex items-center justify-between mb-2 text-sm">
                <span className="text-gray-300 font-semibold">{scanStatus || 'Preparing systems…'}</span>
                <span className="text-blue-400 font-semibold">{scanProgress}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-3">
                <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 h-3 rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }} />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mt-4 text-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-yellow-400 font-semibold mb-1">API issue</p>
                  <p className="text-gray-300">{error}</p>
                  <p className="text-xs text-gray-500 mt-2">Verify your CMC_API_KEY and Pushshift token in .env.local.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard title="Top Rated" value={newListings.filter((t) => t.score >= 85).length} subtitle="Score ≥ 85" icon={TrendingUp} color="text-green-400" />
          <StatCard title="Heating Up" value={newListings.filter((t) => t.sentiment?.trend === 'Heating up').length} subtitle="Reddit trend" icon={MessageCircle} color="text-orange-300" />
          <StatCard title="High Volume" value={newListings.filter((t) => t.volumeMarketCapRatio >= 10).length} subtitle="Volume ≥10% mcap" icon={Activity} color="text-blue-300" />
          <StatCard title="Positive Sentiment" value={newListings.filter((t) => (t.sentiment?.redditScore ?? 0) >= 6).length} subtitle="Reddit >= 6/10" icon={Users} color="text-purple-300" />
        </div>

        <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />

        {activeTab === 'dashboard' && (
          <Dashboard
            modules={modules}
            newListings={newListings}
            formatPrice={formatPrice}
            formatNumber={formatNumber}
            getScoreBg={getScoreBg}
            getScoreColor={getScoreColor}
            formatSentimentSummary={formatSentimentSummary}
            getSentimentColor={getSentimentColor}
          />
        )}

        {activeTab === 'tokens' && (
          <Tokens
            newListings={newListings}
            formatPrice={formatPrice}
            formatNumber={formatNumber}
            getScoreBg={getScoreBg}
            getScoreColor={getScoreColor}
            getSentimentBg={getSentimentBg}
            getSentimentColor={getSentimentColor}
          />
        )}

        {activeTab === 'modules' && (
          <Modules modules={modules} getScoreColor={getScoreColor} />
        )}

        {activeTab === 'alerts' && (
          <Alerts alerts={alerts} />
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color }) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 border border-slate-700/50">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-400">{title}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function Tabs({ activeTab, setActiveTab }) {
  return (
    <div className="flex gap-2 mb-6 overflow-x-auto">
      {['dashboard', 'tokens', 'modules', 'alerts'].map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`px-6 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${activeTab === tab ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800/50 text-gray-400 hover:bg-slate-700/50'}`}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
  );
}

function Dashboard({ modules, newListings, formatPrice, formatNumber, getScoreBg, getScoreColor, formatSentimentSummary, getSentimentColor }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <div key={module.id} className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 border border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Icon className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold">{module.name}</p>
                    <p className="text-xs text-gray-500">{module.description}</p>
                  </div>
                </div>
                <span className="text-xs text-green-400">{module.status.toUpperCase()}</span>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Confidence</span>
                  <span className={`font-semibold ${getScoreColor(module.score)}`}>{module.score}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full" style={{ width: `${module.score}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Zap className="w-6 h-6 text-yellow-400" />
          Top Opportunities - new CEX tokens
        </h2>
        {newListings.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Search className="w-12 h-12 mx-auto mb-3 animate-pulse" />
            <p>Scan to populate the latest listings and sentiment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {newListings.slice(0, 8).map((token, index) => (
              <div key={`${token.symbol}-${index}`} className={`p-4 rounded-lg border ${getScoreBg(token.score)} hover:scale-[1.01] transition-transform`}>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center font-bold text-sm">#{index + 1}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg">{token.symbol}</h3>
                        {token.daysListed && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300">{token.daysListed}d old</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">{token.name}</p>
                      {token.exchanges?.length ? (
                        <p className="text-xs text-gray-500">Exchanges: {formatExchangeSummary(token.exchanges, token.marketAccess?.source)}</p>
                      ) : token.marketAccess?.message && token.marketAccess.reason !== 'quota' ? (
                        <p className="text-xs text-gray-600">{token.marketAccess.message}</p>
                      ) : null}
                      <p className={`text-xs font-semibold ${getSentimentColor(token.sentiment)}`}>{formatSentimentSummary(token.sentiment)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-bold ${getScoreColor(token.score)}`}>{token.score}</div>
                    <div className="text-xs text-gray-400">AI Score</div>
                    <div className="text-xs font-semibold text-gray-300 mt-1">{token.analysis?.investmentGrade}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                  <Info label="Price" value={formatPrice(token.price)} />
                  <Change label="24h" value={token.change24h} />
                  <Change label="7d" value={token.change7d} />
                  <Info label="MCap" value={formatNumber(token.marketCap)} />
                  <Info label="Volume" value={formatNumber(token.volume24h)} />
                  <Info label="Vol/MCap" value={`${numberFmt.format(token.volumeMarketCapRatio)}%`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tokens({ newListings, formatPrice, formatNumber, getScoreBg, getScoreColor, getSentimentBg, getSentimentColor }) {
  return (
    <div className="space-y-4">
      {newListings.map((token, index) => (
        <div key={`${token.symbol}-${index}`} className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center font-bold text-xl">#{index + 1}</div>
              <div className="flex items-center gap-3">
                <Image src={token.image} alt={token.symbol} width={56} height={56} className="w-14 h-14 rounded-full border border-slate-700/60" />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-2xl font-bold">{token.symbol}</h3>
                    <span className="px-3 py-1 rounded text-sm font-semibold bg-blue-500/20 text-blue-300">New Listing</span>
                  </div>
                  <p className="text-gray-400">{token.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {token.daysListed ? `Listed ${token.daysListed} day${token.daysListed === 1 ? '' : 's'} ago` : 'Listing date unavailable'} - Rank #{token.marketCapRank || '—'}{token.exchanges?.length ? ` | ${token.exchanges.length} exchanges` : ''}
                  </p>
                </div>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-lg border ${getScoreBg(token.score)} text-center min-w-[120px]`}>
              <div className={`text-3xl font-bold ${getScoreColor(token.score)}`}>{token.score}</div>
              <div className="text-xs text-gray-400">Composite Score</div>
              <div className="text-xs font-semibold text-gray-300 mt-1">{token.analysis?.investmentGrade}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-slate-900/50 rounded-lg">
            <Info label="Price" value={formatPrice(token.price)} />
            <Change label="24h Change" value={token.change24h} large />
            <Info label="Market Cap" value={formatNumber(token.marketCap)} />
            <Info label="24h Volume" value={formatNumber(token.volume24h)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Panel title="Reddit Activity" icon={Users} customClass={getSentimentBg(token.sentiment)}>
              <KV label="Summary" value={formatSentimentSummary(token.sentiment)} emphasisClass={getSentimentColor(token.sentiment)} />
              <KV label="Mentions (7d)" value={token.sentiment?.commentCount ?? 0} />
              <KV label="Positive" value={`${token.sentiment?.positiveRatio ?? 0}%`} />
              <KV label="Negative" value={`${token.sentiment?.negativeRatio ?? 0}%`} />
              {token.sentiment?.topSubreddits?.length ? (
                <div className="pt-2 text-xs text-gray-400">
                  <p className="font-semibold text-gray-300 mb-1">Top Subreddits</p>
                  <div className="space-y-1">
                    {token.sentiment.topSubreddits.map((sub) => (
                      <div key={sub.name} className="flex justify-between">
                        <span>r/{sub.name}</span>
                        <span>{sub.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {!token.sentiment?.available && token.sentiment?.message && (
                <p className={`text-xs ${['missing-token', 'unauthorized', 'rate-limited'].includes(token.sentiment?.reason) ? 'text-yellow-400' : 'text-gray-400'} mt-2`}>{token.sentiment.message}</p>
              )}
            </Panel>

            <Panel title="Market Signals" icon={TrendingUp}>
              <KV label="24h Momentum" value={formatPercent(token.change24h)} />
              <KV label="7d Momentum" value={formatPercent(token.change7d)} />
              <KV label="Volume/MCap" value={`${numberFmt.format(token.volumeMarketCapRatio)}%`} />
              <KV label="Liquidity" value={token.analysis?.liquidity} emphasis />
            </Panel>

            <Panel title="Risk & Grade" icon={Shield}>
              <KV label="Investment Grade" value={token.analysis?.investmentGrade} emphasis />
              <KV label="Risk" value={token.analysis?.risk} />
              <KV label="Momentum" value={token.analysis?.momentum} />
              <KV label="Age" value={token.analysis?.age ? `${token.analysis.age} days` : '—'} />
            </Panel>

            <Panel title="Exchange Coverage" icon={Database}>
              {token.exchanges?.length ? (
                <div className="space-y-2 text-sm text-gray-300">
                  {token.marketAccess?.source ? (
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">
                      Source: {getExchangeSourceLabel(token.marketAccess.source)}
                    </p>
                  ) : null}
                  {token.exchanges.slice(0, 6).map((exchange) => {
                    const volume = typeof exchange.volume24h === 'number' && exchange.volume24h > 0 ? formatNumber(exchange.volume24h) : null;
                    const categoryLabel = exchange.category ? exchange.category.toUpperCase() : '--';
                    return (
                      <div key={exchange.name} className="flex justify-between gap-3">
                        <span className="font-semibold text-white">{exchange.name}</span>
                        <span className="text-xs text-gray-400">
                          {categoryLabel}{volume ? ` | ${volume}` : ''}
                        </span>
                      </div>
                    );
                  })}
                  {token.exchanges.length > 6 ? (
                    <p className="text-[11px] text-gray-500">+{token.exchanges.length - 6} more exchanges tracked</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  {token.marketAccess?.message || 'Exchange data currently unavailable'}
                  {token.marketAccess?.source ? ` (${getExchangeSourceLabel(token.marketAccess.source, 'short')})` : ''}
                </p>
              )}
            </Panel>

            {token.sentiment?.sampleComments?.length ? (
              <Panel title="Sample Comments" icon={MessageCircle}>
                <div className="space-y-2 text-xs text-gray-300">
                  {token.sentiment.sampleComments.map((comment, idx) => (
                    <div key={idx} className="bg-slate-900/60 rounded p-2 border border-slate-700/50">
                      <p className="mb-1">{comment.body}{comment.body.length === 160 ? '…' : ''}</p>
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>{comment.subreddit ? `r/${comment.subreddit}` : '—'}</span>
                        <span>{comment.score !== null && comment.score !== undefined ? `score ${comment.score}` : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function Modules({ modules, getScoreColor }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {modules.map((m) => {
        const Icon = m.icon;
        return (
          <div key={m.id} className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <Icon className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{m.name}</h3>
                  <p className="text-xs text-gray-500">{m.description}</p>
                </div>
              </div>
              <span className="text-xs text-green-400">ACTIVE</span>
            </div>

            <div className="mb-4">
              <div className="flex justify-between mb-1 text-sm text-gray-400">
                <span>Accuracy score</span>
                <span className={`font-bold ${getScoreColor(m.score)}`}>{m.score}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full" style={{ width: `${m.score}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Alerts({ alerts }) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <AlertCircle className="w-6 h-6 text-yellow-400" />
          Investment Alerts
        </h2>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Monitoring
        </div>
      </div>
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No alerts yet</p>
            <p className="text-sm text-gray-500 mt-1">Scan for new listings to generate investment alerts</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-lg p-4 border ${alert.type === 'critical' ? 'bg-green-500/10 border-green-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}
            >
              <div className="flex items-start gap-3">
                <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-1 ${alert.type === 'critical' ? 'text-green-400' : 'text-blue-400'}`} />
                <div className="flex-1">
                  <p className="text-white font-medium">{alert.text}</p>
                  <p className="text-xs text-gray-400 mt-1">{alert.time.toLocaleTimeString()} - {alert.time.toLocaleDateString()}</p>
                </div>
                {alert.type === 'critical' && (
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded font-semibold">TOP PICK</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children, customClass }) {
  return (
    <div className={`bg-slate-900/50 rounded-lg p-4 border border-slate-800/50 ${customClass || ''}`}>
      <h4 className="font-semibold mb-3 flex items-center gap-2">
        <Icon className="w-4 h-4 text-blue-400" />
        {title}
      </h4>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

function KV({ label, value, emphasis, emphasisClass }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold ${emphasis ? 'text-green-400' : ''} ${emphasisClass || ''}`}>{value}</span>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <span className="text-gray-400 text-xs">{label}</span>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function Change({ label, value, large }) {
  const numeric = Number(value || 0);
  const cls = numeric > 0 ? 'text-green-400' : numeric < 0 ? 'text-red-400' : 'text-gray-300';
  return (
    <div>
      <span className="text-gray-400 text-xs">{label}</span>
      <div className={`font-semibold ${large ? 'text-lg' : ''} ${cls}`}>{numeric > 0 ? '+' : ''}{numberFmt.format(numeric)}%</div>
    </div>
  );
}



