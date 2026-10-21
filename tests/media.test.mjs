import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageKey, mergeMedia } from '../src/media.js';

const photo = (id, order = null) => ({ kind: 'image', key: imageKey(`https://pbs.twimg.com/media/${id}.jpg`), src: `https://pbs.twimg.com/media/${id}.jpg`, ownerId: '123', order, alt: '' });

test('uses the same image identity for resized and reformatted renditions', () => {
  assert.equal(imageKey('https://pbs.twimg.com/media/a.jpg'), imageKey('https://pbs.twimg.com/media/a?format=webp&name=large'));
  assert.notEqual(imageKey('https://pbs.twimg.com/media/a.jpg'), imageKey('https://pbs.twimg.com/media/b.jpg'));
});

test('retains media across empty and partial observations without mutating earlier snapshots', () => {
  const previous = [photo('a'), photo('b')];
  const updated = mergeMedia(previous, [photo('b')]);
  assert.deepEqual(updated, previous);
  assert.deepEqual(mergeMedia(previous, []), previous);
  assert.notEqual(updated[0], previous[0]);
  assert.equal(previous.length, 2);
});

test('preserves first-seen order until all photo positions are explicitly known', () => {
  const previous = [photo('b')];
  const partial = mergeMedia(previous, [photo('a', 1)]);
  assert.deepEqual(partial.map((media) => media.key), [photo('b').key, photo('a').key]);
  const ordered = mergeMedia(partial, [photo('b', 2)]);
  assert.deepEqual(ordered.map((media) => media.order), [1, 2]);
});

test('fills late video metadata without losing playable sources or creating duplicate videos', () => {
  const video = { kind: 'video', key: 'video:1', ownerId: '123', src: null, poster: null, alt: '' };
  const loaded = mergeMedia([video], [{ ...video, src: 'https://video.twimg.com/a.mp4', poster: 'https://pbs.twimg.com/media/a.jpg' }]);
  const partial = mergeMedia(loaded, [video]);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].src, 'https://video.twimg.com/a.mp4');
  assert.equal(partial[0].poster, 'https://pbs.twimg.com/media/a.jpg');
  assert.equal(video.src, null);
});
