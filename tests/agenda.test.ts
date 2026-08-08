import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { getDb } from "@/db/client";
import { memberships } from "@/db/schema";
import {
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  completeAppointment,
  confirmAppointment,
  markNoShow,
} from "@/lib/agenda/agenda-service";
import { createPatient } from "@/lib/patients/patients-service";
import {
  createAppointmentAction,
  getAppointmentAction,
  cancelAppointmentAction,
} from "@/app/actions/agenda-actions";

beforeEach(async () => {
  await createTestDb();
  await seedCatalogs();
});

afterEach(() => {
  resetTestDb();
  __resetFakeCookies();
});

async function loginAsOwnerOf(clinicId: string, email: string) {
  await login(email, "Password123!");
  await switchActiveClinic(clinicId);
}

function iso(daysFromNow: number, hour: number, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

describe("Agenda — service layer CRUD", () => {
  it("creates, reads, updates, confirms and completes an appointment", async () => {
    const owner = await createTestUser({ email: "owner@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Agenda CRUD");
    await loginAsOwnerOf(clinic.id, "owner@test.local");

    const patient = await createPatient({ name: "Paciente Agenda" });

    const created = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      type: "atendimento",
      serviceName: "Consulta",
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 30),
    });
    expect(created.status).toBe("scheduled");
    expect(created.clinicId).toBe(clinic.id);

    const fetched = await getAppointment(created.id);
    expect(fetched?.id).toBe(created.id);

    const confirmed = await confirmAppointment(created.id);
    expect(confirmed.status).toBe("confirmed");

    const updated = await updateAppointment(created.id, { notes: "Paciente confirmou por WhatsApp" });
    expect(updated.notes).toBe("Paciente confirmou por WhatsApp");

    const completed = await completeAppointment(created.id);
    expect(completed.status).toBe("completed");
  });

  it("cancels and marks no-show correctly", async () => {
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Agenda Cancel");
    await loginAsOwnerOf(clinic.id, "owner2@test.local");
    const patient = await createPatient({ name: "Paciente Cancel" });

    const appt1 = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 30),
    });
    const cancelled = await cancelAppointment(appt1.id);
    expect(cancelled.status).toBe("cancelled");

    const appt2 = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 10, 0),
      endsAt: iso(1, 10, 30),
    });
    const noShow = await markNoShow(appt2.id);
    expect(noShow.status).toBe("no_show");
  });

  it("allows a 'bloqueio' appointment without a patient, and requires a patient for 'atendimento'", async () => {
    const owner = await createTestUser({ email: "owner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Agenda Block");
    await loginAsOwnerOf(clinic.id, "owner3@test.local");

    const bloqueio = await createAppointment({
      professionalUserId: owner.id,
      type: "bloqueio",
      startsAt: iso(1, 12, 0),
      endsAt: iso(1, 13, 0),
    });
    expect(bloqueio.patientId).toBeNull();

    await expect(
      createAppointment({
        professionalUserId: owner.id,
        type: "atendimento",
        startsAt: iso(1, 15, 0),
        endsAt: iso(1, 15, 30),
      })
    ).rejects.toThrow("VALIDATION:patient_required_for_atendimento");
  });

  it("rejects an interval where endsAt is not after startsAt", async () => {
    const owner = await createTestUser({ email: "owner4@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Agenda Interval");
    await loginAsOwnerOf(clinic.id, "owner4@test.local");

    await expect(
      createAppointment({
        professionalUserId: owner.id,
        type: "bloqueio",
        startsAt: iso(1, 10, 0),
        endsAt: iso(1, 9, 0),
      })
    ).rejects.toThrow("VALIDATION:ends_before_starts");
  });

  it("lists appointments within a date range and excludes cancelled by default", async () => {
    const owner = await createTestUser({ email: "owner5@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Agenda List");
    await loginAsOwnerOf(clinic.id, "owner5@test.local");
    const patient = await createPatient({ name: "Paciente Lista" });

    const inRange = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 30),
    });
    const cancelled = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 11, 0),
      endsAt: iso(1, 11, 30),
    });
    await cancelAppointment(cancelled.id);

    const outOfRange = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(5, 9, 0),
      endsAt: iso(5, 9, 30),
    });

    const dayStart = new Date();
    dayStart.setUTCDate(dayStart.getUTCDate() + 1);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const results = await listAppointments({ from: dayStart.toISOString(), to: dayEnd.toISOString() });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(inRange.id);
    expect(ids).not.toContain(cancelled.id);
    expect(ids).not.toContain(outOfRange.id);
  });
});

