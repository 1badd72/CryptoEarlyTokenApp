const CMC_URL = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest';
const CMC_MARKET_PAIRS_URL = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/market-pairs/latest';
const PUSHSHIFT_URL = 'https://api.pushshift.io/reddit/comment/search';
const MAX_SENTIMENT_TOKENS = 25; // stay well under Pushshift rate guidance
const MAX_EXCHANGE_TOKENS = 20; // limit exchange lookups to avoid rate issues

const COINGECKO_SEARCH_URL = 'https://api.coingecko.com/api/v3/search';
const COINGECKO_TICKERS_URL = 'https://api.coingecko.com/api/v3/coins';

const positiveWords = new Set([
  'bull', 'bullish', 'rocket', 'moon', 'moonshot', 'gain', 'gains', 'pump', 'strong', 'undervalued',
  'opportunity', 'breakout', 'green', 'surge', 'up', 'winner', 'diamond', 'solid'
]);

const negativeWords = new Set([
  'bear', 'bearish', 'dump', 'scam', 'rug', 'down', 'bleed', 'crash', 'sell', 'selling', 'bag', 'risk',
  'exit', 'concern', 'problem', 'red', 'collapse', 'liquidate'
]);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const hoursToMs = (hrs) => hrs * 60 * 60 * 1000;

function normalizeScore({ mcap, vol, pct24h, pct7d, daysListed }) {
  const ratio = mcap > 0 ? vol / mcap : 0;
  const ratioScore = clamp(ratio * 200, 0, 100); // 0.5 ratio -> 100
  const pct24Score = clamp((pct24h + 20) * 2.5, 0, 100); // -20 -> 0, +20 -> 100
  const pct7Score = clamp((pct7d + 40) * 1.25, 0, 100); // -40 ->0, +40 ->100
  const ageScore = daysListed !== null ? clamp((30 - Math.min(daysListed, 30)) / 30 * 100, 0, 100) : 60;

  let capScore = 50;
  if (mcap >= 1_000_000_000) capScore = 90;
  else if (mcap >= 250_000_000) capScore = 85;
  else if (mcap >= 100_000_000) capScore = 80;
  else if (mcap >= 25_000_000) capScore = 70;
  else if (mcap >= 5_000_000) capScore = 60;

  const score = (
    ratioScore * 0.3 +
    pct24Score * 0.25 +
    pct7Score * 0.2 +
    capScore * 0.15 +
    ageScore * 0.1
  );

  return Math.round(clamp(score, 0, 100));
}

