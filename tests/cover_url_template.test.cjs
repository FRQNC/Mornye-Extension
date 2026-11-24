const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(name) {
  const context = vm.createContext({
    registerExtension() {},
    log: { info() {}, warn() {}, error() {}, debug() {} },
  });
  vm.runInContext(fs.readFileSync(
    path.join(__dirname, `../sources/${name}/index.js`), 'utf8'
  ), context);
  return context;
}

// The template must keep "{size}" and, once filled, point at a real size.
const fill = (template, size) => template.replaceAll('{size}', String(size));

test('apple: template keeps the artwork path and only swaps the dimensions', () => {
  const apple = load('apple-music');
  const artwork = { url: 'https://example.test/img/abc/{w}x{h}bb.jpg', width: 3000, height: 3000 };
  assert.equal(apple.artworkTemplate(artwork), 'https://example.test/img/abc/{size}x{size}bb.jpg');
  // cover_url is unchanged, so downloads and tag embedding behave as before.
  assert.equal(apple.artworkURL(artwork), 'https://example.test/img/abc/3000x3000bb.jpg');
  assert.equal(fill(apple.artworkTemplate(artwork), 3000), apple.artworkURL(artwork));
});

test('apple: no template when the URL lacks both placeholders or artwork is missing', () => {
  const apple = load('apple-music');
  assert.equal(apple.artworkTemplate(null), '');
  assert.equal(apple.artworkTemplate({}), '');
  assert.equal(apple.artworkTemplate({ url: 'https://example.test/fixed.jpg' }), '');
  assert.equal(apple.artworkTemplate({ url: 'https://example.test/{w}.jpg' }), '');
});

test('apple: formatSong emits cover_url_template next to cover_url', () => {
  const apple = load('apple-music');
  const song = { id: '1', attributes: { name: 'S', artistName: 'A',
    artwork: { url: 'https://example.test/s/{w}x{h}bb.jpg', width: 1000, height: 1000 } } };
  const result = apple.formatSong(song, null, 0);
  assert.equal(result.cover_url, 'https://example.test/s/3000x3000bb.jpg');
  assert.equal(result.cover_url_template, 'https://example.test/s/{size}x{size}bb.jpg');
});

test('apple: formatSong template follows the album artwork when the song has none', () => {
  const apple = load('apple-music');
  const song = { id: '1', attributes: { name: 'S', artistName: 'A' } };
  const album = { id: '9', attributes: { name: 'Al',
    artwork: { url: 'https://example.test/al/{w}x{h}bb.jpg', width: 3000, height: 3000 } } };
  const result = apple.formatSong(song, album, 0);
  assert.equal(result.cover_url, 'https://example.test/al/3000x3000bb.jpg');
  assert.equal(result.cover_url_template, 'https://example.test/al/{size}x{size}bb.jpg');
});

test('deezer: template swaps the size segment and keeps the rest of the path', () => {
  const deezer = load('deezer');
  const url = 'https://cdn-images.dzcdn.net/images/cover/abc123/1400x1400-000000-80-0-0.jpg';
  assert.equal(deezer.deezerCoverTemplate(url),
    'https://cdn-images.dzcdn.net/images/cover/abc123/{size}x{size}-000000-80-0-0.jpg');
  assert.equal(fill(deezer.deezerCoverTemplate(url), 1400), url);
});

test('deezer: no template for non-Deezer or unrecognised URLs', () => {
  const deezer = load('deezer');
  assert.equal(deezer.deezerCoverTemplate(''), '');
  assert.equal(deezer.deezerCoverTemplate('https://example.test/1400x1400-0-0-0-0.jpg'), '');
  assert.equal(deezer.deezerCoverTemplate('https://cdn-images.dzcdn.net/images/cover/abc/cover.jpg'), '');
});

