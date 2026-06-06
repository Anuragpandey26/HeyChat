/**
 * Simple utility to merge class names conditionally.
 * Combines active truthy class strings.
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
