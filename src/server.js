// Server entry point and port listener
require('./config/load-env');
const connectDB = require('./config/db');
const app = require('./app');

app.locals.formatCurrency = function (value) {
    const amount = Number(value || 0);
    return `₹ ${amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
};

const PORT = process.env.PORT || 5000;
const SERVER_STATE_KEY = Symbol.for('app.server.state');

if (!globalThis[SERVER_STATE_KEY]) {
    globalThis[SERVER_STATE_KEY] = {
        serverInstance: null,
        startPromise: null
    };
}

const serverState = globalThis[SERVER_STATE_KEY];

const startServer = async () => {
    if (serverState.serverInstance) {
        return serverState.serverInstance;
    }

    if (serverState.startPromise) {
        return serverState.startPromise;
    }

    serverState.startPromise = (async () => {
        await connectDB();

        await new Promise((resolve, reject) => {
            const listeningServer = app.listen(PORT, () => {
                serverState.serverInstance = listeningServer;
                console.log(`Server running on port ${PORT}`);
                resolve();
            });

            listeningServer.once('error', (error) => {
                serverState.serverInstance = null;
                serverState.startPromise = null;
                reject(error);
            });

            listeningServer.once('close', () => {
                serverState.serverInstance = null;
                serverState.startPromise = null;
            });
        });

        return serverState.serverInstance;
    })();

    return serverState.startPromise;
};

if (require.main === module) {
    startServer();
}

module.exports = {
    startServer
};
