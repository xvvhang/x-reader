// Media identity and merging are independent of native DOM node lifetimes.
export function imageKey(src) {
  const image = new URL(src);
  if (image.hostname === 'pbs.twimg.com' && image.pathname.startsWith('/media/')) {
    return `image:${image.hostname}${image.pathname.replace(/\.(?:jpe?g|png|webp|gif)$/i, '')}`;
  }
  image.searchParams.delete('name');
  image.searchParams.delete('format');
  return `image:${image.href}`;
}

export function mergeMedia(previous = [], incoming = []) {
  const entries = new Map();
  for (const media of [...previous, ...incoming]) {
    const key = media.key || (media.kind === 'image' ? imageKey(media.src) : `video:${media.poster || media.src || '1'}`);
    const old = entries.get(key);
    // A DOM observation can add information, but absence is not evidence of deletion.
    const fields = Object.fromEntries(Object.entries(media).filter(([, value]) => value !== null && value !== undefined && value !== ''));
    const merged = { ...old, ...fields, key };
    merged.alt ||= '';
    merged.order ??= null;
    merged.ownerId ??= null;
    for (const name of ['src', 'poster']) if (merged[name] == null && media[name] !== undefined) merged[name] = media[name];
    entries.set(key, merged);
  }
  const result = Array.from(entries.values());
  // Only explicit photo/video positions are authoritative. Otherwise retain discovery order.
  if (result.every((media) => Number.isInteger(media.order))) result.sort((a, b) => a.order - b.order);
  return result;
}
