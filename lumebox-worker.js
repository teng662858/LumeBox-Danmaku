import upstream from './danmu_api/worker.js';
import { findUrlById } from './danmu_api/utils/cache-util.js';
import { withStatelessEpisodes } from './tools/stateless-episodes.mjs';

export default withStatelessEpisodes(upstream, findUrlById);
