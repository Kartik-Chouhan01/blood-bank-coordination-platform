/**
 * Creates the first administrator (there is deliberately no public way to register as ADMIN).
 *
 *   npm run create-admin -w @bbms/backend -- --email admin@example.org --name "Site Admin"
 *
 * The password is read from ADMIN_PASSWORD, or generated and printed once.
 */
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { emailSchema, passwordSchema, personNameSchema } from '@bbms/shared';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { recordAudit } from '../src/modules/audit/audit.service.js';
import { SYSTEM_ACTOR } from '../src/utils/actor.js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' }, phone: { type: 'string' } },
});

const email = emailSchema.parse(values.email);
const name = personNameSchema.parse(values.name ?? 'Administrator');
const generated = !process.env.ADMIN_PASSWORD;
const password = passwordSchema.parse(
  process.env.ADMIN_PASSWORD ?? `${randomBytes(12).toString('base64url')}9a`,
);

await connectDatabase(env.MONGODB_URI);
try {
  if (await UserModel.exists({ email })) {
    console.error(`A user with email ${email} already exists.`);
    process.exitCode = 1;
  } else {
    const userId = new Types.ObjectId();
    await UserModel.create({
      _id: userId,
      name,
      email,
      phone: values.phone ?? '+000000000',
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
      emailVerified: true,
      consentAcceptedAt: new Date(),
    });
    await recordAudit(SYSTEM_ACTOR, {
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: userId,
      after: { role: 'ADMIN' },
      reason: 'Created with create-admin script',
    });
    console.log(`\nAdmin created: ${email}`);
    if (generated) {
      console.log(`Generated password (shown once — store it safely): ${password}\n`);
    }
  }
} finally {
  await disconnectDatabase();
}
