const OpenAI = require('openai');
const Tweet = require('../models/Tweet');
const TrendTweet = require('../models/TrendTweet');
const ActionLog = require('../models/ActionLog');
const logger = require('../utils/logger');
const { MAX_TWEET_LENGTH, TOPICS } = require('../config/constants');

let openai;
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

/**
 * Build a prompt using trending tweets as context.
 */
function buildPrompt(trendTweets, topic, style) {
  const trendContext = trendTweets
    .slice(0, 5)
    .map((t, i) => `${i + 1}. "${t.text}" (${t.engagement.likes} likes)`)
    .join('\n');

  const nicheGuides = {
    'tech': 'Write about emerging technology, product launches, dev tools, and industry shifts. Sound like a builder who ships.',
    'startup': 'Write about founding, scaling, fundraising, hiring, and hard-won startup lessons. Be specific, not generic motivational.',
    'software-engineering': 'Write about architecture decisions, code craft, debugging war stories, system design, and engineering culture. Speak developer-to-developer.',
    'geopolitics': 'Write about global power dynamics, trade policy, defense, alliances, and geopolitical risk. Be analytical and sharp, not partisan.',
    'finance': 'Write about markets, macro trends, investing frameworks, monetary policy, and wealth building. Data-informed, not hype.',
    'AI': 'Write about AI breakthroughs, practical AI use cases, and the impact on work and society. Grounded, not sci-fi.',
    'SaaS': 'Write about SaaS metrics, GTM strategies, churn, pricing, and PLG. Speak from operator experience.',
    'indie-hacking': 'Write about building profitable solo/small-team products, revenue milestones, and bootstrapping tactics.',
    'venture-capital': 'Write about deal flow, valuations, market cycles, and what VCs actually look for. Insider perspective.',
    'macro-economics': 'Write about interest rates, inflation, fiscal policy, labor markets, and global economic trends. Data-driven analysis.',
  };

  const nicheGuide = nicheGuides[topic] || `Write insightful, original content about "${topic}".`;

  return `You are a sharp, multi-disciplinary thinker who posts on X (Twitter) across tech, startups, software engineering, geopolitics, and finance.
Your audience is builders, engineers, founders, investors, and curious generalists.

Niche-specific guidance for "${topic}":
${nicheGuide}

Style guidelines:
- ${style || 'Concise, punchy, and thought-provoking'}
- Max ${MAX_TWEET_LENGTH} characters per tweet
- No hashtags unless they add real value
- NEVER use em dashes or en dashes (the long dash characters). Use commas, periods, or short hyphens instead.
- Sound authentic and opinionated, not like a bot or a news feed
- Use line breaks for readability when helpful
- Vary formats: hot takes, counterintuitive insights, data points, questions, predictions, lessons learned
- Cross-pollinate ideas across niches when it adds depth (e.g. geopolitics affecting markets, AI reshaping engineering)

Here are some trending high-engagement tweets in the "${topic}" space for inspiration (DO NOT copy them, use them as thematic context):

${trendContext || 'No trends available — generate original content.'}

Generate 3 unique tweet variations about "${topic}".
Each tweet must be under ${MAX_TWEET_LENGTH} characters.

Return ONLY a JSON array of 3 strings. No explanation, no markdown.
Example: ["tweet 1", "tweet 2", "tweet 3"]`;
}

/**
 * Generate tweet drafts for a given topic.
 * Returns the created Tweet documents.
 */
async function generateTweets(topic, style) {
  // Grab trending tweets for context
  const trends = await TrendTweet.find({ keyword: { $regex: new RegExp(topic, 'i') } })
    .sort({ 'engagement.likes': -1 })
    .limit(5)
    .lean();

  const prompt = buildPrompt(trends, topic, style);

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
    max_tokens: 600,
  });

  const content = response.choices[0].message.content.trim();

  // Parse the JSON array from the response
  let variations;
  try {
    // Handle cases where GPT wraps in markdown code blocks
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    variations = JSON.parse(cleaned);
  } catch (err) {
    logger.error('Failed to parse AI response:', content);
    throw new Error('AI returned invalid JSON. Raw: ' + content.substring(0, 200));
  }

  if (!Array.isArray(variations) || variations.length === 0) {
    throw new Error('AI returned empty or non-array response');
  }

  // Validate lengths, strip em/en dashes, and trim if needed
  variations = variations
    .filter((t) => typeof t === 'string' && t.length > 0)
    .map((t) => t.replace(/[\u2013\u2014]/g, '-'))
    .map((t) => (t.length > MAX_TWEET_LENGTH ? t.substring(0, MAX_TWEET_LENGTH) : t));

  // Save the first variation as the main tweet, rest as alternatives
  const tweet = await Tweet.create({
    text: variations[0],
    topic,
    status: 'draft',
    sourceType: 'ai-generated',
    variations: variations.slice(1),
  });

  // Also create individual drafts for each variation so they appear in the queue
  const additionalTweets = [];
  for (let i = 1; i < variations.length; i++) {
    const t = await Tweet.create({
      text: variations[i],
      topic,
      status: 'draft',
      sourceType: 'ai-generated',
    });
    additionalTweets.push(t);
  }

  // Mark trend tweets as used
  if (trends.length > 0) {
    const trendIds = trends.map((t) => t._id);
    await TrendTweet.updateMany(
      { _id: { $in: trendIds } },
      { usedForGeneration: true }
    );
  }

  await ActionLog.create({
    action: 'tweet_generated',
    tweetId: tweet._id,
    details: `Generated ${variations.length} variations for topic "${topic}"`,
  });

  logger.info(`AI generated ${variations.length} tweet drafts for "${topic}"`);
  return [tweet, ...additionalTweets];
}

