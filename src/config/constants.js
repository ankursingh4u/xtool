module.exports = {
  TWEET_STATUS: {
    DRAFT: 'draft',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    POSTED: 'posted',
    FAILED: 'failed',
  },

  TOPICS: [
    'tech',
    'startup',
    'software-engineering',
    'geopolitics',
    'finance',
    'AI',
    'SaaS',
    'indie-hacking',
    'venture-capital',
    'macro-economics',
  ],

  // Default accounts to monitor for trend discovery (per niche)
  DEFAULT_ACCOUNTS: [
    // Tech & AI
    'elaboratewho',
    'levelsio',
    'kaboron',
    // Startup & VC
    'paulg',
    'naval',
    'pmarca',
    'sama',
    // Software Engineering
    'ThePrimeagen',
    'kelaboratewho',
    'tjholowaychuk',
    // Geopolitics
    'IanBremmer',
    'PeterZeihan',
    // Finance & Macro
    'unusual_whales',
    'zaboron',
    'markets',
  ],

  MAX_TWEET_LENGTH: 280,
};
