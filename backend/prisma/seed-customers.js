import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';

// Creates or updates two fictional customers. It never deletes products or orders, so it is safe on a hosted database.
// Passwords come from the environment so they are never committed.
const customers = [
  { name: 'Test Customer One', email: 'test.customer.one@example.com', passwordVariable: 'TEST_CUSTOMER_ONE_PASSWORD' },
  { name: 'Test Customer Two', email: 'test.customer.two@example.com', passwordVariable: 'TEST_CUSTOMER_TWO_PASSWORD' }
];

const prisma = new PrismaClient();

async function main() {
  for (const { name, email, passwordVariable } of customers) {
    const password = process.env[passwordVariable];
    if (!password || password.length < 12) throw new Error(`Set ${passwordVariable} (at least 12 characters) before running this script.`);
    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({ where: { email }, create: { name, email, passwordHash }, update: { name, passwordHash } });
    console.log(`Test customer ready: ${email}`);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