/**
 * Generate a thread (multi-tweet) on a topic.
 */
async function generateThread(topic, tweetCount = 4) {
  const prompt = `You are a developer/startup thought leader on X (Twitter).

Write a thread of ${tweetCount} tweets about "${topic}".
- First tweet should be a hook that makes people want to read more
- Each tweet max ${MAX_TWEET_LENGTH} characters
- Last tweet should be a call to action or summary
- Be insightful and specific, not generic

Return ONLY a JSON array of ${tweetCount} strings. No explanation.`;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.85,
    max_tokens: 1200,
  });

  const content = response.choices[0].message.content.trim();
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const threadTweets = JSON.parse(cleaned);

  // Save as a single tweet with thread
  const tweet = await Tweet.create({
    text: threadTweets[0],
    topic,
    status: 'draft',
    sourceType: 'ai-generated',
    thread: threadTweets.slice(1).map((t, i) => ({ text: t, order: i + 1 })),
  });

  await ActionLog.create({
    action: 'tweet_generated',
    tweetId: tweet._id,
    details: `Generated thread of ${threadTweets.length} tweets for "${topic}"`,
  });

  return tweet;
}

/**
 * Generate one tweet per topic across all genres in a single API call.
 * Uses trends as context and strips em/en dashes.
 */
async function generateAllTopics() {
  // Grab top trends across all topics for context
  const trends = await TrendTweet.find()
    .sort({ 'engagement.likes': -1 })
    .limit(10)
    .lean();

  const trendContext = trends
    .slice(0, 10)
    .map((t, i) => `${i + 1}. [${t.keyword || 'general'}] "${t.text}" (${t.engagement.likes} likes)`)
    .join('\n');

  const topicList = TOPICS.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const prompt = `You are a sharp, multi-disciplinary thinker who posts on X (Twitter).
Your audience is builders, engineers, founders, investors, and curious generalists.

Generate exactly 1 tweet for EACH of these topics:
${topicList}

Style guidelines:
- Each tweet MUST be between 200 and ${MAX_TWEET_LENGTH} characters. Aim for 220-270 characters. Never write short one-liners.
- Make tweets detailed and substantial. Add context, examples, or a strong opinion to fill the space.
- No hashtags unless they add real value
- Sound authentic and opinionated, not like a bot
- NEVER use em dashes or en dashes (the long dash characters). Use commas, periods, or short hyphens instead.
- Use line breaks for readability when helpful
- Vary formats: hot takes, counterintuitive insights, data points, questions, predictions, lessons learned

Here are trending high-engagement tweets for inspiration (DO NOT copy, use as thematic context):
${trendContext || 'No trends available - generate original content.'}

Return ONLY a JSON array of objects with "topic" and "text" fields. No explanation, no markdown.
Example: [{"topic": "tech", "text": "tweet text here"}, ...]`;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
    max_tokens: 2000,
  });

  const content = response.choices[0].message.content.trim();

  let results;
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    results = JSON.parse(cleaned);
  } catch (err) {
    logger.error('Failed to parse AI response:', content);
    throw new Error('AI returned invalid JSON');
  }

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('AI returned empty or non-array response');
  }

  // Strip em/en dashes and validate
  results = results
    .filter((r) => r && typeof r.text === 'string' && r.text.length > 0)
    .map((r) => ({
      topic: r.topic,
      text: r.text.replace(/[\u2013\u2014]/g, '-').substring(0, MAX_TWEET_LENGTH),
    }));

  // Save all as drafts
  const savedTweets = [];
  for (const r of results) {
    const tweet = await Tweet.create({
      text: r.text,
      topic: r.topic,
      status: 'draft',
      sourceType: 'ai-generated',
    });
    savedTweets.push(tweet);
  }

  await ActionLog.create({
    action: 'tweet_generated',
    details: `Generated ${savedTweets.length} tweets across all topics`,
  });

  logger.info(`AI generated ${savedTweets.length} tweets across all topics`);
  return savedTweets;
}

module.exports = { generateTweets, generateThread, generateAllTopics };
