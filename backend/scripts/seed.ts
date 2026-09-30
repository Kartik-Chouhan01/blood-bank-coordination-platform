/**
 * Demo data for local development and demos. NEVER for production (refuses to run there).
 *
 *   npm run seed -w @bbms/backend              # into an empty database
 *   npm run seed -w @bbms/backend -- --reset   # drop the configured database first
 *
 * The current state (accounts, verification, stock, requests at every stage, reservations,
 * donor outreach, notifications) is created through the application's own services, so it obeys
 * every rule and produces real audit entries. Closed history for the analytics page (60 days of
 * donations, issues and expiries) is inserted directly with past dates.
 *
 * All accounts share one password: SEED_PASSWORD, or a generated one printed once at the end.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import mongoose, { Types } from 'mongoose';
import {
  passwordSchema,
  type BloodGroup,
  type ComponentType,
  type Role,
  type Urgency,
} from '@bbms/shared';
import { env, isProduction } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { InMemoryMailAdapter, setMailAdapter } from '../src/infrastructure/mail/mailer.js';
import { hashPassword } from '../src/modules/auth/password.js';
import * as auth from '../src/modules/auth/auth.service.js';
import { BloodBankModel } from '../src/modules/bloodBanks/bloodBank.model.js';
import * as donors from '../src/modules/donors/donors.service.js';
import { DonorProfileModel } from '../src/modules/donors/donorProfile.model.js';
import * as hospitals from '../src/modules/hospitals/hospitals.service.js';
import { HospitalModel } from '../src/modules/hospitals/hospital.model.js';
import * as donations from '../src/modules/inventory/donations.service.js';
import * as allocations from '../src/modules/matching/allocations.service.js';
import { AllocationModel } from '../src/modules/matching/allocation.model.js';
import * as matching from '../src/modules/matching/donorMatching.service.js';
import * as outreach from '../src/modules/matching/outreach.service.js';
import * as requests from '../src/modules/requests/requests.service.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { refreshSettings } from '../src/modules/settings/settings.service.js';
import type { Actor } from '../src/utils/actor.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const DOMAIN = 'digirakt.test';

const { values: args } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });

if (isProduction) {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

const password = passwordSchema.parse(
  process.env.SEED_PASSWORD ?? `Demo-${randomBytes(9).toString('base64url')}7`,
);
const generatedPassword = !process.env.SEED_PASSWORD;

// Deterministic "randomness" so every seed produces the same demo.
let state = 20260930;
const rand = () => (state = (state * 48271) % 2147483647) / 2147483647;
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;

// Realistic Indian blood-group distribution (approximate), used for donors.
const GROUP_WEIGHTS: [BloodGroup, number][] = [
  ['O+', 36],
  ['B+', 31],
  ['A+', 21],
  ['AB+', 7],
  ['O-', 2],
  ['B-', 1.5],
  ['A-', 1],
  ['AB-', 0.5],
];
const weightedGroup = () => {
  let r = rand() * 100;
  for (const [group, weight] of GROUP_WEIGHTS) if ((r -= weight) <= 0) return group;
  return 'O+';
};

const CITIES = {
  Pune: {
    point: [73.8567, 18.5204] as [number, number],
    areas: ['Kothrud', 'Baner', 'Aundh', 'Hadapsar', 'Viman Nagar', 'Hinjawadi'],
  },
  Mumbai: {
    point: [72.8777, 19.076] as [number, number],
    areas: ['Andheri', 'Bandra', 'Dadar', 'Powai', 'Borivali', 'Chembur'],
  },
};
const FIRST = [
  'Aarav',
  'Diya',
  'Kabir',
  'Ananya',
  'Rohan',
  'Isha',
  'Vihaan',
  'Meera',
  'Arjun',
  'Sara',
  'Aditya',
  'Kavya',
  'Reyansh',
  'Nisha',
  'Dev',
  'Priya',
  'Karan',
  'Riya',
  'Siddharth',
  'Tara',
];
const LAST = [
  'Sharma',
  'Patil',
  'Deshmukh',
  'Iyer',
  'Kulkarni',
  'Nair',
  'Joshi',
  'Mehta',
  'Rao',
  'Khan',
  'Gupta',
  'Menon',
];

const ctx = { userAgent: 'seed-script' };
const started = Date.now();
const step = (label: string) =>
  console.log(`  [${((Date.now() - started) / 1000).toFixed(1)}s] ${label}`);
const actorFor = (
  userId: Types.ObjectId,
  role: Role,
  bloodBankId: Types.ObjectId | null = null,
): Actor => ({
  userId,
  role,
  bloodBankId,
  requestId: 'seed',
});

async function main() {
  await connectDatabase(env.MONGODB_URI);
  const db = mongoose.connection.db!;
  if (args.reset) {
    console.log(`Removing all data from "${db.databaseName}"…`);
    // Collections one by one: right after dropDatabase MongoDB may still refuse to create the
    // collections and indexes the seed needs ("database is in the process of being dropped").
    for (const collection of await db.collections()) await collection.drop();
  } else if (await UserModel.exists({})) {
    console.error(
      `Database "${db.databaseName}" already has users. Re-run with --reset to replace it with demo data.`,
    );
    process.exit(1);
  }
  // createIndexes, not init(): init() is cached per process and would not rebuild dropped indexes.
  await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));
  await refreshSettings();
  // Demo emails are not sent anywhere.
  setMailAdapter(new InMemoryMailAdapter());
  const passwordHash = await hashPassword(password);
  const accounts: { role: string; email: string; note: string }[] = [];

  step('Blood banks and staff');
  // ─── Organisations and staff ──────────────────────────────────────────────
  const banks = await BloodBankModel.create([
    {
      name: 'Pune Central Blood Bank',
      code: 'PCB',
      address: {
        line1: '12 Station Road',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
      },
      location: { type: 'Point', coordinates: CITIES.Pune.point },
      contactPhone: '+91 20 2612 0000',
      contactEmail: `pcb@${DOMAIN}`,
    },
    {
      name: 'Mumbai West Blood Bank',
      code: 'MWB',
      address: { line1: '4 Link Road', city: 'Mumbai', state: 'Maharashtra', postalCode: '400053' },
      location: { type: 'Point', coordinates: CITIES.Mumbai.point },
      contactPhone: '+91 22 2630 0000',
      contactEmail: `mwb@${DOMAIN}`,
    },
  ]);
  const [pune, mumbai] = banks as [(typeof banks)[number], (typeof banks)[number]];

  const staffUser = (email: string, name: string, role: Role, bloodBankId: Types.ObjectId | null) =>
    UserModel.create({
      name,
      email,
      phone: '+91 90000 00000',
      passwordHash,
      role,
      emailVerified: true,
      bloodBankId,
      consentAcceptedAt: new Date(),
    });
  const admin = await staffUser(`admin@${DOMAIN}`, 'Anita Admin', 'ADMIN', null);
  const punePerson = await staffUser(
    `staff.pune@${DOMAIN}`,
    'Sunil Kulkarni',
    'BLOOD_BANK_STAFF',
    pune._id,
  );
  const mumbaiPerson = await staffUser(
    `staff.mumbai@${DOMAIN}`,
    'Farah Khan',
    'BLOOD_BANK_STAFF',
    mumbai._id,
  );
  accounts.push(
    { role: 'Administrator', email: admin.email, note: 'settings, verification, audit log' },
    { role: 'Staff (Pune)', email: punePerson.email, note: 'queue, inventory, allocation' },
    {
      role: 'Staff (Mumbai)',
      email: mumbaiPerson.email,
      note: 'another bank (read-only on Pune stock)',
    },
  );
  const adminActor = actorFor(admin._id, 'ADMIN');
  const puneStaff = actorFor(punePerson._id, 'BLOOD_BANK_STAFF', pune._id);
  const mumbaiStaff = actorFor(mumbaiPerson._id, 'BLOOD_BANK_STAFF', mumbai._id);

  step('Hospitals');
  // ─── Hospitals (registered and verified through the real flows) ───────────
  const hospitalSpecs = [
    { key: 'citygeneral', name: 'City General Hospital', city: 'Pune' as const, verify: true },
    { key: 'sahyadri', name: 'Sahyadri Care Hospital', city: 'Pune' as const, verify: true },
    { key: 'riverside', name: 'Riverside Hospital', city: 'Mumbai' as const, verify: true },
    { key: 'newlife', name: 'New Life Clinic', city: 'Mumbai' as const, verify: false },
  ];
  const hospitalActors: Record<string, Actor> = {};
  const hospitalIds: Types.ObjectId[] = [];
  for (const [i, spec] of hospitalSpecs.entries()) {
    const email = `${spec.key}@${DOMAIN}`;
    const session = await auth.registerHospital(
      {
        name: `${pick(FIRST)} ${pick(LAST)}`,
        email,
        phone: `+91 98${String(20000000 + i).padStart(8, '0')}`,
        password,
        consent: true,
        hospitalName: spec.name,
        registrationNumber: `MH/${spec.city.slice(0, 3).toUpperCase()}/${1000 + i}`,
        address: {
          line1: `${10 + i} Hospital Road`,
          city: spec.city,
          state: 'Maharashtra',
          postalCode: spec.city === 'Pune' ? '411004' : '400050',
        },
      },
      ctx,
    );
    const userId = new Types.ObjectId(session.response.user.id);
    await UserModel.updateOne({ _id: userId }, { $set: { emailVerified: true } });
    const hospital = await HospitalModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          location: {
            type: 'Point',
            coordinates: [
              CITIES[spec.city].point[0] + 0.02 * i,
              CITIES[spec.city].point[1] - 0.01 * i,
            ],
          },
        },
      },
      { returnDocument: 'after' },
    ).lean();
    if (spec.verify) {
      await hospitals.updateHospitalVerification(adminActor, hospital!._id.toString(), {
        status: 'VERIFIED',
      });
    }
    hospitalActors[spec.key] = actorFor(userId, 'HOSPITAL');
    hospitalIds.push(hospital!._id);
    accounts.push({
      role: spec.verify ? 'Hospital' : 'Hospital (awaiting verification)',
      email,
      note: spec.name,
    });
  }

  step('Donors');
  // ─── Donors ───────────────────────────────────────────────────────────────
  interface SeedDonor {
    profileId: Types.ObjectId;
    userId: Types.ObjectId;
    bloodGroup: BloodGroup;
    city: 'Pune' | 'Mumbai';
  }
  const donorList: SeedDonor[] = [];
  for (let i = 1; i <= 48; i += 1) {
    const city = i % 3 === 0 ? 'Mumbai' : 'Pune';
    const bloodGroup = i === 1 ? 'O-' : i === 2 ? 'A+' : weightedGroup();
    const email = `donor${String(i).padStart(2, '0')}@${DOMAIN}`;
    const session = await auth.registerDonor(
      {
        name: `${pick(FIRST)} ${pick(LAST)}`,
        email,
        phone: `+91 97${String(30000000 + i).padStart(8, '0')}`,
        password,
        consent: true,
        bloodGroup,
        dateOfBirth: `${1970 + Math.floor(rand() * 32)}-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}`,
        city,
        area: pick(CITIES[city].areas),
      },
      ctx,
    );
    const userId = new Types.ObjectId(session.response.user.id);
    await UserModel.updateOne({ _id: userId }, { $set: { emailVerified: true } });
    const [lng, lat] = CITIES[city].point;
    const profile = await DonorProfileModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          // ≈1 km precision, spread up to ~15 km around the city centre.
          'location.point': {
            type: 'Point',
            coordinates: [
              Math.round((lng + (rand() - 0.5) * 0.25) * 100) / 100,
              Math.round((lat + (rand() - 0.5) * 0.25) * 100) / 100,
            ],
          },
        },
      },
      { returnDocument: 'after' },
    ).lean();
    const verify = i <= 42 ? 'VERIFIED' : null; // a few stay pending for the verification queue
    if (verify) {
      await donors.updateDonorVerification(
        city === 'Pune' ? puneStaff : mumbaiStaff,
        profile!._id.toString(),
        {
          status: 'VERIFIED',
        },
      );
    }
    const donorActor = actorFor(userId, 'DONOR');
    if (i % 11 === 0) {
      await donors.updateOwnAvailability(donorActor, {
        status: 'TEMPORARILY_UNAVAILABLE',
        availableAgainAt: new Date(Date.now() + 20 * DAY).toISOString().slice(0, 10),
      });
    }
    if (i % 17 === 0) await donors.updateOwnAvailability(donorActor, { status: 'DO_NOT_CONTACT' });
    donorList.push({ profileId: profile!._id, userId, bloodGroup, city });
    if (i <= 2) {
      accounts.push({ role: 'Donor', email, note: `${bloodGroup}, ${city}` });
    }
  }

  step('Donations and testing');
  // ─── Current stock: donations recorded, tested and released via services ──
  const tested = donorList.filter((_, i) => i < 36);
  for (const [i, d] of tested.entries()) {
    const staff = d.city === 'Pune' ? puneStaff : mumbaiStaff;
    const donation = await donations.recordDonation(staff, {
      donorId: d.profileId.toString(),
      collectedAt: new Date(Date.now() - (1 + (i % 6)) * DAY - i * HOUR).toISOString(),
      donationType: 'WHOLE_BLOOD',
      volumeMl: 450,
      components: i % 4 === 0 ? ['PRBC', 'PLASMA', 'PLATELETS'] : ['PRBC', 'PLASMA'],
      storageLocation: `Fridge ${1 + (i % 4)}`,
    });
    if (i >= 33) continue; // a few collected donations are still waiting to be tested
    await donations.startTesting(staff, donation.id);
    if (i === 32) continue; // one batch under testing
    await donations.recordTestResult(
      staff,
      donation.id,
      i === 31
        ? { result: 'FAILED', note: 'Reactive screening result; sent for confirmatory testing' }
        : { result: 'PASSED', bloodGroup: d.bloodGroup },
    );
  }

  step('Requests, allocation and outreach');
  // ─── Requests at every stage ──────────────────────────────────────────────
  const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();
  const raise = (
    hospitalKey: string,
    bloodGroup: BloodGroup,
    unitsRequested: number,
    urgency: Urgency,
    hours: number,
    componentType: ComponentType = 'PRBC',
  ) =>
    requests.createRequest(hospitalActors[hospitalKey]!, {
      bloodGroup,
      componentType,
      unitsRequested,
      urgency,
      requiredBy: inHours(hours),
      reasonCategory:
        urgency === 'EMERGENCY'
          ? 'EMERGENCY_CARE'
          : pick(['SCHEDULED_PROCEDURE', 'MATERNITY', 'ONGOING_TREATMENT'] as const),
      hospitalReference: `ORD-${Math.floor(1000 + rand() * 8999)}`,
    });
  const approve = (id: string) => requests.reviewRequest(puneStaff, id, { decision: 'APPROVE' });
  const reserveBest = async (id: string, count: number, staff = puneStaff) => {
    const candidates = await allocations.getInventoryCandidates(staff, id);
    const ids = candidates.preselectedUnitIds.slice(0, count);
    if (ids.length) await allocations.reserveUnits(staff, id, { unitIds: ids });
    return ids.length;
  };
  const issueAll = async (id: string, staff = puneStaff) => {
    for (const a of await AllocationModel.find({ requestId: id, status: 'RESERVED' }).lean()) {
      await allocations.issueAllocation(staff, a._id.toString());
    }
  };

  await raise('citygeneral', 'B+', 2, 'ROUTINE', 48); // pending review
  await raise('sahyadri', 'A+', 1, 'URGENT', 20); // pending review, urgent

  const partial = await raise('citygeneral', 'O+', 4, 'URGENT', 30);
  await approve(partial.id);
  await reserveBest(partial.id, 2); // partially allocated

  const toFulfil = await raise('sahyadri', 'O+', 2, 'ROUTINE', 36);
  await approve(toFulfil.id);
  await reserveBest(toFulfil.id, 2);
  await issueAll(toFulfil.id); // fulfilled, awaiting the hospital's receipt

  const toComplete = await raise('citygeneral', 'B+', 1, 'URGENT', 12);
  await approve(toComplete.id);
  await reserveBest(toComplete.id, 1);
  await issueAll(toComplete.id);
  await requests.confirmReceipt(hospitalActors.citygeneral!, toComplete.id); // completed

  const rejected = await raise('riverside', 'AB+', 2, 'ROUTINE', 72, 'PLASMA');
  await requests.reviewRequest(mumbaiStaff, rejected.id, {
    decision: 'REJECT',
    reason: 'Duplicate of an earlier request for the same procedure',
  });
  const cancelled = await raise('riverside', 'A+', 1, 'ROUTINE', 60);
  await requests.cancelRequest(hospitalActors.riverside!, cancelled.id, {
    reason: 'Procedure rescheduled',
  });

  // An emergency the stock cannot cover: auto-approved, donors contacted automatically.
  const emergency = await raise('citygeneral', 'O-', 3, 'EMERGENCY', 6);
  await reserveBest(emergency.id, 3);

  // Staff contact donors for the partial request; one replies that they can help.
  const partialCandidates = await matching.findDonorCandidates(partial.id);
  const chosen = partialCandidates.candidates.slice(0, 4).map((c) => c.donorId);
  if (chosen.length) {
    await matching.startOutreach(puneStaff, partial.id, { donorIds: chosen });
    const firstDonor = donorList.find((d) => d.profileId.toString() === chosen[0]);
    if (firstDonor) {
      const mine = await outreach.listOwnOutreach(actorFor(firstDonor.userId, 'DONOR'));
      if (mine[0]) {
        await outreach.respondToOutreach(actorFor(firstDonor.userId, 'DONOR'), mine[0].id, {
          response: 'INTERESTED',
        });
      }
    }
  }

  step('History for analytics');
  // ─── History for analytics (closed records, inserted with past dates) ──────
  const history = await seedHistory(db, {
    banks: [pune._id, mumbai._id],
    hospitals: hospitalIds.slice(0, 3),
    staffIds: [punePerson._id, mumbaiPerson._id],
    hospitalUserIds: Object.values(hospitalActors).map((a) => a.userId!),
    donorIds: donorList.map((d) => d.profileId),
  });

  await disconnectDatabase();
  printSummary(accounts, history);
}

async function seedHistory(
  db: mongoose.mongo.Db,
  refs: {
    banks: Types.ObjectId[];
    hospitals: Types.ObjectId[];
    staffIds: Types.ObjectId[];
    hospitalUserIds: Types.ObjectId[];
    donorIds: Types.ObjectId[];
  },
) {
  const now = Date.now();
  const units: object[] = [];
  const reqs: object[] = [];
  const allocs: object[] = [];
  const dons: object[] = [];
  let unitSeq = 0;
  let reqSeq = 0;

  const unit = (
    bank: Types.ObjectId,
    group: BloodGroup,
    status: string,
    collected: number,
    expiry: number,
    history: object[],
  ) => {
    const _id = new Types.ObjectId();
    unitSeq += 1;
    units.push({
      _id,
      unitCode: `HIST-${String(unitSeq).padStart(5, '0')}`,
      donationId: new Types.ObjectId(),
      donorId: pick(refs.donorIds),
      bloodBankId: bank,
      bloodGroup: group,
      componentType: 'PRBC',
      volumeMl: null,
      collectedAt: new Date(collected),
      expiryDate: new Date(expiry),
      storageLocation: null,
      status,
      testingStatus: 'PASSED',
      currentAllocationId: null,
      statusHistory: history,
      createdAt: new Date(collected),
      updatedAt: new Date(collected),
    });
    return _id;
  };

  for (let d = 60; d >= 2; d -= 1) {
    const day = now - d * DAY;
    for (let i = 0; i < 2 + Math.floor(rand() * 4); i += 1) {
      const bank = pick(refs.banks);
      dons.push({
        donorId: pick(refs.donorIds),
        bloodBankId: bank,
        collectedAt: new Date(day - rand() * 8 * HOUR),
        collectedBy: pick(refs.staffIds),
        donationType: 'WHOLE_BLOOD',
        volumeMl: 450,
        testingStatus: 'PASSED',
        testedAt: new Date(day),
        testedBy: pick(refs.staffIds),
        testedBloodGroup: weightedGroup(),
        testNote: null,
        notes: null,
        createdAt: new Date(day),
        updatedAt: new Date(day),
      });
    }
    if (rand() < 0.3) {
      const at = new Date(day - 3 * HOUR);
      unit(pick(refs.banks), weightedGroup(), 'EXPIRED', day - 42 * DAY, at.getTime(), [
        {
          from: 'AVAILABLE',
          to: 'EXPIRED',
          at,
          by: null,
          reason: 'Reached expiry date',
          override: false,
        },
      ]);
    }
    for (let i = 0; i < 1 + Math.floor(rand() * 3); i += 1) {
      const created = new Date(day - rand() * 10 * HOUR);
      const urgency = pick(['ROUTINE', 'ROUTINE', 'URGENT', 'EMERGENCY'] as const);
      const group = weightedGroup();
      const n = 1 + Math.floor(rand() * 3);
      const outcome = pick([
        'COMPLETED',
        'COMPLETED',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED',
        'REJECTED',
      ] as const);
      const hours = urgency === 'EMERGENCY' ? 0.5 + rand() * 2.5 : 3 + rand() * 24;
      const fulfilledAt = new Date(created.getTime() + hours * HOUR);
      const receivedAt = new Date(fulfilledAt.getTime() + 2 * HOUR);
      const staffId = pick(refs.staffIds);
      const hospitalIndex = Math.floor(rand() * refs.hospitals.length);
      const _id = new Types.ObjectId();
      const statusHistory: object[] = [
        {
          from: null,
          to: 'PENDING',
          at: created,
          by: refs.hospitalUserIds[hospitalIndex],
          reason: null,
        },
      ];
      if (outcome === 'REJECTED') {
        statusHistory.push({
          from: 'PENDING',
          to: 'REJECTED',
          at: new Date(created.getTime() + HOUR),
          by: staffId,
          reason: 'Insufficient details',
        });
      } else {
        statusHistory.push({
          from: 'PENDING',
          to: 'APPROVED',
          at: new Date(created.getTime() + 0.2 * HOUR),
          by: staffId,
          reason: null,
        });
      }
      if (outcome === 'COMPLETED') {
        statusHistory.push(
          {
            from: 'APPROVED',
            to: 'ALLOCATED',
            at: new Date(fulfilledAt.getTime() - HOUR),
            by: staffId,
            reason: null,
          },
          { from: 'ALLOCATED', to: 'FULFILLED', at: fulfilledAt, by: staffId, reason: null },
          {
            from: 'FULFILLED',
            to: 'COMPLETED',
            at: receivedAt,
            by: refs.hospitalUserIds[hospitalIndex],
            reason: null,
          },
        );
        for (let u = 0; u < n; u += 1) {
          const bank = pick(refs.banks);
          const unitId = unit(
            bank,
            group,
            'RECEIVED',
            created.getTime() - 10 * DAY,
            created.getTime() + 30 * DAY,
            [],
          );
          allocs.push({
            requestId: _id,
            unitId,
            bloodBankId: bank,
            status: 'RECEIVED',
            reservedBy: staffId,
            reservedAt: new Date(fulfilledAt.getTime() - HOUR),
            holdUntil: new Date(fulfilledAt.getTime() + DAY),
            issuedBy: staffId,
            issuedAt: fulfilledAt,
            receivedBy: refs.hospitalUserIds[hospitalIndex],
            receivedAt,
            releasedBy: null,
            releasedAt: null,
            releaseReason: null,
            createdAt: fulfilledAt,
            updatedAt: receivedAt,
          });
        }
      } else if (outcome !== 'REJECTED') {
        statusHistory.push({
          from: 'APPROVED',
          to: outcome,
          at: new Date(created.getTime() + 40 * HOUR),
          by: outcome === 'CANCELLED' ? staffId : null,
          reason:
            outcome === 'CANCELLED'
              ? 'No longer required'
              : 'Required-by time passed before any units were issued',
        });
      }
      const done = outcome === 'COMPLETED';
      reqSeq += 1;
      reqs.push({
        _id,
        requestNumber: `REQ-H${String(reqSeq).padStart(5, '0')}`,
        hospitalId: refs.hospitals[hospitalIndex],
        createdBy: refs.hospitalUserIds[hospitalIndex],
        bloodGroup: group,
        componentType: 'PRBC',
        unitsRequested: n,
        unitsAllocated: done ? n : 0,
        unitsIssued: done ? n : 0,
        version: 0,
        outreachStatus: 'NONE',
        urgency,
        urgencyRank: { EMERGENCY: 0, URGENT: 1, ROUTINE: 2 }[urgency],
        requiredBy: new Date(created.getTime() + 36 * HOUR),
        reasonCategory: urgency === 'EMERGENCY' ? 'EMERGENCY_CARE' : 'SCHEDULED_PROCEDURE',
        hospitalReference: null,
        notes: null,
        status: outcome,
        statusReason: outcome === 'COMPLETED' ? null : 'Closed (historical demo data)',
        statusHistory,
        reviewedBy: staffId,
        reviewedAt: new Date(created.getTime() + 0.2 * HOUR),
        createdAt: created,
        updatedAt: created,
      });
    }
  }
  await db.collection('bloodunits').insertMany(units);
  await db.collection('bloodrequests').insertMany(reqs);
  if (allocs.length) await db.collection('allocations').insertMany(allocs);
  await db.collection('donations').insertMany(dons);
  return { requests: reqs.length, donations: dons.length, units: units.length };
}

function printSummary(
  accounts: { role: string; email: string; note: string }[],
  history: { requests: number; donations: number; units: number },
) {
  const width = Math.max(...accounts.map((a) => a.email.length));
  console.log('\nDemo data ready.\n');
  for (const a of accounts) console.log(`  ${a.email.padEnd(width)}  ${a.role} — ${a.note}`);
  console.log(`\n  More donors: donor03 … donor48@${DOMAIN}`);
  console.log(
    generatedPassword
      ? `\n  Password for every account (shown once): ${password}`
      : '\n  Password for every account: the SEED_PASSWORD you provided',
  );
  console.log(
    `\n  History for analytics: ${history.requests} requests, ${history.donations} donations over 60 days.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch(async (err: unknown) => {
    console.error('Seeding failed:', err);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
