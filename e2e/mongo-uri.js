// The browser tests reset and fill their own database (church-system-e2e), on
// the same server as APOS_MONGODB_URI, never the database that variable names.
// The app, and the script that adds the admin, must both use this address.
function e2eMongoUri() {
  const base = process.env.APOS_MONGODB_URI || 'mongodb://localhost:27017/x';
  const url = new URL(base);
  url.pathname = '/church-system-e2e';
  return url.toString();
}

module.exports = { e2eMongoUri };
