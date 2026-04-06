const path = require('path');
const dotenv = require('dotenv');

const ENV_CACHE_KEY = Symbol.for('app.env.load.result');

if (!globalThis[ENV_CACHE_KEY]) {
    const envPath = path.resolve(__dirname, '../../.env');
    globalThis[ENV_CACHE_KEY] = dotenv.config({ path: envPath, quiet: true });
}

module.exports = globalThis[ENV_CACHE_KEY];
