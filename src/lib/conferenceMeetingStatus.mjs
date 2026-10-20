export const MEETING_STATUS_KEYS = ['scheduled', 'completed', 'missed', 'rescheduled'];

export function nextMeetingStatus(status = 'scheduled') {
  const index = MEETING_STATUS_KEYS.indexOf(status);
  return MEETING_STATUS_KEYS[(index + 1) % MEETING_STATUS_KEYS.length];
}
