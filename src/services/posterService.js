const { chromium } = require('playwright');
const path = require('path');
const Tweet = require('../models/Tweet');
const ActionLog = require('../models/ActionLog');
const logger = require('../utils/logger');
const { sleep, randomDelay } = require('../utils/delay');
const { TWEET_STATUS } = require('../config/constants');

const BROWSER_DATA_DIR = path.join(__dirname, '../../playwright-data');

/**
 * Check how many tweets have been posted today.
 * Enforces the daily rate limit.
 */
async function getTodayPostCount() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return Tweet.countDocuments({
    status: TWEET_STATUS.POSTED,
    postedAt: { $gte: startOfDay },
  });
}

/**
 * Login to X if not already logged in.
 * Uses persistent browser context so login survives across sessions.
 */
async function ensureLoggedIn(page) {
  await page.goto('https://x.com/home', { waitUntil: 'networkidle', timeout: 30000 });

  // Check if we're on the login page or already logged in
  const url = page.url();
  if (url.includes('/login') || url.includes('/i/flow/login')) {
    logger.info('Not logged in, performing login...');
    await ActionLog.create({ action: 'login_attempt' });

    // Enter username
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
    await page.fill('input[autocomplete="username"]', process.env.X_USERNAME);
    await sleep(randomDelay(1, 2));
    await page.click('button:has-text("Next")');

    // Sometimes X asks for email verification
    try {
      const emailInput = await page.waitForSelector(
        'input[data-testid="ocfEnterTextTextInput"]',
        { timeout: 5000 }
      );
      if (emailInput) {
        await emailInput.fill(process.env.X_EMAIL);
        await sleep(randomDelay(1, 2));
        await page.click('button:has-text("Next")');
      }
    } catch {
      // No email verification step — continue
    }

    // Enter password
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.fill('input[type="password"]', process.env.X_PASSWORD);
    await sleep(randomDelay(1, 2));
    await page.click('button[data-testid="LoginForm_Login_Button"]');

    // Wait for navigation to home
    await page.waitForURL('**/home', { timeout: 20000 });
    logger.info('Login successful');
    await ActionLog.create({ action: 'login_success' });
  }
}

/**
 * Post a single tweet using browser automation.
 */
async function postTweet(tweetId) {
  const maxPerDay = Number(process.env.MAX_TWEETS_PER_DAY) || 7;
  const todayCount = await getTodayPostCount();

  if (todayCount >= maxPerDay) {
    const msg = `Daily limit reached (${todayCount}/${maxPerDay}). Skipping post.`;
    logger.warn(msg);
    await ActionLog.create({ action: 'rate_limit_hit', tweetId, details: msg });
    return { success: false, reason: msg };
  }

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) throw new Error('Tweet not found');
  if (tweet.status !== TWEET_STATUS.APPROVED) {
    throw new Error(`Tweet is not approved (current status: ${tweet.status})`);
  }

  let browser;
  try {
    browser = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
      headless: false, // Headed so you can see what's happening
      viewport: { width: 1280, height: 900 },
    });

    const page = browser.pages()[0] || (await browser.newPage());
    await ensureLoggedIn(page);

    // Random pre-action delay to mimic human behavior
    await sleep(randomDelay(3, 8));

    // Click the tweet compose box
    const composeSelector = '[data-testid="tweetTextarea_0"]';
    await page.waitForSelector(composeSelector, { timeout: 10000 });
    await page.click(composeSelector);
    await sleep(randomDelay(1, 3));

    // Type the tweet character by character with random delays
    for (const char of tweet.text) {
      await page.keyboard.type(char, { delay: Math.random() * 80 + 30 });
    }

    await sleep(randomDelay(2, 5));

    // Post the tweet
    await page.click('[data-testid="tweetButtonInline"]');

    // Wait for the tweet to be posted (compose box clears)
    await sleep(3000);

    // Handle thread if present
    if (tweet.thread && tweet.thread.length > 0) {
      for (const threadTweet of tweet.thread.sort((a, b) => a.order - b.order)) {
        await sleep(randomDelay(5, 15));

        // Click reply on the just-posted tweet or use the compose
        await page.waitForSelector(composeSelector, { timeout: 10000 });
        await page.click(composeSelector);
        await sleep(randomDelay(1, 2));

        for (const char of threadTweet.text) {
          await page.keyboard.type(char, { delay: Math.random() * 80 + 30 });
        }

        await sleep(randomDelay(2, 4));
        await page.click('[data-testid="tweetButtonInline"]');
        await sleep(3000);
      }
    }

    // Mark as posted
    tweet.status = TWEET_STATUS.POSTED;
    tweet.postedAt = new Date();
    await tweet.save();

    await ActionLog.create({
      action: 'tweet_posted',
      tweetId: tweet._id,
      details: `Posted tweet: "${tweet.text.substring(0, 50)}..."`,
    });

    logger.info(`Successfully posted tweet ${tweet._id}`);
    return { success: true, tweet };
  } catch (err) {
    logger.error(`Failed to post tweet ${tweetId}:`, err.message);

    tweet.status = TWEET_STATUS.FAILED;
    tweet.postError = err.message;
    await tweet.save();

    await ActionLog.create({
      action: 'tweet_post_failed',
      tweetId: tweet._id,
      details: err.message,
    });

    return { success: false, reason: err.message };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { postTweet, getTodayPostCount };
