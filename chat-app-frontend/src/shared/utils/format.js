import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import calendar from 'dayjs/plugin/calendar';

dayjs.extend(relativeTime);
dayjs.extend(calendar);

/**
 * Formats a message time (e.g. 10:30 AM, Yesterday, Monday)
 */
export function formatMessageTime(dateString) {
  if (!dateString) return '';
  const date = dayjs(dateString);
  return date.calendar(null, {
    sameDay: 'h:mm A',
    lastDay: '[Yesterday]',
    lastWeek: 'dddd',
    sameElse: 'DD/MM/YYYY',
  });
}

/**
 * Formats last seen time into a user friendly string.
 */
export function formatLastSeen(isOnline, lastSeenString) {
  if (isOnline) return 'online';
  if (!lastSeenString) return 'offline';
  
  const lastSeen = dayjs(lastSeenString);
  const now = dayjs();
  
  if (now.diff(lastSeen, 'minute') < 1) {
    return 'just now';
  }
  
  return `last seen ${lastSeen.calendar(null, {
    sameDay: '[today at] h:mm A',
    lastDay: '[yesterday at] h:mm A',
    lastWeek: '[on] dddd [at] h:mm A',
    sameElse: '[on] DD/MM/YYYY [at] h:mm A',
  })}`;
}

/**
 * Formats duration in seconds to MM:SS
 */
export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
