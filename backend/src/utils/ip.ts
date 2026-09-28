import { isIPv4, isIPv6 } from 'node:net';

/**
 * Coarsens an IP address before storage (IPv4 → /24, IPv6 → /48): enough to spot abuse
 * patterns in audit logs without keeping a precise personal identifier.
 */
export function truncateIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const address = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (isIPv4(address)) return address.split('.').slice(0, 3).concat('0').join('.');
  if (isIPv6(address)) {
    const [head = ''] = address.split('::');
    const groups = head.split(':').filter(Boolean).slice(0, 3);
    return `${groups.join(':')}::`;
  }
  return undefined;
}
