import DB from '../shared/db';

// Kinto http needs fetch on the global scope.
global.fetch = require('node-fetch');

const username = 'admin';
const password = 'password';

function run() {
  const db = new DB(username, password);
  db.initDB()
    .then(console.log.bind(console, 'database initialized'))
    .catch(console.error.bind(console));
}

run();