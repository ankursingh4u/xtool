const mongoose = require('mongoose');

const trendTweetSchema = new mongoose.Schema(
  {
    tweetId: {
      type: String,
      unique: true,
      sparse: true,
    },
    authorHandle: String,
    authorName: String,
    text: {
      type: String,
      required: true,
    },
    keyword: String, // search keyword that found this tweet
    engagement: {
      likes: { type: Number, default: 0 },
      retweets: { type: Number, default: 0 },
      replies: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
    },
    url: String,
    fetchedAt: {
      type: Date,
      default: Date.now,
    },
    usedForGeneration: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

trendTweetSchema.index({ keyword: 1, 'engagement.likes': -1 });

module.exports = mongoose.model('TrendTweet', trendTweetSchema);
