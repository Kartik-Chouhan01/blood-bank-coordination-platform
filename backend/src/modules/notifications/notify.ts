import type { Types, QueryFilter } from 'mongoose';
import { COMPONENT_LABELS, type VerificationStatus } from '@bbms/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { DonorProfileModel } from '../donors/donorProfile.model.js';
import { HospitalModel } from '../hospitals/hospital.model.js';
import { BloodUnitModel } from '../inventory/bloodUnit.model.js';
import { DonorOutreachModel } from '../matching/donorOutreach.model.js';
import { BloodRequestModel, type BloodRequest } from '../requests/bloodRequest.model.js';
import { UserModel, type User } from '../users/user.model.js';
import { deliver, type NotificationContent, type Recipient } from './notifications.service.js';

/**
 * What each business event tells whom. Every function here is called after the change has
 * committed, never throws, and never includes patient details; donors are never told which
 * hospital asked.
 */

type Channels = { inApp: boolean; byEmail: boolean };
const IN_APP: Channels = { inApp: true, byEmail: false };
const IN_APP_AND_EMAIL: Channels = { inApp: true, byEmail: true };

async function run(event: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (err) {
    logger.error({ err, event }, 'Could not prepare notification');
  }
}

async function activeUsers(filter: QueryFilter<User>, channels: Channels): Promise<Recipient[]> {
  const users = await UserModel.find({ ...filter, accountStatus: 'ACTIVE' })
    .select('name email emailVerified')
    .lean();
  return users.map((u) => ({
    userId: u._id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified,
    ...channels,
  }));
}

/** Staff of one bank when given (falling back to administrators if it has none), else everyone. */
async function staff(channels: Channels, bloodBankId?: Types.ObjectId) {
  if (bloodBankId) {
    const bankStaff = await activeUsers({ role: 'BLOOD_BANK_STAFF', bloodBankId }, channels);
    if (bankStaff.length) return bankStaff;
    return activeUsers({ role: 'ADMIN' }, channels);
  }
  return activeUsers({ role: { $in: ['BLOOD_BANK_STAFF', 'ADMIN'] } }, channels);
}

async function hospitalOwner(hospitalId: Types.ObjectId, channels: Channels) {
  const hospital = await HospitalModel.findById(hospitalId).select('userId').lean();
  return hospital ? activeUsers({ _id: hospital.userId }, channels) : [];
}

const when = (date: Date) =>
  `${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: env.APP_TIME_ZONE }).format(date)}`;
const describe = (r: BloodRequest) =>
  `${r.unitsRequested} × ${r.bloodGroup} ${COMPONENT_LABELS[r.componentType].toLowerCase()}`;
const hospitalLink = (r: BloodRequest) => `/hospital/requests/${r._id.toString()}`;
const staffLink = (r: BloodRequest) => `/admin/requests/${r._id.toString()}`;
const entity = (r: BloodRequest) => ({ type: 'BloodRequest', id: r._id });

async function loadRequest(requestId: Types.ObjectId | string) {
  return BloodRequestModel.findById(requestId).lean();
}

async function toHospital(r: BloodRequest, channels: Channels, content: NotificationContent) {
  await deliver(await hospitalOwner(r.hospitalId, channels), {
    link: hospitalLink(r),
    entity: entity(r),
    ...content,
  });
}

// ─── Requests ────────────────────────────────────────────────────────────────

export const requestReviewed = (requestId: Types.ObjectId | string, reason?: string | null) =>
  run('requestReviewed', async () => {
    const r = await loadRequest(requestId);
    if (!r) return;
    const approved = r.status !== 'REJECTED';
    await toHospital(r, IN_APP_AND_EMAIL, {
      type: approved ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED',
      priority: approved ? 'NORMAL' : 'HIGH',
      title: `Request ${r.requestNumber} ${approved ? 'approved' : 'rejected'}`,
      message: approved
        ? `Your request for ${describe(r)} was approved. The blood bank is now allocating units.`
        : `Your request for ${describe(r)} was rejected. Reason: ${reason ?? '—'}`,
    });
  });

