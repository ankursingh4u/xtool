const express = require('express');
const router = express.Router();
const Tweet = require('../models/Tweet');
const ActionLog = require('../models/ActionLog');
const { generateTweets, generateThread, generateAllTopics } = require('../services/aiService');
const { fetchTrendsByKeyword, fetchAllTrends } = require('../services/trendService');
const { postTweet } = require('../services/posterService');
const { startScheduler, stopScheduler, isSchedulerRunning } = require('../services/schedulerService');
const { requireAuth } = require('../middleware/auth');
const { TWEET_STATUS, MAX_TWEET_LENGTH } = require('../config/constants');

router.use(requireAuth);

// ---- Tweet CRUD ----

// Update a tweet (edit text, change status, set schedule)
router.put('/tweets/:id', async (req, res) => {
  try {
    const { text, status, scheduledAt, topic } = req.body;
    const tweet = await Tweet.findById(req.params.id);
    if (!tweet) return res.status(404).json({ error: 'Tweet not found' });

    if (text !== undefined) {
      if (text.length > MAX_TWEET_LENGTH) {
        return res.status(400).json({ error: `Tweet exceeds ${MAX_TWEET_LENGTH} characters` });
      }
      tweet.text = text;
    }
    if (topic !== undefined) tweet.topic = topic;
    if (scheduledAt !== undefined) tweet.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    if (status !== undefined) {
      if (!Object.values(TWEET_STATUS).includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      tweet.status = status;

      // Log status changes
      const actionMap = {
        [TWEET_STATUS.APPROVED]: 'tweet_approved',
        [TWEET_STATUS.REJECTED]: 'tweet_rejected',
      };
      if (actionMap[status]) {
        await ActionLog.create({ action: actionMap[status], tweetId: tweet._id });
      }
    }

    await tweet.save();
    res.json({ success: true, tweet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a tweet
router.delete('/tweets/:id', async (req, res) => {
  try {
    await Tweet.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk approve
router.post('/tweets/bulk-approve', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });

    await Tweet.updateMany(
      { _id: { $in: ids }, status: TWEET_STATUS.DRAFT },
      { status: TWEET_STATUS.APPROVED }
    );

    for (const id of ids) {
      await ActionLog.create({ action: 'tweet_approved', tweetId: id });
    }

    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- AI Generation ----

router.post('/generate', async (req, res) => {
  try {
    const { topic, style } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const tweets = await generateTweets(topic, style);
    res.json({ success: true, tweets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate one tweet per topic across all genres
router.post('/generate-all', async (req, res) => {
  try {
    const tweets = await generateAllTopics();
    res.json({ success: true, tweets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate-thread', async (req, res) => {
  try {
    const { topic, count } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const tweet = await generateThread(topic, count || 4);
    res.json({ success: true, tweet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Trend Discovery ----

router.post('/trends/fetch', async (req, res) => {
  try {
    const { keyword } = req.body;
    if (keyword) {
      const count = await fetchTrendsByKeyword(keyword);
      return res.json({ success: true, count });
    }
    const count = await fetchAllTrends();
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Posting ----

router.post('/tweets/:id/post', async (req, res) => {
  try {
    const result = await postTweet(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Scheduler ----

router.post('/scheduler/start', (req, res) => {
  startScheduler();
  res.json({ success: true, running: true });
});

router.post('/scheduler/stop', (req, res) => {
  stopScheduler();
  res.json({ success: true, running: false });
});

router.get('/scheduler/status', (req, res) => {
  res.json({ running: isSchedulerRunning() });
});

module.exports = router;