function classifyAnalysis({ mcap, vol, pct24h, pct7d, score, daysListed }) {
  const ratio = mcap > 0 ? vol / mcap : 0;
  const liquidity = ratio >= 0.2 ? 'High' : ratio >= 0.08 ? 'Medium' : 'Low';
  const investmentGrade = score >= 85 ? 'Excellent' : score >= 75 ? 'Good' : score >= 65 ? 'Fair' : 'Caution';
  const risk = mcap >= 1_000_000_000 ? 'Low' : mcap >= 200_000_000 ? 'Medium' : 'High';

  let momentum = 'Neutral';
  if (pct24h >= 12 || pct7d >= 40) momentum = 'Strong Bull';
  else if (pct24h >= 3 || pct7d >= 15) momentum = 'Bullish';
  else if (pct24h <= -12 || pct7d <= -30) momentum = 'Bearish';

  return {
    investmentGrade,
    risk,
    liquidity,
    momentum,
    age: daysListed
  };
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function analyzeComments(comments) {
  if (!comments.length) {
    return {
      available: false,
      reason: 'no-comments',
      message: 'No recent Reddit chatter',
      commentCount: 0,
      positiveRatio: 0,
      negativeRatio: 0,
      trend: 'No recent chatter',
      topSubreddits: [],
      sampleComments: []
    };
  }

  let positive = 0;
  let negative = 0;
  let aggregate = 0;
  let recentCount = 0;
  const now = Date.now();
  const sixHoursAgo = now - hoursToMs(6);
  const subreddits = new Map();

  const sampleComments = [];

  comments.forEach((comment) => {
    const body = comment?.body || '';
    const tokens = tokenize(body);
    let sentimentScore = 0;
    tokens.forEach((word) => {
      if (positiveWords.has(word)) sentimentScore += 1;
      else if (negativeWords.has(word)) sentimentScore -= 1;
    });

    if (sentimentScore > 0) positive += 1;
    if (sentimentScore < 0) negative += 1;
    aggregate += sentimentScore;

    const createdUtc = comment?.created_utc ? Number(comment.created_utc) * 1000 : null;
    if (createdUtc && createdUtc >= sixHoursAgo) {
      recentCount += 1;
    }

    const subreddit = comment?.subreddit?.toLowerCase();
    if (subreddit) {
      subreddits.set(subreddit, (subreddits.get(subreddit) || 0) + 1);
    }

    if (sampleComments.length < 3 && body.trim().length > 10) {
      sampleComments.push({
        body: body.slice(0, 160),
        score: comment?.score ?? null,
        subreddit: comment?.subreddit ?? null
      });
    }
  });

  const commentCount = comments.length;
  const avg = commentCount ? aggregate / commentCount : 0;
  const normalized = clamp(((avg + 5) / 10) * 10, 0, 10);
  const positiveRatio = commentCount ? (positive / commentCount) * 100 : 0;
  const negativeRatio = commentCount ? (negative / commentCount) * 100 : 0;
  const recencyRatio = commentCount ? recentCount / commentCount : 0;

  let trend = 'Cooling';
  if (recencyRatio >= 0.6) trend = 'Heating up';
  else if (recencyRatio >= 0.3) trend = 'Steady';

  const topSubreddits = Array.from(subreddits.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return {
    available: true,
    redditScore: Number(normalized.toFixed(2)),
    commentCount,
    positiveRatio: Number(positiveRatio.toFixed(1)),
    negativeRatio: Number(negativeRatio.toFixed(1)),
    trend,
    topSubreddits,
    sampleComments
  };
}

async function fetchRedditMetrics(symbol, token) {
  if (!symbol) {
    return {
      available: false,
      reason: 'missing-symbol',
      message: 'Symbol missing for sentiment lookup'
    };
  }

  if (!token) {
    return {
      available: false,
      reason: 'missing-token',
      message: 'Pushshift token not provided'
    };
  }

  const url = new URL(PUSHSHIFT_URL);
  url.searchParams.set('sort', 'created_utc');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('limit', '50');
  url.searchParams.set('track_total_hits', 'false');
  url.searchParams.set('q', symbol);
  url.searchParams.set('after', '7d');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      cache: 'no-store'
    });

    if (res.status === 401) {
      return {
        available: false,
        reason: 'unauthorized',
        message: 'Pushshift token expired or unauthorized. Refresh via moderator OAuth.'
      };
    }

    if (res.status === 429) {
      return {
        available: false,
        reason: 'rate-limited',
        message: 'Pushshift rate limit hit. Try again shortly.'
      };
    }

    if (!res.ok) {
      const text = await res.text();
      return {
        available: false,
        reason: 'http-error',
        message: `Pushshift ${res.status}: ${text || 'Unknown error'}`
      };
    }

    const payload = await res.json();
    const raw = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.data?.data)
          ? payload.data.data
          : [];

    const comments = raw.filter((item) => typeof item?.body === 'string');
    return analyzeComments(comments);
  } catch (error) {
    return {
      available: false,
      reason: 'network-error',
      message: error instanceof Error ? error.message : 'Unknown Pushshift error'
    };
  }
}

