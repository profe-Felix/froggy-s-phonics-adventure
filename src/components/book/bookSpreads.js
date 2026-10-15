export function bookSpreadStart(page, firstPair = 1) {
  return page < firstPair ? page : firstPair + Math.floor((page - firstPair) / 2) * 2;
}

export function bookSpreadPages(page, totalPages, twoUp, firstPair = 1) {
  return twoUp && page >= firstPair && page < totalPages ? [page, page + 1] : [page];
}

export function previousBookPage(page, twoUp, firstPair = 1) {
  return Math.max(1, twoUp && page > firstPair ? Math.max(firstPair, page - 2) : page - 1);
}