describe("Agenda — scheduling conflict detection", () => {
  it("rejects a new appointment that overlaps an existing one for the same professional", async () => {
    const owner = await createTestUser({ email: "ownerC@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Conflict");
    await loginAsOwnerOf(clinic.id, "ownerC@test.local");
    const patient = await createPatient({ name: "Paciente Conflito" });

    await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 10, 0),
    });

    // Fully overlapping
    await expect(
      createAppointment({
        patientId: patient.id,
        professionalUserId: owner.id,
        startsAt: iso(1, 9, 30),
        endsAt: iso(1, 10, 30),
      })
    ).rejects.toThrow("CONFLICT:schedule_overlap");

    // Back-to-back (starts exactly when the other ends) must be allowed
    const backToBack = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 10, 0),
      endsAt: iso(1, 10, 30),
    });
    expect(backToBack.id).toBeDefined();
  });

  it("allows overlapping times for two DIFFERENT professionals", async () => {
    const owner = await createTestUser({ email: "ownerD@test.local", password: "Password123!" });
    const { clinic, roles } = await createTestClinic(owner.id, "Clinic Conflict Diff Prof");
    await loginAsOwnerOf(clinic.id, "ownerD@test.local");
    const patient = await createPatient({ name: "Paciente Conflito 2" });

    const otherProfessional = await createTestUser({ email: "prof2@test.local", password: "Password123!" });
    const db = await getDb();
    const proRole = roles.find((r) => r.key === "PROFESSIONAL")!;
    await db.insert(memberships).values({
      userId: otherProfessional.id,
      clinicId: clinic.id,
      roleId: proRole.id,
      status: "active",
    });

    await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 10, 0),
    });

    const secondProfAppt = await createAppointment({
      patientId: patient.id,
      professionalUserId: otherProfessional.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 10, 0),
    });
    expect(secondProfAppt.id).toBeDefined();
  });

  it("does not conflict with a cancelled appointment occupying the same slot", async () => {
    const owner = await createTestUser({ email: "ownerE@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Conflict Cancelled");
    await loginAsOwnerOf(clinic.id, "ownerE@test.local");
    const patient = await createPatient({ name: "Paciente Conflito 3" });

    const first = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 10, 0),
    });
    await cancelAppointment(first.id);

    const second = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 10, 0),
    });
    expect(second.id).toBeDefined();
  });

  it("detects a conflict when updating an appointment's time into another one's slot", async () => {
    const owner = await createTestUser({ email: "ownerF@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Conflict Update");
    await loginAsOwnerOf(clinic.id, "ownerF@test.local");
    const patient = await createPatient({ name: "Paciente Conflito 4" });

    await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 10, 0),
    });
    const second = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      startsAt: iso(1, 11, 0),
      endsAt: iso(1, 12, 0),
    });

    await expect(
      updateAppointment(second.id, { startsAt: iso(1, 9, 30), endsAt: iso(1, 10, 30) })
    ).rejects.toThrow("CONFLICT:schedule_overlap");
  });
});

