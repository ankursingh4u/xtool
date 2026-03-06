/**
 * Returns a random delay in ms between min and max seconds.
 * Used throughout the app to mimic human behavior.
 */
function randomDelay(minSec, maxSec) {
  const min = (minSec || Number(process.env.MIN_DELAY_SECONDS) || 60) * 1000;
  const max = (maxSec || Number(process.env.MAX_DELAY_SECONDS) || 300) * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { randomDelay, sleep };