/** New or escalated EMERGENCY/URGENT requests. Emergencies are critical and also emailed. */
export const urgentRequestRaised = (requestId: Types.ObjectId | string, escalated = false) =>
  run('urgentRequestRaised', async () => {
    const r = await loadRequest(requestId);
    if (!r || r.urgency === 'ROUTINE') return;
    const emergency = r.urgency === 'EMERGENCY';
    const hospital = await HospitalModel.findById(r.hospitalId).select('name address.city').lean();
    const where = hospital ? `${hospital.name}, ${hospital.address.city}` : 'A hospital';
    await deliver(await staff(emergency ? IN_APP_AND_EMAIL : IN_APP), {
      type: 'URGENT_REQUEST',
      priority: emergency ? 'CRITICAL' : 'HIGH',
      title: `${emergency ? 'Emergency' : 'Urgent'} request ${r.requestNumber}${escalated ? ' (escalated)' : ''}`,
      message:
        `${where} needs ${describe(r)} by ${when(r.requiredBy)}.` +
        (emergency ? ' It was approved automatically and is at the top of the queue.' : ''),
      link: staffLink(r),
      entity: entity(r),
    });
  });

export const requestCancelled = (
  requestId: Types.ObjectId | string,
  by: 'HOSPITAL' | 'STAFF',
  reason: string,
  wasApproved: boolean,
) =>
  run('requestCancelled', async () => {
    const r = await loadRequest(requestId);
    if (!r) return;
    if (by === 'STAFF') {
      await toHospital(r, IN_APP_AND_EMAIL, {
        type: 'REQUEST_CANCELLED_BY_STAFF',
        priority: 'HIGH',
        title: `Request ${r.requestNumber} cancelled by the blood bank`,
        message: `Your request for ${describe(r)} was cancelled. Reason: ${reason}`,
      });
    } else if (wasApproved) {
      // Staff may already be working on it; pending requests simply leave the queue.
      await deliver(await staff(IN_APP), {
        type: 'REQUEST_CANCELLED_BY_HOSPITAL',
        title: `Request ${r.requestNumber} cancelled by the hospital`,
        message:
          `The hospital cancelled its request for ${describe(r)}. Reason: ${reason}.` +
          (r.unitsIssued ? ' Units already issued stay with the hospital.' : '') +
          ' Reserved units were returned to stock automatically.',
        link: staffLink(r),
        entity: entity(r),
      });
    }
  });

export const requestExpired = (requestId: Types.ObjectId | string) =>
  run('requestExpired', async () => {
    const r = await loadRequest(requestId);
    if (!r) return;
    await toHospital(r, IN_APP_AND_EMAIL, {
      type: 'REQUEST_EXPIRED',
      title: `Request ${r.requestNumber} expired`,
      message: `Your request for ${describe(r)} passed its required-by time before any units were issued and has been closed. Raise a new request if blood is still needed.`,
    });
  });

// ─── Allocation ──────────────────────────────────────────────────────────────

export const unitsReserved = (requestId: Types.ObjectId | string, count: number) =>
  run('unitsReserved', async () => {
    const r = await loadRequest(requestId);
    if (!r) return;
    await toHospital(r, IN_APP, {
      type: 'UNITS_RESERVED',
      title: `${count} unit${count === 1 ? '' : 's'} reserved for ${r.requestNumber}`,
      message: `${r.unitsAllocated} of ${r.unitsRequested} units are now set aside for your request. You will be told when they are issued.`,
    });
  });

export const unitIssued = (requestId: Types.ObjectId | string, unitId: Types.ObjectId) =>
  run('unitIssued', async () => {
    const [r, unit] = await Promise.all([
      loadRequest(requestId),
      BloodUnitModel.findById(unitId).select('unitCode').lean(),
    ]);
    if (!r || !unit) return;
    const { unitCode } = unit;
    const all = r.unitsIssued >= r.unitsRequested;
    await toHospital(r, IN_APP_AND_EMAIL, {
      type: 'UNITS_ISSUED',
      priority: 'HIGH',
      title: all ? `All units issued for ${r.requestNumber}` : `Unit issued for ${r.requestNumber}`,
      message:
        `Unit ${unitCode} was issued (${r.unitsIssued} of ${r.unitsRequested}).` +
        (all ? ' Please confirm receipt once every unit has arrived.' : ''),
    });
  });

