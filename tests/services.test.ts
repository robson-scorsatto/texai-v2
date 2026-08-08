import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { getDb } from "@/db/client";
import { memberships } from "@/db/schema";
import {
  listServices,
  getService,
  createService,
  updateService,
  deactivateService,
} from "@/lib/services/services-service";
import { createAppointment, updateAppointment } from "@/lib/agenda/agenda-service";
import { createPatient } from "@/lib/patients/patients-service";
import { createServiceAction, listServicesAction } from "@/app/actions/services-actions";

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

describe("Services — service layer CRUD", () => {
  it("creates, reads, updates and deactivates a service", async () => {
    const owner = await createTestUser({ email: "owner@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Services CRUD");
    await loginAsOwnerOf(clinic.id, "owner@test.local");

    const created = await createService({ name: "Consulta", defaultPriceCents: 15000 });
    expect(created.defaultDurationMinutes).toBe(30); // default
    expect(created.isActive).toBe(true);

    const fetched = await getService(created.id);
    expect(fetched?.id).toBe(created.id);

    const updated = await updateService(created.id, { defaultPriceCents: 18000 });
    expect(updated.defaultPriceCents).toBe(18000);

    const deactivated = await deactivateService(created.id);
    expect(deactivated.isActive).toBe(false);
  });

  it("rejects invalid name, price or duration", async () => {
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Services Validation");
    await loginAsOwnerOf(clinic.id, "owner2@test.local");

    await expect(createService({ name: "  ", defaultPriceCents: 1000 })).rejects.toThrow(
      "VALIDATION:name_required"
    );
    await expect(createService({ name: "x", defaultPriceCents: 0 })).rejects.toThrow(
      "VALIDATION:price_must_be_positive"
    );
    await expect(
      createService({ name: "x", defaultPriceCents: 1000, defaultDurationMinutes: 0 })
    ).rejects.toThrow("VALIDATION:duration_must_be_positive");
  });

  it("excludes inactive services from listServices by default", async () => {
    const owner = await createTestUser({ email: "owner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Services List");
    await loginAsOwnerOf(clinic.id, "owner3@test.local");

    const active = await createService({ name: "Ativo", defaultPriceCents: 1000 });
    const inactive = await createService({ name: "Inativo", defaultPriceCents: 1000 });
    await deactivateService(inactive.id);

    const defaultList = await listServices();
    expect(defaultList.map((s) => s.id)).toContain(active.id);
    expect(defaultList.map((s) => s.id)).not.toContain(inactive.id);

    const withInactive = await listServices(true);
    expect(withInactive.map((s) => s.id)).toEqual(expect.arrayContaining([active.id, inactive.id]));
  });
});

describe("Services — integration with Agenda", () => {
  it("links a service to an appointment and derives serviceName from it", async () => {
    const owner = await createTestUser({ email: "owner4@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Services Agenda");
    await loginAsOwnerOf(clinic.id, "owner4@test.local");
    const patient = await createPatient({ name: "Paciente Serviço" });
    const service = await createService({ name: "Limpeza", defaultPriceCents: 12000, defaultDurationMinutes: 45 });

    const appt = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      serviceId: service.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 45),
    });

    expect(appt.serviceId).toBe(service.id);
    expect(appt.serviceName).toBe("Limpeza"); // derived, not explicitly passed
  });

  it("lets an explicit serviceName override the linked service's name", async () => {
    const owner = await createTestUser({ email: "owner5@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Services Override");
    await loginAsOwnerOf(clinic.id, "owner5@test.local");
    const patient = await createPatient({ name: "Paciente Override" });
    const service = await createService({ name: "Limpeza", defaultPriceCents: 12000 });

    const appt = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      serviceId: service.id,
      serviceName: "Limpeza + Flúor",
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 45),
    });

    expect(appt.serviceName).toBe("Limpeza + Flúor");
  });

  it("rejects an appointment referencing a serviceId from another clinic", async () => {
    const ownerA = await createTestUser({ email: "sa@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Services A");
    const ownerB = await createTestUser({ email: "sb@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Services B");

    await loginAsOwnerOf(clinicA.id, "sa@test.local");
    const serviceInA = await createService({ name: "Só da A", defaultPriceCents: 1000 });

    await loginAsOwnerOf(clinicB.id, "sb@test.local");
    const patientInB = await createPatient({ name: "Paciente B" });
    await expect(
      createAppointment({
        patientId: patientInB.id,
        professionalUserId: ownerB.id,
        serviceId: serviceInA.id,
        startsAt: iso(1, 9, 0),
        endsAt: iso(1, 9, 30),
      })
    ).rejects.toThrow("VALIDATION:service_not_in_tenant");
  });

  it("allows updating an appointment's serviceId, re-validated for tenant", async () => {
    const owner = await createTestUser({ email: "owner6@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Services Update");
    await loginAsOwnerOf(clinic.id, "owner6@test.local");
    const patient = await createPatient({ name: "Paciente Update Serviço" });
    const service1 = await createService({ name: "Consulta", defaultPriceCents: 15000 });
    const service2 = await createService({ name: "Avaliação", defaultPriceCents: 8000 });

    const appt = await createAppointment({
      patientId: patient.id,
      professionalUserId: owner.id,
      serviceId: service1.id,
      startsAt: iso(1, 9, 0),
      endsAt: iso(1, 9, 30),
    });

    const updated = await updateAppointment(appt.id, { serviceId: service2.id });
    expect(updated.serviceId).toBe(service2.id);
  });
});

describe("Services — cross-tenant isolation", () => {
  it("never returns a service that belongs to a different clinic", async () => {
    const ownerA = await createTestUser({ email: "sc@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Services C");
    const ownerB = await createTestUser({ email: "sd@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Services D");

    await loginAsOwnerOf(clinicA.id, "sc@test.local");
    const serviceInA = await createService({ name: "Só da A2", defaultPriceCents: 1000 });

    await loginAsOwnerOf(clinicB.id, "sd@test.local");
    const leaked = await getService(serviceInA.id);
    expect(leaked).toBeNull();

    await expect(updateService(serviceInA.id, { name: "Hackeado" })).rejects.toThrow("NOT_FOUND");
    await expect(deactivateService(serviceInA.id)).rejects.toThrow("NOT_FOUND");

    const listInB = await listServices(true);
    expect(listInB.map((s) => s.id)).not.toContain(serviceInA.id);
  });

  it("does not leak cross-tenant services through the server action layer either", async () => {
    const ownerA = await createTestUser({ email: "se@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Services E");
    const ownerB = await createTestUser({ email: "sf@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Services F");

    await loginAsOwnerOf(clinicA.id, "se@test.local");
    const created = await createServiceAction({ name: "Via Action", defaultPriceCents: 1000 });
    expect(created.ok).toBe(true);

    await loginAsOwnerOf(clinicB.id, "sf@test.local");
    const listResult = await listServicesAction(true);
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.data.map((s) => s.name)).not.toContain("Via Action");
    }
  });
});

describe("Services — RBAC enforcement", () => {
  it("blocks a role without settings.manage from creating a service", async () => {
    const owner = await createTestUser({ email: "ownerR@test.local", password: "Password123!" });
    const { clinic, roles } = await createTestClinic(owner.id, "Clinic Services RBAC");

    const receptionUser = await createTestUser({ email: "receptionSvc@test.local", password: "Password123!" });
    const db = await getDb();
    const receptionRole = roles.find((r) => r.key === "RECEPTIONIST")!;
    await db.insert(memberships).values({
      userId: receptionUser.id,
      clinicId: clinic.id,
      roleId: receptionRole.id,
      status: "active",
    });

    await loginAsOwnerOf(clinic.id, "receptionSvc@test.local");
    const result = await createServiceAction({ name: "Não deveria existir", defaultPriceCents: 1000 });
    expect(result.ok).toBe(false);
  });

  it("blocks service actions when the AGENDA module is disabled for the clinic", async () => {
    const owner = await createTestUser({ email: "ownerM@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Services Module Off");

    const db = await getDb();
    const { clinicModules, modules } = await import("@/db/schema");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const [agendaModule] = await db.select().from(modules).where(eqOp(modules.key, "AGENDA")).limit(1);
    await db
      .update(clinicModules)
      .set({ enabled: false })
      .where(andOp(eqOp(clinicModules.clinicId, clinic.id), eqOp(clinicModules.moduleId, agendaModule.id)));

    await loginAsOwnerOf(clinic.id, "ownerM@test.local");
    const result = await createServiceAction({ name: "Bloqueado", defaultPriceCents: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/módulo/i);
  });
});
