const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ProjectsManager = require('../src/utils/projects-manager').constructor;

async function fixture(t, gitRepo = true) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vulkan-projects-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  if (gitRepo) execFileSync('git', ['init', '--quiet', dir]);
  await fs.mkdir(path.join(dir, 'example'));
  await fs.writeFile(path.join(dir, 'example/index.md'),
    '---\ntitle: Example\ngroup: [reliqlabs]\n---\nProject description.');
  const manager = new ProjectsManager();
  manager.projectsDir = dir;
  manager.repoUrl = 'https://github.com/example/portfolio.git';
  manager.gitToken = 'test-token-not-a-real-credential';
  return manager;
}

function fakeGit({ fetchError, pullError } = {}) {
  return {
    remoteCalls: [],
    async remote(args) { this.remoteCalls.push(args); },
    async fetch() { if (fetchError) throw fetchError; },
    async pull() { if (pullError) throw pullError; return { files: [] }; }
  };
}

test('startup serves saved projects before a failed fetch', async t => {
  const manager = await fixture(t);
  const git = fakeGit({ fetchError: new Error('Network unavailable') });
  manager.createGit = () => git;
  await manager.initialize();
  assert.equal(manager.cache.size, 1);
  assert.equal(manager.cache.get('example').title, 'Example');
  assert.ok(manager.cacheTimestamp);
  assert.deepEqual(git.remoteCalls, [['set-url', 'origin', manager.repoUrl]]);
});

test('startup serves saved projects when no repository is configured', async t => {
  const manager = await fixture(t);
  manager.repoUrl = undefined;
  manager.createGit = () => { throw new Error('Must not access Git'); };
  await manager.initialize();
  assert.equal(manager.cache.size, 1);
});

test('startup retains saved projects when first clone fails', async t => {
  const manager = await fixture(t, false);
  manager.cloneRepo = async url => {
    assert.equal(url, manager.repoUrl);
    assert.equal(url.includes(manager.gitToken), false);
    throw new Error('Authentication unavailable');
  };
  await manager.initialize();
  assert.equal(manager.cache.size, 1);
});

test('successful sync replaces the cache and removes old remote credentials', async t => {
  const manager = await fixture(t);
  manager.cache.set('removed-project', {});
  const git = fakeGit();
  manager.createGit = () => git;
  const result = await manager.syncProjects();
  assert.equal(result.success, true);
  assert.equal(manager.cache.has('removed-project'), false);
  assert.equal(manager.cache.size, 1);
  assert.deepEqual(git.remoteCalls, [['set-url', 'origin', manager.repoUrl]]);
});

test('failed pulls report failure and retain the saved cache', async t => {
  const manager = await fixture(t);
  await manager.loadProjects();
  const cache = manager.cache;
  manager.createGit = () => fakeGit({ pullError: new Error('Pull failed') });
  const result = await manager.syncProjects();
  assert.equal(result.success, false);
  assert.equal(manager.cache, cache);
  assert.equal(manager.cache.size, 1);
});

test('failed filesystem reload preserves the last good cache', async t => {
  const manager = await fixture(t);
  await manager.loadProjects();
  const cache = manager.cache;
  const timestamp = manager.cacheTimestamp;
  manager.projectsDir = path.join(manager.projectsDir, 'missing');
  await manager.loadProjects();
  assert.equal(manager.cache, cache);
  assert.equal(manager.cacheTimestamp, timestamp);
  assert.equal(manager.cache.size, 1);
});

test('authentication is passed through process-only Git configuration', async t => {
  const manager = await fixture(t);
  const git = manager.createGit(manager.projectsDir);
  const value = await git.raw(['config', '--get', 'http.https://github.com/.extraheader']);
  assert.equal(value.trim(), 'Authorization: Basic ' +
    Buffer.from(`x-access-token:${manager.gitToken}`).toString('base64'));
  assert.equal((await git.raw(['config', '--local', '--list'])).includes('extraheader'), false);
  assert.equal((await fs.readFile(path.join(manager.projectsDir, '.git/config'), 'utf8'))
    .includes(manager.gitToken), false);
  assert.equal(await git.raw(['rev-parse', '--is-inside-work-tree']).then(s => s.trim()), 'true');
});

test('public repository operations do not require a token', async t => {
  const manager = await fixture(t);
  manager.gitToken = undefined;
  const value = await manager.createGit(manager.projectsDir).raw(['rev-parse', '--is-inside-work-tree']);
  assert.equal(value.trim(), 'true');
});