/** A reservation released by the system (hold expired, unit expired): the owning bank must act. */
export const reservationReleased = (
  requestId: Types.ObjectId | string,
  unitId: Types.ObjectId,
  reason: string,
) =>
  run('reservationReleased', async () => {
    const [r, unit] = await Promise.all([
      loadRequest(requestId),
      BloodUnitModel.findById(unitId).select('unitCode bloodBankId').lean(),
    ]);
    if (!r || !unit) return;
    const { unitCode, bloodBankId } = unit;
    const open = ['APPROVED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'].includes(r.status);
    await deliver(await staff(IN_APP, bloodBankId), {
      type: 'RESERVATION_RELEASED',
      priority: open && r.urgency !== 'ROUTINE' ? 'HIGH' : 'NORMAL',
      title: `Reservation released for ${r.requestNumber}`,
      message:
        `Unit ${unitCode} was released automatically: ${reason}.` +
        (open
          ? ` The request now has ${r.unitsAllocated} of ${r.unitsRequested} units allocated.`
          : ''),
      link: staffLink(r),
      entity: entity(r),
    });
  });

// ─── Donor outreach ──────────────────────────────────────────────────────────

/** Requests for help, on each donor's chosen channels. Never names the hospital. */
export const donorsContacted = (outreachIds: Types.ObjectId[]) =>
  run('donorsContacted', async () => {
    if (!outreachIds.length) return;
    const outreach = await DonorOutreachModel.find({ _id: { $in: outreachIds } }).lean();
    const r = outreach[0] && (await loadRequest(outreach[0].requestId));
    if (!r) return;
    const donors = await DonorProfileModel.find({ _id: { $in: outreach.map((o) => o.donorId) } })
      .select('userId notificationPreferences')
      .lean();
    const hospital = await HospitalModel.findById(r.hospitalId).select('address.city').lean();
    const emergency = r.urgency === 'EMERGENCY';

    await Promise.all(
      donors.map(async (d) => {
        const prefs = d.notificationPreferences;
        const recipients = await activeUsers(
          { _id: d.userId },
          { inApp: prefs.inApp, byEmail: prefs.email },
        );
        await deliver(recipients, {
          type: 'DONOR_OUTREACH',
          priority: emergency ? 'CRITICAL' : 'HIGH',
          title: `${emergency ? 'Emergency: ' : ''}${r.bloodGroup} donors needed${hospital ? ` in ${hospital.address.city}` : ''}`,
          message:
            `A blood bank is looking for potential donors with a compatible blood group for ${COMPONENT_LABELS[r.componentType].toLowerCase()} needed by ${when(r.requiredBy)}. ` +
            'If you can help, reply on your dashboard and blood-bank staff will contact you. Staff decide whether you can donate.',
          link: '/donor/requests',
        });
      }),
    );
  });

export const donorInterested = (outreachId: Types.ObjectId | string) =>
  run('donorInterested', async () => {
    const outreach = await DonorOutreachModel.findById(outreachId).lean();
    const r = outreach && (await loadRequest(outreach.requestId));
    if (!outreach || !r) return;
    const donor = await DonorProfileModel.findById(outreach.donorId).select('bloodGroup').lean();
    // The staff member who contacted donors follows up; automatic outreach goes to everyone.
    const who = outreach.notifiedBy ? await activeUsers({ _id: outreach.notifiedBy }, IN_APP) : [];
    await deliver(who.length ? who : await staff(IN_APP), {
      type: 'DONOR_INTERESTED',
      priority: r.urgency === 'ROUTINE' ? 'NORMAL' : 'HIGH',
      title: `A donor can help with ${r.requestNumber}`,
      message: `A potential ${donor?.bloodGroup ?? ''} donor replied that they can help. Their contact details are on the request.`,
      link: staffLink(r),
      entity: entity(r),
    });
  });

// ─── Hospitals ───────────────────────────────────────────────────────────────

/** In-app companion to the verification email (which is sent separately). */
export const hospitalVerificationChanged = (
  hospitalId: Types.ObjectId,
  status: VerificationStatus,
  reason: string | null,
) =>
  run('hospitalVerificationChanged', async () => {
    const title =
      status === 'VERIFIED'
        ? 'Your hospital has been verified'
        : status === 'REJECTED'
          ? 'Your hospital registration needs attention'
          : status === 'SUSPENDED'
            ? 'Your hospital account has been suspended'
            : null;
    if (!title) return;
    await deliver(await hospitalOwner(hospitalId, IN_APP), {
      type: 'HOSPITAL_VERIFICATION',
      priority: status === 'VERIFIED' ? 'NORMAL' : 'HIGH',
      title,
      message:
        status === 'VERIFIED'
          ? 'You can now raise blood requests.'
          : `Reason: ${reason ?? '—'}${status === 'REJECTED' ? '. Correct your details on the profile page to resubmit.' : ''}`,
      link: '/hospital/profile',
      entity: { type: 'Hospital', id: hospitalId },
    });
  });
