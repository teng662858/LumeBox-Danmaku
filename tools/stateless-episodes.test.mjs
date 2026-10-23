import test from 'node:test';
import assert from 'node:assert/strict';
import { withStatelessEpisodes } from './stateless-episodes.mjs';

const env = { TOKEN: 'test-service-access-token-with-32-characters' };
const base = `https://worker.example/${env.TOKEN}/api/v2`;
const source = 'https://www.iqiyi.com/v_example.html?name=中文&episode=1';

async function searchId() {
  const searchIsolate = withStatelessEpisodes({
    fetch: async () => Response.json({ animes: [{ episodes: [{ episodeId: 10001, url: source }] }] }),
  });
  const result = await (await searchIsolate.fetch(new Request(`${base}/search/episodes?anime=test`), env)).json();
  return result.animes[0].episodes[0].episodeId;
}

test('search IDs load in a fresh isolate with the token path and comment options intact', async () => {
  const id = await searchId();
  assert.match(id, /^lb1\./);
  const commentIsolate = withStatelessEpisodes({ fetch: async (request) => {
    const url = new URL(request.url);
    assert.equal(url.pathname, `/${env.TOKEN}/api/v2/comment`);
    assert.equal(url.searchParams.get('url'), source);
    assert.equal(url.searchParams.get('format'), 'json');
    assert.equal(request.headers.get('user-agent'), 'LumeBox/1.0');
    return Response.json({ count: 1, comments: [{ p: '1,1,1,1', m: 'test' }] });
  }});
  const response = await commentIsolate.fetch(new Request(`${base}/comment/${id}?format=json`, { headers: {'user-agent': 'LumeBox/1.0'} }), env);
  assert.equal((await response.json()).count, 1);
});

test('forged and different-service IDs cannot reach upstream', async () => {
  const id = await searchId();
  const worker = withStatelessEpisodes({ fetch: async () => { throw new Error('Unexpected upstream request'); } });
  for (const [value, config] of [[id.replace('lb1.', 'lb1.A'), env], [id, {TOKEN: 'different-secret'}]]) {
    assert.equal((await worker.fetch(new Request(`${base}/comment/${value}`), config)).status, 404);
  }
});

test('legacy numeric IDs and upstream authentication failures pass through', async () => {
  let requested;
  const worker = withStatelessEpisodes({ fetch: async request => {
    requested = request.url;
    return Response.json({success:false}, {status:401});
  }});
  const url = `${base}/comment/10001`;
  assert.equal((await worker.fetch(new Request(url), env)).status, 401);
  assert.equal(requested, url);
});

test('cached episode records without URL use the search isolate resolver', async () => {
  const worker = withStatelessEpisodes({fetch:async()=>Response.json({animes:[{episodes:[{episodeId:10001}]}]})}, id => id === 10001 ? source : null);
  const result = await (await worker.fetch(new Request(`${base}/search/episodes`),env)).json();
  assert.match(result.animes[0].episodes[0].episodeId, /^lb1\./);
});