async function fetchCmcMarketPairs(tokenId, apiKey) {
  if (!tokenId) {
    return {
      available: false,
      reason: 'missing-id',
      message: 'Token ID missing for exchange lookup',
      exchanges: [],
      source: 'coinmarketcap'
    };
  }

  if (!apiKey) {
    return {
      available: false,
      reason: 'missing-api-key',
      message: 'CMC API key not configured for exchange lookup',
      exchanges: [],
      source: 'coinmarketcap'
    };
  }

  const url = new URL(CMC_MARKET_PAIRS_URL);
  url.searchParams.set('id', String(tokenId));
  url.searchParams.set('limit', '20');
  url.searchParams.set('convert', 'USD');
  url.searchParams.set('interval', '24h');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (res.status === 401 || res.status === 403) {
      return {
        available: false,
        reason: 'unauthorized',
        message: 'CMC API key unauthorized for market pairs endpoint',
        exchanges: [],
        source: 'coinmarketcap'
      };
    }

    if (res.status === 429) {
      return {
        available: false,
        reason: 'rate-limited',
        message: 'CMC market pairs rate limit hit. Try again shortly.',
        exchanges: [],
        source: 'coinmarketcap'
      };
    }

    if (!res.ok) {
      const text = await res.text();
      return {
        available: false,
        reason: 'http-error',
        message: `CMC market pairs ${res.status}: ${text || 'Unknown error'}`,
        exchanges: [],
        source: 'coinmarketcap'
      };
    }

    const payload = await res.json();
    const pairs = Array.isArray(payload?.data?.market_pairs) ? payload.data.market_pairs : [];

    const seen = new Set();
    const exchanges = [];

    pairs.forEach((pair) => {
      const name = pair?.exchange?.name || pair?.market_pair_exchange?.name;
      if (!name) return;

      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const volume = Number(pair?.quote?.USD?.volume_24h ?? pair?.quote?.USD?.volume_24h_unreported ?? 0);
      exchanges.push({
        name,
        category: pair?.category || null,
        volume24h: Number.isFinite(volume) ? volume : null
      });
    });

    if (!exchanges.length) {
      return {
        available: false,
        reason: 'no-exchanges',
        message: 'No exchange listings reported yet',
        exchanges: [],
        source: 'coinmarketcap'
      };
    }

    exchanges.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    const topExchanges = exchanges.slice(0, 8).map(({ name, category, volume24h }) => ({
      name,
      category: category || null,
      volume24h
    }));

    return {
      available: true,
      source: 'coinmarketcap',
      exchanges: topExchanges
    };
  } catch (error) {
    return {
      available: false,
      reason: 'network-error',
      message: error instanceof Error ? error.message : 'Unknown exchange lookup error',
      exchanges: [],
      source: 'coinmarketcap'
    };
  }
}

function scoreCoingeckoCandidate(token, candidate) {
  if (!candidate) return 0;

  const tokenSymbol = (token?.symbol || '').toLowerCase();
  const tokenSlug = (token?.slug || '').toLowerCase();
  const tokenName = (token?.name || '').toLowerCase();
  const candidateSymbol = (candidate.symbol || '').toLowerCase();
  const candidateId = (candidate.id || '').toLowerCase();
  const candidateName = (candidate.name || '').toLowerCase();

  let score = 0;
  if (tokenSymbol && candidateSymbol && tokenSymbol === candidateSymbol) score += 3;
  if (tokenSlug && candidateId && tokenSlug === candidateId) score += 2;
  if (tokenSlug && candidateId && candidateId.includes(tokenSlug)) score += 1;
  if (tokenSymbol && candidateSymbol && candidateSymbol.includes(tokenSymbol)) score += 0.5;
  if (tokenName && candidateName && tokenName === candidateName) score += 1.5;
  if (tokenName && candidateName && candidateName.includes(tokenName)) score += 0.5;
  return score;
}

