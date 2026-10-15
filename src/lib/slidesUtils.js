// Extract the Google Slides presentation ID from any Google Slides URL.
export function extractPresentationId(url) {
  if (!url) return '';
  const match = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

// Build the embed URL for a specific slide. Uses #slide=id.{slideId} to jump
// directly to that slide while preserving animations.
export function buildEmbedUrl(presentationId, slideId) {
  let url = `https://docs.google.com/presentation/d/${presentationId}/embed?start=false&loop=false`;
  if (slideId) url += `#slide=id.${slideId}`;
  return url;
}

// Generate a short 6-char room code for the actor connection.
export function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// School year start date — Monday of the first full week of school.
// For the 26-27 school year: August 17, 2026. Update this when the year starts.
export const SCHOOL_YEAR_START = new Date('2026-08-17');

// Calculate the current 9-week period and week number from the school year
// start date. Periods 1-3 have 9 weeks; period 4 has 11 (38 total).
export function getCurrentWeek() {
  const now = new Date();
  const diffDays = Math.floor((now - SCHOOL_YEAR_START) / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;

  if (weekNumber < 1) return { period: 1, week: 1 };
  if (weekNumber > 38) return { period: 4, week: 11 };
  if (weekNumber <= 9) return { period: 1, week: weekNumber };
  if (weekNumber <= 18) return { period: 2, week: weekNumber - 9 };
  if (weekNumber <= 27) return { period: 3, week: weekNumber - 18 };
  return { period: 4, week: weekNumber - 27 };
}

// Number of weeks in a given 9-week period (period 4 has 11).
export function getWeeksInPeriod(period) {
  return period === 4 ? 11 : 9;
}