// ===== Participant & Manager DB Access =====
// Unified async interface supporting two backends:
//   1. Supabase (multi-tenant, primary)
//   2. Mock data (development fallback)
//
// Token-based routing: when a token is looked up, Supabase is checked first.
// If found there, the Supabase backend is used. Otherwise, mock is used.
//
// ALL API routes should import from this file instead of mock-data.ts or supabase.ts.


import {
  DEFAULT_TENANT_ID,
  getParticipantByTokenFromSupabase,
  getManagerByTokenFromSupabase,
  getManagerByIdFromSupabase,
  getAllParticipantsFromSupabase,
  getAllManagersFromSupabase,
  getParticipantByNameFromSupabase,
  getParticipantByEmailFromSupabase,
  getParticipantsForManagerFromSupabase,
  isAdminTokenFromSupabase,
  type NotionParticipant,
  type NotionManager,
} from "./supabase";

import {
  getParticipantByToken as mockGetByToken,
  getParticipantByName as mockGetByName,
  getParticipantByEmail as mockGetByEmail,
  getParticipantById as mockGetById,
  getManagerByToken as mockGetManagerByToken,
  getManagerById as mockGetManagerById,
  getParticipantsForManager as mockGetParticipantsForManager,
  getAllParticipants as mockGetAllParticipants,
  getAllManagers as mockGetAllManagers,
  type Participant,
  type Manager,
} from "./mock-data";

// Check backend availability
function hasSupabase(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
}

// ===== Unified types that all backends can provide =====
export type BackendType = "supabase" | "mock";

export type ParticipantInfo = {
  id: string;
  token: string;
  name: string;
  email: string;
  department: string;
  dojoPhase: string;
  emailEnabled: boolean;
  managerId: string;
  fbPolicy: string;
  // Backend routing info
  backend?: BackendType;
  tenantId?: string;
  // Mock-only fields (for backward compatibility in mock mode)
  weekNum?: number;
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  entryRate?: number;
  streak?: number;
  fbCount?: number;
  averageEnergy?: string;
  logs?: Participant["logs"];
  feedbacks?: Participant["feedbacks"];
  managerComments?: Participant["managerComments"];
  missions?: Participant["missions"];
};

export type ManagerRole = "admin" | "observer" | "manager";

export type ManagerInfo = {
  id: string;
  token: string;
  name: string;
  email: string;
  department: string;
  isAdmin: boolean;
  role: ManagerRole;
  participantIds: string[];
  // Backend routing info
  backend?: BackendType;
  tenantId?: string;
};

// ===== Converters =====

function notionParticipantToInfo(np: NotionParticipant): ParticipantInfo {
  return {
    id: np.id,
    token: np.token,
    name: np.name,
    email: np.email,
    department: np.department,
    dojoPhase: np.dojoPhase,
    emailEnabled: np.emailEnabled,
    managerId: np.managerId,
    startDate: np.startDate,
    endDate: np.endDate,
    fbPolicy: np.fbPolicy || "",
  };
}

function mockParticipantToInfo(mp: Participant): ParticipantInfo {
  return {
    id: mp.id,
    token: mp.token,
    name: mp.name,
    email: mp.email,
    department: mp.department,
    dojoPhase: mp.dojoPhase,
    emailEnabled: mp.emailEnabled,
    managerId: mp.managerId,
    fbPolicy: "",
    backend: "mock",
    weekNum: mp.weekNum,
    startDate: mp.startDate,
    totalDays: mp.totalDays,
    entryRate: mp.entryRate,
    streak: mp.streak,
    fbCount: mp.fbCount,
    averageEnergy: mp.averageEnergy,
    logs: mp.logs,
    feedbacks: mp.feedbacks,
    managerComments: mp.managerComments,
    missions: mp.missions,
  };
}

function notionManagerToInfo(nm: NotionManager & { role?: string }): ManagerInfo {
  return {
    id: nm.id,
    token: nm.token,
    name: nm.name,
    email: nm.email,
    department: nm.department,
    isAdmin: nm.isAdmin,
    role: (nm.role as ManagerRole) || (nm.isAdmin ? "admin" : "manager"),
    participantIds: nm.participantIds,
  };
}

function mockManagerToInfo(mm: Manager): ManagerInfo {
  return {
    id: mm.id,
    token: mm.token,
    name: mm.name,
    email: mm.email,
    department: mm.department,
    isAdmin: false, // mock managers don't have this field
    role: "manager",
    participantIds: mm.participantIds,
    backend: "mock",
  };
}

// ===== Public API =====

export async function getAllParticipants(tenantId?: string | null): Promise<ParticipantInfo[]> {
  // tenantId=undefined/null → fetch ALL tenants (cross-tenant admin mode)
  // tenantId=string → fetch specific tenant
  const tid = tenantId === null || tenantId === undefined ? undefined : (tenantId || DEFAULT_TENANT_ID);
  if (hasSupabase()) {
    const sps = await getAllParticipantsFromSupabase(tid);
    return sps.map((sp) => ({
      ...notionParticipantToInfo(sp),
      backend: "supabase" as BackendType,
      tenantId: tid || "all",
    }));
  }
  return mockGetAllParticipants().map(mockParticipantToInfo);
}

/**
 * Get all participants for a specific tenant (Supabase only).
 */
export async function getAllParticipantsForTenant(tenantId: string): Promise<ParticipantInfo[]> {
  if (!hasSupabase()) return [];
  const sps = await getAllParticipantsFromSupabase(tenantId);
  return sps.map((sp) => ({
    ...notionParticipantToInfo(sp),
    backend: "supabase" as BackendType,
    tenantId,
  }));
}

