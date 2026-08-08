import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, resetTestDb } from "./helpers/create-test-db";
import { seedCatalogs, createTestUser, createTestClinic } from "./helpers/fixtures";
import { __resetFakeCookies } from "./helpers/fake-next-headers";
import { login } from "@/lib/auth/auth-service";
import { switchActiveClinic } from "@/lib/tenant/resolve-tenant";
import { getDb } from "@/db/client";
import { memberships } from "@/db/schema";
import {
  listFinancialEntries,
  getFinancialTotals,
  getFinancialEntry,
  createFinancialEntry,
  updateFinancialEntry,
  markAsPaid,
  cancelFinancialEntry,
} from "@/lib/finance/finance-service";
import { createPatient } from "@/lib/patients/patients-service";
import {
  createFinancialEntryAction,
  getFinancialEntryAction,
  markAsPaidAction,
} from "@/app/actions/finance-actions";

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

describe("Finance — service layer CRUD", () => {
  it("creates, reads, updates and marks an entry as paid", async () => {
    const owner = await createTestUser({ email: "owner@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Finance CRUD");
    await loginAsOwnerOf(clinic.id, "owner@test.local");
    const patient = await createPatient({ name: "Paciente Financeiro" });

    const created = await createFinancialEntry({
      patientId: patient.id,
      description: "Consulta",
      amountCents: 15000,
    });
    expect(created.status).toBe("pending");
    expect(created.clinicId).toBe(clinic.id);

    const fetched = await getFinancialEntry(created.id);
    expect(fetched?.id).toBe(created.id);

    const updated = await updateFinancialEntry(created.id, { description: "Consulta + Limpeza" });
    expect(updated.description).toBe("Consulta + Limpeza");

    const paid = await markAsPaid(created.id);
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).not.toBeNull();
  });

  it("rejects creating an entry with empty description or non-positive amount", async () => {
    const owner = await createTestUser({ email: "owner2@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Finance Validation");
    await loginAsOwnerOf(clinic.id, "owner2@test.local");

    await expect(
      createFinancialEntry({ description: "   ", amountCents: 1000 })
    ).rejects.toThrow("VALIDATION:description_required");

    await expect(
      createFinancialEntry({ description: "Válido", amountCents: 0 })
    ).rejects.toThrow("VALIDATION:amount_must_be_positive");

    await expect(
      createFinancialEntry({ description: "Válido", amountCents: -500 })
    ).rejects.toThrow("VALIDATION:amount_must_be_positive");
  });

  it("cancels a pending entry, and blocks cancelling a paid one", async () => {
    const owner = await createTestUser({ email: "owner3@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Finance Cancel");
    await loginAsOwnerOf(clinic.id, "owner3@test.local");

    const entry1 = await createFinancialEntry({ description: "Cancelável", amountCents: 5000 });
    const cancelled = await cancelFinancialEntry(entry1.id);
    expect(cancelled.status).toBe("cancelled");

    const entry2 = await createFinancialEntry({ description: "Vai ser pago", amountCents: 5000 });
    await markAsPaid(entry2.id);
    await expect(cancelFinancialEntry(entry2.id)).rejects.toThrow("IMMUTABLE:entry_paid");
  });

  it("blocks editing or re-marking a paid or cancelled entry", async () => {
    const owner = await createTestUser({ email: "owner4@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Finance Immutable");
    await loginAsOwnerOf(clinic.id, "owner4@test.local");

    const paidEntry = await createFinancialEntry({ description: "Pago", amountCents: 5000 });
    await markAsPaid(paidEntry.id);
    await expect(updateFinancialEntry(paidEntry.id, { description: "Tentativa" })).rejects.toThrow(
      "IMMUTABLE:entry_paid"
    );
    await expect(markAsPaid(paidEntry.id)).rejects.toThrow("IMMUTABLE:entry_paid");

    const cancelledEntry = await createFinancialEntry({ description: "Cancelado", amountCents: 5000 });
    await cancelFinancialEntry(cancelledEntry.id);
    await expect(updateFinancialEntry(cancelledEntry.id, { description: "Tentativa 2" })).rejects.toThrow(
      "IMMUTABLE:entry_cancelled"
    );
  });
});

describe("Finance — totals and overdue sweep", () => {
  it("computes receivable, received and overdue totals correctly", async () => {
    const owner = await createTestUser({ email: "owner5@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Finance Totals");
    await loginAsOwnerOf(clinic.id, "owner5@test.local");

    const paidEntry = await createFinancialEntry({ description: "Pago", amountCents: 10000 });
    await markAsPaid(paidEntry.id);

    await createFinancialEntry({ description: "Pendente futuro", amountCents: 20000, dueDate: futureISODate(10) });

    const overdueEntry = await createFinancialEntry({
      description: "Vencido",
      amountCents: 5000,
      dueDate: pastISODate(3),
    });

    const totals = await getFinancialTotals();
    expect(totals.receivedCents).toBe(10000);
    expect(totals.receivableCents).toBe(20000);
    expect(totals.overdueCents).toBe(5000);

    // The overdue entry's status must have been swept to "overdue" as a side effect.
    const refetched = await getFinancialEntry(overdueEntry.id);
    expect(refetched?.status).toBe("overdue");
  });

  it("excludes cancelled entries from the default list, includes them when asked", async () => {
    const owner = await createTestUser({ email: "owner6@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Finance List");
    await loginAsOwnerOf(clinic.id, "owner6@test.local");

    const active = await createFinancialEntry({ description: "Ativo", amountCents: 1000 });
    const toCancel = await createFinancialEntry({ description: "Será cancelado", amountCents: 1000 });
    await cancelFinancialEntry(toCancel.id);

    const defaultList = await listFinancialEntries({});
    expect(defaultList.map((e) => e.id)).toContain(active.id);
    expect(defaultList.map((e) => e.id)).not.toContain(toCancel.id);

    const withCancelled = await listFinancialEntries({ includeCancelled: true });
    expect(withCancelled.map((e) => e.id)).toEqual(expect.arrayContaining([active.id, toCancel.id]));
  });
});

function pastISODate(daysAgo: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function futureISODate(daysFromNow: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

describe("Finance — cross-tenant isolation", () => {
  it("never returns a financial entry that belongs to a different clinic", async () => {
    const ownerA = await createTestUser({ email: "fa@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Finance A");
    const ownerB = await createTestUser({ email: "fb@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Finance B");

    await loginAsOwnerOf(clinicA.id, "fa@test.local");
    const entryInA = await createFinancialEntry({ description: "Só da clínica A", amountCents: 1000 });

    await loginAsOwnerOf(clinicB.id, "fb@test.local");
    const leaked = await getFinancialEntry(entryInA.id);
    expect(leaked).toBeNull();

    await expect(updateFinancialEntry(entryInA.id, { description: "Hackeado" })).rejects.toThrow("NOT_FOUND");
    await expect(markAsPaid(entryInA.id)).rejects.toThrow("NOT_FOUND");
    await expect(cancelFinancialEntry(entryInA.id)).rejects.toThrow("NOT_FOUND");

    const listInB = await listFinancialEntries({ includeCancelled: true });
    expect(listInB.map((e) => e.id)).not.toContain(entryInA.id);
  });

  it("does not let clinic B's totals be affected by clinic A's entries", async () => {
    const ownerA = await createTestUser({ email: "fc@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Finance C");
    const ownerB = await createTestUser({ email: "fd@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Finance D");

    await loginAsOwnerOf(clinicA.id, "fc@test.local");
    const entryA = await createFinancialEntry({ description: "Da clínica A", amountCents: 99999 });
    await markAsPaid(entryA.id);

    await loginAsOwnerOf(clinicB.id, "fd@test.local");
    const totalsB = await getFinancialTotals();
    expect(totalsB.receivedCents).toBe(0);
    expect(totalsB.receivableCents).toBe(0);
    expect(totalsB.overdueCents).toBe(0);
  });

  it("rejects creating an entry with a patientId from another clinic", async () => {
    const ownerA = await createTestUser({ email: "fe@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Finance E");
    const ownerB = await createTestUser({ email: "ff@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Finance F");

    await loginAsOwnerOf(clinicA.id, "fe@test.local");
    const patientInA = await createPatient({ name: "Paciente Só da A Finance" });

    await loginAsOwnerOf(clinicB.id, "ff@test.local");
    await expect(
      createFinancialEntry({ patientId: patientInA.id, description: "Cross-tenant", amountCents: 1000 })
    ).rejects.toThrow("VALIDATION:patient_not_in_tenant");
  });

  it("does not leak a cross-tenant financial entry through the server action layer either", async () => {
    const ownerA = await createTestUser({ email: "fg@test.local", password: "Password123!" });
    const { clinic: clinicA } = await createTestClinic(ownerA.id, "Clinic Finance G");
    const ownerB = await createTestUser({ email: "fh@test.local", password: "Password123!" });
    const { clinic: clinicB } = await createTestClinic(ownerB.id, "Clinic Finance H");

    await loginAsOwnerOf(clinicA.id, "fg@test.local");
    const created = await createFinancialEntryAction({ description: "Via action", amountCents: 1000 });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");

    await loginAsOwnerOf(clinicB.id, "fh@test.local");
    const result = await getFinancialEntryAction(created.data.id);
    expect(result.ok).toBe(false);

    const markPaidResult = await markAsPaidAction(created.data.id);
    expect(markPaidResult.ok).toBe(false);
  });
});

describe("Finance — RBAC enforcement", () => {
  it("blocks a role without financial.create from creating an entry", async () => {
    const owner = await createTestUser({ email: "ownerR@test.local", password: "Password123!" });
    const { clinic, roles } = await createTestClinic(owner.id, "Clinic Finance RBAC");

    // PROFESSIONAL role has no financial.* permissions per ROLE_PERMISSION_KEYS.
    const proUser = await createTestUser({ email: "proFinance@test.local", password: "Password123!" });
    const db = await getDb();
    const proRole = roles.find((r) => r.key === "PROFESSIONAL")!;
    await db.insert(memberships).values({
      userId: proUser.id,
      clinicId: clinic.id,
      roleId: proRole.id,
      status: "active",
    });

    await loginAsOwnerOf(clinic.id, "proFinance@test.local");
    const result = await createFinancialEntryAction({ description: "Não deveria existir", amountCents: 1000 });
    expect(result.ok).toBe(false);
  });

  it("blocks all finance actions when the FINANCE module is disabled for the clinic", async () => {
    const owner = await createTestUser({ email: "ownerM@test.local", password: "Password123!" });
    const { clinic } = await createTestClinic(owner.id, "Clinic Finance Module Off");

    const db = await getDb();
    const { clinicModules, modules } = await import("@/db/schema");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const [financeModule] = await db.select().from(modules).where(eqOp(modules.key, "FINANCE")).limit(1);
    await db
      .update(clinicModules)
      .set({ enabled: false })
      .where(andOp(eqOp(clinicModules.clinicId, clinic.id), eqOp(clinicModules.moduleId, financeModule.id)));

    await loginAsOwnerOf(clinic.id, "ownerM@test.local");
    const result = await createFinancialEntryAction({ description: "Bloqueado por módulo", amountCents: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/módulo/i);
  });
});
