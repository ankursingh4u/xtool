const mongoose = require('mongoose');

const actionLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'tweet_generated',
      'tweet_approved',
      'tweet_rejected',
      'tweet_posted',
      'tweet_post_failed',
      'tweet_edited',
      'trend_fetched',
      'login_attempt',
      'login_success',
      'login_failed',
      'rate_limit_hit',
      'scheduler_run',
    ],
  },
  tweetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tweet',
  },
  details: String,
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Auto-expire logs after 30 days to keep DB lean
actionLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports = mongoose.model('ActionLog', actionLogSchema);
