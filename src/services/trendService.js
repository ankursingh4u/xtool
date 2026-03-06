const { chromium } = require('playwright');
const TrendTweet = require('../models/TrendTweet');
const ActionLog = require('../models/ActionLog');
const logger = require('../utils/logger');
const { sleep, randomDelay } = require('../utils/delay');
const { TOPICS } = require('../config/constants');
const path = require('path');

const BROWSER_DATA_DIR = path.join(__dirname, '../../playwright-data');

/**
 * Scrape trending/popular tweets for a given keyword from X search.
 * Uses Playwright in headed mode for debugging or headless for production.
 */
async function fetchTrendsByKeyword(keyword, maxTweets = 10) {
  let browser;
  try {
    browser = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
      headless: process.env.NODE_ENV === 'production',
      viewport: { width: 1280, height: 900 },
    });

    const page = browser.pages()[0] || (await browser.newPage());

    // Navigate to X search with "Top" filter for high-engagement tweets
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query&f=top`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for tweet articles to load
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 }).catch(() => {
      logger.warn(`No tweets found for keyword: ${keyword}`);
    });

    // Scroll a bit to load more tweets
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 800);
      await sleep(randomDelay(1, 3));
    }

    // Extract tweet data
    const tweets = await page.$$eval(
      'article[data-testid="tweet"]',
      (articles, max) => {
        return articles.slice(0, max).map((article) => {
          const textEl = article.querySelector('[data-testid="tweetText"]');
          const text = textEl ? textEl.innerText : '';

          const userEl = article.querySelector('[data-testid="User-Name"]');
          const userText = userEl ? userEl.innerText : '';
          const lines = userText.split('\n');
          const authorName = lines[0] || '';
          const authorHandle = (lines[1] || '').replace('@', '');

          // Try to extract engagement numbers from aria-labels
          const likeBtn = article.querySelector('[data-testid="like"] span, [data-testid="unlike"] span');
          const retweetBtn = article.querySelector('[data-testid="retweet"] span');
          const replyBtn = article.querySelector('[data-testid="reply"] span');

          const parseCount = (el) => {
            if (!el) return 0;
            const txt = el.innerText.replace(/,/g, '').trim();
            if (txt.endsWith('K')) return Math.round(parseFloat(txt) * 1000);
            if (txt.endsWith('M')) return Math.round(parseFloat(txt) * 1000000);
            return parseInt(txt, 10) || 0;
          };

          // Try to get tweet link for unique ID
          const linkEl = article.querySelector('a[href*="/status/"]');
          const url = linkEl ? linkEl.href : '';
          const tweetId = url.split('/status/')[1]?.split('?')[0] || '';

          return {
            tweetId,
            authorName,
            authorHandle,
            text,
            url,
            engagement: {
              likes: parseCount(likeBtn),
              retweets: parseCount(retweetBtn),
              replies: parseCount(replyBtn),
            },
          };
        });
      },
      maxTweets
    );

    // Save to DB, skip duplicates
    let saved = 0;
    for (const tweet of tweets) {
      if (!tweet.text) continue;
      try {
        await TrendTweet.findOneAndUpdate(
          { tweetId: tweet.tweetId || undefined, text: tweet.text },
          { ...tweet, keyword, fetchedAt: new Date() },
          { upsert: true, new: true }
        );
        saved++;
      } catch (err) {
        // duplicate or validation error — skip
        logger.debug(`Skipped duplicate trend tweet: ${err.message}`);
      }
    }

    await ActionLog.create({
      action: 'trend_fetched',
      details: `Fetched ${saved} tweets for keyword "${keyword}"`,
    });

    logger.info(`Trend discovery: saved ${saved} tweets for "${keyword}"`);
    return saved;
  } catch (err) {
    logger.error(`Trend fetch failed for "${keyword}":`, err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Fetch trends for all configured topics.
 */
async function fetchAllTrends() {
  const keywords = TOPICS;
  let totalSaved = 0;

  for (const keyword of keywords) {
    try {
      const count = await fetchTrendsByKeyword(keyword, 10);
      totalSaved += count;
      // Respectful delay between searches
      await sleep(randomDelay(5, 15));
    } catch {
      // individual failures don't stop the batch
    }
  }

  return totalSaved;
}

/**
 * Get high-engagement trend tweets from DB for AI generation context.
 */
async function getTopTrends(limit = 20) {
  return TrendTweet.find({ usedForGeneration: false })
    .sort({ 'engagement.likes': -1 })
    .limit(limit)
    .lean();
}

module.exports = { fetchTrendsByKeyword, fetchAllTrends, getTopTrends };
