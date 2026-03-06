const express = require('express');
const router = express.Router();
const Tweet = require('../models/Tweet');
const TrendTweet = require('../models/TrendTweet');
const ActionLog = require('../models/ActionLog');
const { getTodayPostCount } = require('../services/posterService');
const { isSchedulerRunning } = require('../services/schedulerService');
const { TWEET_STATUS, TOPICS } = require('../config/constants');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Dashboard home — overview stats
router.get('/', async (req, res) => {
  const [drafts, approved, posted, failed, todayCount, recentLogs] = await Promise.all([
    Tweet.countDocuments({ status: TWEET_STATUS.DRAFT }),
    Tweet.countDocuments({ status: TWEET_STATUS.APPROVED }),
    Tweet.countDocuments({ status: TWEET_STATUS.POSTED }),
    Tweet.countDocuments({ status: TWEET_STATUS.FAILED }),
    getTodayPostCount(),
    ActionLog.find().sort({ timestamp: -1 }).limit(15).lean(),
  ]);

  res.render('pages/dashboard', {
    stats: { drafts, approved, posted, failed, todayCount },
    maxPerDay: Number(process.env.MAX_TWEETS_PER_DAY) || 7,
    schedulerRunning: isSchedulerRunning(),
    recentLogs,
    page: 'dashboard',
  });
});

// Queue view — all tweets with filters
router.get('/queue', async (req, res) => {
  const { status, topic } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (topic) filter.topic = topic;

  const tweets = await Tweet.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.render('pages/queue', {
    tweets,
    currentStatus: status || '',
    currentTopic: topic || '',
    statuses: Object.values(TWEET_STATUS),
    topics: TOPICS,
    page: 'queue',
  });
});

// Trends view
router.get('/trends', async (req, res) => {
  const trends = await TrendTweet.find()
    .sort({ 'engagement.likes': -1 })
    .limit(50)
    .lean();

  res.render('pages/trends', { trends, topics: TOPICS, page: 'trends' });
});

// Generate view
router.get('/generate', (req, res) => {
  res.render('pages/generate', { topics: TOPICS, page: 'generate' });
});

// Logs view
router.get('/logs', async (req, res) => {
  const logs = await ActionLog.find()
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();

  res.render('pages/logs', { logs, page: 'logs' });
});

module.exports = router;