async function fetchCoingeckoMarketPairs(token) {
  const symbol = (token?.symbol || '').trim();
  const name = (token?.name || '').trim();
  const slug = (token?.slug || '').trim();
  const searchTerms = [symbol, slug?.replace(/-/g, ' '), name].filter(Boolean);

  if (!searchTerms.length) {
    return {
      available: false,
      reason: 'fallback-missing-identifiers',
      message: 'CoinGecko lookup requires symbol or name',
      exchanges: [],
      source: 'coingecko'
    };
  }

  let coins = [];
  let lastErrorMessage = null;

  for (const term of searchTerms) {
    try {
      const searchUrl = new URL(COINGECKO_SEARCH_URL);
      searchUrl.searchParams.set('query', term);
      const res = await fetch(searchUrl.toString(), {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (res.status === 429) {
        return {
          available: false,
          reason: 'fallback-rate-limited',
          message: 'CoinGecko rate limit hit. Try again shortly.',
          exchanges: [],
          source: 'coingecko'
        };
      }

      if (!res.ok) {
        lastErrorMessage = `CoinGecko search ${res.status}`;
        continue;
      }

      const payload = await res.json();
      coins = Array.isArray(payload?.coins) ? payload.coins : [];

      if (coins.length) {
        break;
      }
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : 'Unknown CoinGecko search error';
    }
  }

  if (!coins.length) {
    return {
      available: false,
      reason: 'fallback-no-match',
      message: lastErrorMessage || 'No matching asset found on CoinGecko',
      exchanges: [],
      source: 'coingecko'
    };
  }

  const ranked = coins
    .map((candidate) => ({
      candidate,
      score: scoreCoingeckoCandidate(token, candidate)
    }))
    .sort((a, b) => b.score - a.score);

  const bestMatch = ranked.find((entry) => entry.score > 0)?.candidate || ranked[0]?.candidate;

  if (!bestMatch?.id) {
    return {
      available: false,
      reason: 'fallback-no-match',
      message: 'Unable to resolve CoinGecko asset identifier',
      exchanges: [],
      source: 'coingecko'
    };
  }

  try {
    const tickersUrl = `${COINGECKO_TICKERS_URL}/${bestMatch.id}/tickers?include_exchange_logo=false`;
    const res = await fetch(tickersUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    if (res.status === 429) {
      return {
        available: false,
        reason: 'fallback-rate-limited',
        message: 'CoinGecko rate limit hit. Try again shortly.',
        exchanges: [],
        source: 'coingecko'
      };
    }

    if (!res.ok) {
      const text = await res.text();
      return {
        available: false,
        reason: 'fallback-http-error',
        message: `CoinGecko tickers ${res.status}: ${text || 'Unknown error'}`,
        exchanges: [],
        source: 'coingecko'
      };
    }

    const payload = await res.json();
    const tickers = Array.isArray(payload?.tickers) ? payload.tickers : [];

    const seen = new Set();
    const exchanges = [];

    tickers.forEach((ticker) => {
      const name = ticker?.market?.name;
      if (!name) return;

      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const volume = Number(ticker?.converted_volume?.usd ?? ticker?.volume ?? 0);
      const category = ticker?.market?.identifier?.includes('dex')
        ? 'DEX'
        : ticker?.market?.type
          ? String(ticker.market.type).toUpperCase()
          : null;

      exchanges.push({
        name,
        category,
        volume24h: Number.isFinite(volume) ? volume : null
      });
    });

    if (!exchanges.length) {
      return {
        available: false,
        reason: 'fallback-no-exchanges',
        message: 'No exchange listings reported via CoinGecko',
        exchanges: [],
        source: 'coingecko'
      };
    }

    exchanges.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    const topExchanges = exchanges.slice(0, 8);

    return {
      available: true,
      source: 'coingecko',
      exchanges: topExchanges
    };
  } catch (error) {
    return {
      available: false,
      reason: 'fallback-network-error',
      message: error instanceof Error ? error.message : 'Unknown CoinGecko ticker error',
      exchanges: [],
      source: 'coingecko'
    };
  }
}

async function fetchExchangeAvailability(token, apiKey) {
  const cmcResult = token?.id ? await fetchCmcMarketPairs(token.id, apiKey) : null;

  if (cmcResult?.available && cmcResult.exchanges?.length) {
    return cmcResult;
  }

  const shouldFallback =
    !cmcResult ||
    ['missing-id', 'missing-api-key', 'no-exchanges', 'unauthorized', 'http-error', 'network-error', 'rate-limited'].includes(cmcResult.reason);

  if (!shouldFallback) {
    return cmcResult;
  }

  const coingeckoResult = await fetchCoingeckoMarketPairs(token);

  if (coingeckoResult.available && coingeckoResult.exchanges?.length) {
    return coingeckoResult;
  }

  if (cmcResult) {
    return cmcResult;
  }

  return coingeckoResult;
}

export async function GET() {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing CMC_API_KEY env var' }), { status: 500 });
  }

  try {
    const url = new URL(CMC_URL);
    url.searchParams.set('sort', 'date_added');
    url.searchParams.set('sort_dir', 'desc');
    url.searchParams.set('limit', '150');
    url.searchParams.set('convert', 'USD');

    const res = await fetch(url.toString(), {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `CMC error ${res.status}: ${text}` }), { status: 502 });
    }

    const { data } = await res.json();
    const now = Date.now();

    const baseTokens = (data || []).map((c) => {
      const quote = c.quote?.USD || {};
      const dateAdded = c.date_added ? new Date(c.date_added) : null;
      const daysListed = dateAdded ? Math.max(1, Math.floor((now - dateAdded.getTime()) / (1000 * 60 * 60 * 24))) : null;
      const mcap = Number(quote.market_cap ?? 0);
      const vol = Number(quote.volume_24h ?? 0);
      const pct1h = Number(quote.percent_change_1h ?? 0);
      const pct24h = Number(quote.percent_change_24h ?? 0);
      const pct7d = Number(quote.percent_change_7d ?? 0);

      const score = normalizeScore({ mcap, vol, pct24h, pct7d, daysListed: daysListed ?? 30 });
      const volumeRatio = mcap > 0 ? (vol / mcap) * 100 : 0;

      return {
        id: c.id,
        symbol: (c.symbol || '').toUpperCase(),
        slug: c.slug,
        name: c.name,
        image: `https://robohash.org/${encodeURIComponent(c.symbol || '')}.png?size=80x80&set=set1`,
        score,
        price: Number(quote.price ?? 0),
        marketCap: mcap,
        volume24h: vol,
        volumeMarketCapRatio: Number(volumeRatio.toFixed(2)),
        change1h: pct1h,
        change24h: pct24h,
        change7d: pct7d,
        marketCapRank: c.cmc_rank ?? null,
        daysListed,
        analysis: classifyAnalysis({ mcap, vol, pct24h, pct7d, score, daysListed })
      };
    });

    const filtered = baseTokens
      .filter((token) => token.daysListed === null || token.daysListed <= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);

    const pushshiftToken = process.env.PUSHSHIFT_TOKEN;
    let cachedFailure = null;
    let exchangeFailure = null;

    const tokensWithSentiment = [];
    for (let index = 0; index < filtered.length; index += 1) {
      const token = filtered[index];
      let sentiment;

      if (cachedFailure) {
        sentiment = cachedFailure;
      } else if (index >= MAX_SENTIMENT_TOKENS) {
        sentiment = {
          available: false,
          reason: 'quota',
          message: 'Sentiment limited to top tokens to respect rate limits'
        };
      } else {
        sentiment = await fetchRedditMetrics(token.symbol, pushshiftToken);
        if (!sentiment.available && sentiment.reason !== 'no-comments' && sentiment.reason !== 'missing-symbol') {
          cachedFailure = sentiment; // reuse failure for subsequent tokens to avoid repeated errors
        }
      }

      let marketAccess;
      if (exchangeFailure) {
        marketAccess = exchangeFailure;
      } else if (index >= MAX_EXCHANGE_TOKENS) {
        marketAccess = {
          available: false,
          reason: 'quota',
          message: 'Exchange lookup limited to top tokens to respect rate limits',
          exchanges: []
        };
      } else {
        marketAccess = await fetchExchangeAvailability(token, apiKey);
        if (!marketAccess.available && !['no-exchanges', 'missing-id', 'fallback-no-match', 'fallback-no-exchanges', 'fallback-missing-identifiers'].includes(marketAccess.reason)) {
          exchangeFailure = marketAccess; // reuse failure for subsequent tokens to avoid repeated errors
        }
      }

      tokensWithSentiment.push({
        ...token,
        sentiment,
        marketAccess,
        exchanges: marketAccess.exchanges ?? [],
        lastUpdated: new Date().toISOString()
      });
    }

    return new Response(JSON.stringify({ items: tokensWithSentiment }), { status: 200 });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500 }
    );
  }
}