export async function getParticipantByToken(token: string): Promise<ParticipantInfo | null> {
  // 1. Try Supabase first (multi-tenant)
  if (hasSupabase()) {
    try {
      const sp = await getParticipantByTokenFromSupabase(token);
      if (sp) {
        return {
          ...notionParticipantToInfo(sp),
          backend: "supabase",
          tenantId: sp.tenantId,
        };
      }
    } catch {
      // Supabase lookup failed — continue to mock
    }
  }
  // 2. Fallback to mock
  const mp = mockGetByToken(token);
  return mp ? mockParticipantToInfo(mp) : null;
}

export async function getParticipantByName(name: string, tenantId?: string): Promise<ParticipantInfo | null> {
  // Search Supabase — with or without tenant filter (cross-tenant when tenantId is undefined)
  if (hasSupabase()) {
    const sp = await getParticipantByNameFromSupabase(name, tenantId);
    if (sp) {
      const resolvedTenant = sp.tenantId || tenantId || DEFAULT_TENANT_ID;
      return { ...notionParticipantToInfo(sp), backend: "supabase", tenantId: resolvedTenant };
    }
  }
  // Fallback to mock
  const mp = mockGetByName(name);
  return mp ? mockParticipantToInfo(mp) : null;
}

export async function getParticipantByEmail(email: string, tenantId?: string): Promise<ParticipantInfo | null> {
  if (tenantId && hasSupabase()) {
    const sp = await getParticipantByEmailFromSupabase(email, tenantId);
    if (sp) return { ...notionParticipantToInfo(sp), backend: "supabase", tenantId };
  }
  // Fallback to mock
  const mp = mockGetByEmail(email);
  return mp ? mockParticipantToInfo(mp) : null;
}

export async function getParticipantById(id: string, tenantId?: string): Promise<ParticipantInfo | null> {
  if (hasSupabase()) {
    try {
      // Check all participants in the tenant and find by ID
      const tid = tenantId || DEFAULT_TENANT_ID;
      const all = await getAllParticipantsFromSupabase(tid);
      const found = all.find((p) => p.id === id);
      if (found) {
        return {
          ...notionParticipantToInfo(found),
          backend: "supabase",
          tenantId: tid,
        };
      }
    } catch {
      // Continue to mock
    }
  }
  const mp = mockGetById(id);
  return mp ? mockParticipantToInfo(mp) : null;
}

export async function getAllManagers(tenantId?: string | null): Promise<ManagerInfo[]> {
  const tid = tenantId === null || tenantId === undefined ? undefined : (tenantId || DEFAULT_TENANT_ID);
  if (hasSupabase()) {
    const sms = await getAllManagersFromSupabase(tid);
    return sms.map((sm) => ({
      ...notionManagerToInfo(sm),
      backend: "supabase" as BackendType,
      tenantId: tid || "all",
    }));
  }
  return mockGetAllManagers().map(mockManagerToInfo);
}

/**
 * Get all managers for a specific tenant (Supabase only).
 */
export async function getAllManagersForTenant(tenantId: string): Promise<ManagerInfo[]> {
  if (!hasSupabase()) return [];
  const sms = await getAllManagersFromSupabase(tenantId);
  return sms.map((sm) => ({
    ...notionManagerToInfo(sm),
    backend: "supabase" as BackendType,
    tenantId,
  }));
}

export async function getManagerByToken(token: string): Promise<ManagerInfo | null> {
  // 1. Try Supabase first
  if (hasSupabase()) {
    try {
      const sm = await getManagerByTokenFromSupabase(token);
      if (sm) {
        return {
          ...notionManagerToInfo(sm),
          backend: "supabase",
          tenantId: sm.tenantId,
        };
      }
    } catch {
      // Continue to mock
    }
  }
  // 2. Fallback to mock
  const mm = mockGetManagerByToken(token);
  return mm ? mockManagerToInfo(mm) : null;
}

export async function getManagerById(id: string): Promise<ManagerInfo | null> {
  // Try Supabase first (UUID format check)
  if (hasSupabase() && id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    try {
      const sm = await getManagerByIdFromSupabase(id);
      if (sm) return { ...notionManagerToInfo(sm), backend: "supabase" };
    } catch {
      // Continue to mock
    }
  }
  const mm = mockGetManagerById(id);
  return mm ? mockManagerToInfo(mm) : null;
}

export async function getParticipantsForManager(managerId: string, tenantId?: string): Promise<ParticipantInfo[]> {
  if (tenantId && hasSupabase()) {
    const sps = await getParticipantsForManagerFromSupabase(managerId, tenantId);
    return sps.map((sp) => ({
      ...notionParticipantToInfo(sp),
      backend: "supabase" as BackendType,
      tenantId,
    }));
  }
  // Fallback to mock
  return mockGetParticipantsForManager(managerId).map(mockParticipantToInfo);
}

export async function isAdminToken(token: string): Promise<boolean> {
  // Try Supabase first
  if (hasSupabase()) {
    try {
      const isAdmin = await isAdminTokenFromSupabase(token);
      if (isAdmin) return true;
    } catch {
      // Continue to fallback
    }
  }
  // Read from environment variable with fallback defaults
  const ADMIN_TOKENS = (process.env.ADMIN_TOKENS || "munetomo-admin,UE8m8SSJAgRBwsSZ")
    .split(",")
    .map((t) => t.trim());
  return ADMIN_TOKENS.includes(token);
}

/**
 * Check if token belongs to an admin OR observer (read-only admin).
 * Used for endpoints that allow both roles.
 */
export async function isAdminOrObserverToken(token: string): Promise<boolean> {
  const manager = await getManagerByToken(token);
  if (!manager) return false;
  return manager.role === "admin" || manager.role === "observer" || manager.isAdmin;
}
