import app from './app.js';
import { initDatabase } from './config/database.js';
import { initCache } from './config/cache.js';
const port = process.env.PORT || 4000;
await initDatabase();
await initCache();
app.listen(port, () => console.log(`LearnForge API listening on http://localhost:${port}`));