test('deezer: formatAlbum and formatPlaylist emit the template', () => {
  const deezer = load('deezer');
  const cover = 'https://cdn-images.dzcdn.net/images/cover/h/1000x1000-000000-80-0-0.jpg';
  const album = deezer.formatAlbum({ id: 5, title: 'T', artist: { id: 1, name: 'A' }, cover_xl: cover }, {});
  assert.match(album.cover_url, /\/1400x1400-/);
  assert.match(album.cover_url_template, /\/\{size\}x\{size\}-000000-80-0-0\.jpg$/);
  const playlist = deezer.formatPlaylist({ id: 7, title: 'P', picture_xl: cover, nb_tracks: 1 });
  assert.match(playlist.cover_url_template, /\/\{size\}x\{size\}-/);
});

test('tidal: template reuses imageURL so only the size segment differs', () => {
  const tidal = load('tidal-web');
  const id = 'aaaa-bbbb-cccc-dddd';
  const template = tidal.imageTemplate(id);
  assert.match(template, /\/images\/aaaa\/bbbb\/cccc\/dddd\/\{size\}x\{size\}\.jpg$/);
  assert.equal(fill(template, 1280), tidal.imageURL(id, '1280x1280'));
  assert.equal(tidal.imageTemplate(''), '');
});

test('tidal: formatAlbumInfo emits cover_url_template, formatPlaylistInfo too', () => {
  const tidal = load('tidal-web');
  const album = tidal.formatAlbumInfo({ id: 1, title: 'T', cover: 'aa-bb-cc', artists: [{ id: 2, name: 'A' }] }, '');
  assert.match(album.cover_url, /1280x1280\.jpg$/);
  assert.match(album.cover_url_template, /\/\{size\}x\{size\}\.jpg$/);
  const playlist = tidal.formatPlaylistInfo({ uuid: 'u', title: 'P', squareImage: 'aa-bb-cc' });
  assert.match(playlist.cover_url_template, /\/\{size\}x\{size\}\.jpg$/);
});

function loadAmazon() {
  const context = vm.createContext({
    URL, URLSearchParams,
    registerExtension() {},
    log: { info() {}, debug() {}, warn() {}, error() {} },
    utils: { isDownloadCancelled: () => false, sleep: () => true },
  });
  vm.runInContext(fs.readFileSync(
    path.join(__dirname, '../sources/amazon/index.js'), 'utf8'
  ), context);
  return context;
}

test('amazon: template adds the size token and drops any existing sizing', () => {
  const amazon = loadAmazon();
  const master = 'https://m.media-amazon.com/images/I/71AbCdEfGhL.jpg';
  assert.equal(amazon.amazonCoverTemplate(master),
    'https://m.media-amazon.com/images/I/71AbCdEfGhL._SL{size}_.jpg');
  // An already-sized URL is cleaned first, so the old size never leaks in.
  assert.equal(amazon.amazonCoverTemplate('https://m.media-amazon.com/images/I/71AbCdEfGhL._SX300_.jpg'),
    'https://m.media-amazon.com/images/I/71AbCdEfGhL._SL{size}_.jpg');
  assert.equal(fill(amazon.amazonCoverTemplate(master), 1000),
    'https://m.media-amazon.com/images/I/71AbCdEfGhL._SL1000_.jpg');
  // cover_url itself is unchanged: still the unsized master.
  assert.equal(amazon.ensureHighResCoverUrl('https://m.media-amazon.com/images/I/71AbCdEfGhL._SX300_.jpg'), master);
});

test('amazon: keeps a query string and extension case', () => {
  const amazon = loadAmazon();
  assert.equal(amazon.amazonCoverTemplate('https://m.media-amazon.com/images/I/abc.png?x=1'),
    'https://m.media-amazon.com/images/I/abc._SL{size}_.png?x=1');
});

test('amazon: no template for other hosts, empty input or non-image URLs', () => {
  const amazon = loadAmazon();
  assert.equal(amazon.amazonCoverTemplate(''), '');
  assert.equal(amazon.amazonCoverTemplate(null), '');
  assert.equal(amazon.amazonCoverTemplate('https://example.test/images/I/abc.jpg'), '');
  assert.equal(amazon.amazonCoverTemplate('https://m.media-amazon.com/images/I/abc'), '');
  assert.equal(amazon.amazonCoverTemplate('https://evil.test/m.media-amazon.com/x/abc.jpg'), '');
});
