import app from './app.js';
import { initDatabase } from './config/database.js';
import { initCache } from './config/cache.js';
import { moodleContinuousSyncService } from './services/moodleContinuousSyncService.js';

const port = process.env.PORT || 4000;
await initDatabase();
await initCache();

// Start background continuous Moodle LMS sync poller
moodleContinuousSyncService.startPoller();

app.listen(port, () => console.log(`LearnForge API listening on http://localhost:${port}`));

