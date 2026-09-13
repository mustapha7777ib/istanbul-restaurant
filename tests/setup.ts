import "dotenv/config";

// Point every test at the disposable test database, before anything imports the client.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// Never send real Web Push notifications from tests.
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-123";
