/**
 * Seed script: creates sample draft tweets for testing the dashboard.
 * Run with: npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Tweet = require('../models/Tweet');

const samples = [
  { text: "The best startup advice I ever got: ship something embarrassing, then listen.", topic: "startup" },
  { text: "Most engineers optimize for clean code.\n\nThe best engineers optimize for shipping speed without creating debt.", topic: "software-engineering" },
  { text: "AI won't replace developers.\n\nDevelopers who use AI will replace those who don't.", topic: "AI" },
  { text: "The semiconductor war between the US and China isn't about chips.\n\nIt's about who controls the 21st century economy.", topic: "geopolitics" },
  { text: "The Fed cutting rates while inflation is sticky is the macro equivalent of putting a band-aid on a broken leg.", topic: "finance" },
  { text: "Every SaaS founder should study retention before acquisition.\n\nA leaky bucket doesn't need more water — it needs fixing.", topic: "SaaS" },
  { text: "The most underrated skill in tech: knowing when NOT to build.\n\n90% of features should never ship.", topic: "tech" },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  for (const s of samples) {
    await Tweet.create({ ...s, status: 'draft', sourceType: 'manual' });
  }

  console.log(`Seeded ${samples.length} sample tweets`);
  await mongoose.disconnect();
}

seed().catch(console.error);
