// Preview-only catalog. Change these entries, or supply an admin-owned
// AdventureMapDefinition with a new revision, to reuse the map for real work.
export const DEFAULT_MAP = {
  id: 'adventure-preview',
  revision: 'preview-1',
  title: 'The Learning Trail',
  sections: ['Meadow beginnings', 'Butterfly grove', 'Little river', 'Sunflower fields',
    'Woodland wonders', 'Rainbow crossing', 'Hidden garden', 'Sunny hills', 'Starry clearing', 'The great tree'],
  levels: Array.from({ length: 200 }, (_, i) => ({
    number: i + 1,
    title: `Level ${i + 1}`,
    description: 'Try this stop on the new learning trail. This is preview practice, not a real lesson.',
    destination: null,
    requirement: { type: 'preview_confirmation', label: 'I tried this practice stop' },
  })),
};
