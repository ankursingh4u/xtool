const { CronJob } = require('cron');
const Tweet = require('../models/Tweet');
const ActionLog = require('../models/ActionLog');
const { postTweet } = require('./posterService');
const logger = require('../utils/logger');
const { sleep, randomDelay } = require('../utils/delay');
const { TWEET_STATUS } = require('../config/constants');

let schedulerJob = null;

/**
 * Check for approved tweets that are due to be posted.
 * Runs every minute via cron.
 */
async function checkAndPostDueTweets() {
  try {
    const now = new Date();
    const dueTweets = await Tweet.find({
      status: TWEET_STATUS.APPROVED,
      scheduledAt: { $lte: now },
    })
      .sort({ scheduledAt: 1 })
      .limit(2); // Process max 2 per cycle to avoid bursts

    if (dueTweets.length === 0) return;

    await ActionLog.create({
      action: 'scheduler_run',
      details: `Found ${dueTweets.length} due tweets`,
    });

    for (const tweet of dueTweets) {
      logger.info(`Scheduler posting tweet ${tweet._id} (scheduled for ${tweet.scheduledAt})`);
      const result = await postTweet(tweet._id);

      if (!result.success) {
        logger.warn(`Scheduler: failed to post ${tweet._id}: ${result.reason}`);
        // If rate limited, stop processing more
        if (result.reason.includes('Daily limit')) break;
      }

      // Wait between posts
      if (dueTweets.indexOf(tweet) < dueTweets.length - 1) {
        await sleep(randomDelay(10, 30));
      }
    }
  } catch (err) {
    logger.error('Scheduler error:', err.message);
  }
}

/**
 * Start the scheduler cron job (runs every 2 minutes).
 */
function startScheduler() {
  if (schedulerJob) {
    logger.warn('Scheduler already running');
    return;
  }

  schedulerJob = new CronJob('*/2 * * * *', checkAndPostDueTweets, null, true);
  logger.info('Tweet scheduler started (checking every 2 minutes)');
}

/**
 * Stop the scheduler.
 */
function stopScheduler() {
  if (schedulerJob) {
    schedulerJob.stop();
    schedulerJob = null;
    logger.info('Tweet scheduler stopped');
  }
}

function isSchedulerRunning() {
  return schedulerJob !== null && schedulerJob.running;
}

module.exports = { startScheduler, stopScheduler, isSchedulerRunning, checkAndPostDueTweets };