describe("Agenda — cross-tenant isolation", () => {
  it("never returns an appointment that belongs to a different clinic", async () => {
    const ownerA = await createTestUser({ email: "aa@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic AA");
    const ownerB = await createTestUser({ email: "ab@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic AB");

    await loginAsOwnerOf(clinicA.id, "aa@test.local");
    const patientA = await createPatient({ name: "Paciente Clínica A" });
    const apptInA = await createAppointment({
      patientId: patientA.id,
      professionalUserId: ownerA.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 30),
    });

    await loginAsOwnerOf(clinicB.id, "ab@test.local");
    const leaked = await getAppointment(apptInA.id);
    expect(leaked).toBeNull();

    await expect(updateAppointment(apptInA.id, { notes: "Hackeado" })).rejects.toThrow("NOT_FOUND");
    await expect(cancelAppointment(apptInA.id)).rejects.toThrow("NOT_FOUND");
  });

  it("rejects creating an appointment with a patientId or professionalUserId from another clinic", async () => {
    const ownerA = await createTestUser({ email: "ac@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic AC");
    const ownerB = await createTestUser({ email: "ad@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic AD");

    await loginAsOwnerOf(clinicA.id, "ac@test.local");
    const patientInA = await createPatient({ name: "Paciente Só da A" });

    await loginAsOwnerOf(clinicB.id, "ad@test.local");
    // patientInA belongs to clinic A; caller is now in clinic B.
    await expect(
      createAppointment({
        patientId: patientInA.id,
        professionalUserId: ownerB.id,
        startsAt: iso(1, 9, 0),
        endsAt: iso(1, 9, 30),
      })
    ).rejects.toThrow("VALIDATION:patient_not_in_tenant");

    // ownerA is not a member of clinic B.
    await expect(
      createAppointment({
        professionalUserId: ownerA.id,
        type: "bloqueio",
        startsAt: iso(1, 9, 0),
        endsAt: iso(1, 9, 30),
      })
    ).rejects.toThrow("VALIDATION:professional_not_in_tenant");
  });

  it("does not leak a cross-tenant appointment through the server action layer either", async () => {
    const ownerA = await createTestUser({ email: "ae@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic AE");
    const ownerB = await createTestUser({ email: "af@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic AF");

    await loginAsOwnerOf(clinicA.id, "ae@test.local");
    const patientA = await createPatient({ name: "Paciente Ação Agenda A" });
    const created = await createAppointmentAction({
      patientId: patientA.id,
      professionalUserId: ownerA.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 30),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");

    await loginAsOwnerOf(clinicB.id, "af@test.local");
    const result = await getAppointmentAction(created.data.id);
    expect(result.ok).toBe(false);

    const cancelResult = await cancelAppointmentAction(created.data.id);
    expect(cancelResult.ok).toBe(false);
  });
});

describe("Agenda — RBAC enforcement", () => {
  it("blocks a role without agenda.create from creating an appointment", async () => {
    const owner = await createTestUser({ email: "ownerR@test.local", password: "Password123!" });
    const { clinic, roles } = await createTestClinic(owner.id, "Clinic Agenda RBAC");

    // FINANCE role has no agenda.* permissions per ROLE_PERMISSION_KEYS.
    const financeUser = await createTestUser({ email: "financeA@test.local", password: "Password123!" });
    const db = await getDb();
    const financeRole = roles.find((r) => r.key === "FINANCE")!;
    await db.insert(memberships).values({
      userId: financeUser.id,
      clinicId: clinic.id,
      roleId: financeRole.id,
      status: "active",
    });

    await loginAsOwnerOf(clinic.id, "financeA@test.local");
    const result = await createAppointmentAction({
      professionalUserId: owner.id,
      type: "bloqueio",
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 30),
    });
    expect(result.ok).toBe(false);
  });

  it("blocks all agenda actions when the AGENDA module is disabled for the clinic", async () => {
    const owner = await createTestUser({ email: "ownerM@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Agenda Module Off");

    const db = await getDb();
    const { clinicModules, modules } = await import("@/db/schema");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const [agendaModule] = await db.select().from(modules).where(eqOp(modules.key, "AGENDA")).limit(1);
    await db
      .update(clinicModules)
      .set({ enabled: false })
      .where(andOp(eqOp(clinicModules.clinicId, clinic.id), eqOp(clinicModules.moduleId, agendaModule.id)));

    await loginAsOwnerOf(clinic.id, "ownerM@test.local");
    const result = await createAppointmentAction({
      professionalUserId: owner.id,
      type: "bloqueio",
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 30),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/módulo/i);
  });
});
