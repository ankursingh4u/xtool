const mongoose = require('mongoose');
const { TWEET_STATUS } = require('../config/constants');

const tweetSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      maxlength: 280,
    },
    topic: {
      type: String,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TWEET_STATUS),
      default: TWEET_STATUS.DRAFT,
      index: true,
    },
    scheduledAt: {
      type: Date,
      index: true,
    },
    postedAt: Date,

    // Source context — what inspired this tweet
    sourceType: {
      type: String,
      enum: ['trend', 'manual', 'ai-generated'],
      default: 'ai-generated',
    },
    sourceTweetId: String, // reference to TrendTweet if applicable

    // Variations: store alternate drafts for the same idea
    variations: [String],

    // Engagement metrics (filled after posting, if scraped later)
    engagement: {
      likes: { type: Number, default: 0 },
      retweets: { type: Number, default: 0 },
      replies: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
    },

    // Thread support: array of follow-up tweets
    thread: [
      {
        text: { type: String, maxlength: 280 },
        order: Number,
      },
    ],

    postError: String, // stores error message if posting failed
  },
  { timestamps: true }
);

// Index for the scheduler to find due tweets
tweetSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('Tweet', tweetSchema);
