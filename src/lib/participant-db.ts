// ===== Participant & Manager DB Access =====
// Unified async interface: reads from Notion DB when configured,
// falls back to mock-data.ts when NOTION_PARTICIPANTS_DB_ID is not set.
//
// ALL API routes should import from this file instead of mock-data.ts.

import {
  getAllParticipantsFromNotion,
  getParticipantByTokenFromNotion,
  getParticipantByNameFromNotion,
  getParticipantByEmailFromNotion,
  getAllManagersFromNotion,
  getManagerByTokenFromNotion,
  getManagerByIdFromNotion,
  isAdminTokenFromNotion,
  getParticipantsForManagerFromNotion,
  type NotionParticipant,
  type NotionManager,
} from "./notion";

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

// Check if Notion participant/manager DBs are configured
function hasNotionParticipantDB(): boolean {
  return !!process.env.NOTION_PARTICIPANTS_DB_ID;
}

// ===== Unified types that both Notion and mock data can provide =====
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
  // Mock-only fields (for backward compatibility in mock mode)
  weekNum?: number;
  startDate?: string;
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

export type ManagerInfo = {
  id: string;
  token: string;
  name: string;
  email: string;
  department: string;
  isAdmin: boolean;
  participantIds: string[];
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

function notionManagerToInfo(nm: NotionManager): ManagerInfo {
  return {
    id: nm.id,
    token: nm.token,
    name: nm.name,
    email: nm.email,
    department: nm.department,
    isAdmin: nm.isAdmin,
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
    participantIds: mm.participantIds,
  };
}

// ===== Public API =====

export async function getAllParticipants(): Promise<ParticipantInfo[]> {
  if (hasNotionParticipantDB()) {
    const nps = await getAllParticipantsFromNotion();
    return nps.map(notionParticipantToInfo);
  }
  return mockGetAllParticipants().map(mockParticipantToInfo);
}

export async function getParticipantByToken(token: string): Promise<ParticipantInfo | null> {
  if (hasNotionParticipantDB()) {
    const np = await getParticipantByTokenFromNotion(token);
    return np ? notionParticipantToInfo(np) : null;
  }
  const mp = mockGetByToken(token);
  return mp ? mockParticipantToInfo(mp) : null;
}

export async function getParticipantByName(name: string): Promise<ParticipantInfo | null> {
  if (hasNotionParticipantDB()) {
    const np = await getParticipantByNameFromNotion(name);
    return np ? notionParticipantToInfo(np) : null;
  }
  const mp = mockGetByName(name);
  return mp ? mockParticipantToInfo(mp) : null;
}

export async function getParticipantByEmail(email: string): Promise<ParticipantInfo | null> {
  if (hasNotionParticipantDB()) {
    const np = await getParticipantByEmailFromNotion(email);
    return np ? notionParticipantToInfo(np) : null;
  }
  const mp = mockGetByEmail(email);
  return mp ? mockParticipantToInfo(mp) : null;
}

export async function getParticipantById(id: string): Promise<ParticipantInfo | null> {
  if (hasNotionParticipantDB()) {
    // In Notion mode, ID is a Notion page ID — retrieve directly
    try {
      // Use getAllParticipants and find by ID (no direct page retrieval for participants)
      const all = await getAllParticipantsFromNotion();
      const found = all.find((p) => p.id === id);
      return found ? notionParticipantToInfo(found) : null;
    } catch {
      return null;
    }
  }
  const mp = mockGetById(id);
  return mp ? mockParticipantToInfo(mp) : null;
}

export async function getAllManagers(): Promise<ManagerInfo[]> {
  if (hasNotionParticipantDB()) {
    const nms = await getAllManagersFromNotion();
    return nms.map(notionManagerToInfo);
  }
  return mockGetAllManagers().map(mockManagerToInfo);
}

export async function getManagerByToken(token: string): Promise<ManagerInfo | null> {
  if (hasNotionParticipantDB()) {
    const nm = await getManagerByTokenFromNotion(token);
    return nm ? notionManagerToInfo(nm) : null;
  }
  const mm = mockGetManagerByToken(token);
  return mm ? mockManagerToInfo(mm) : null;
}

export async function getManagerById(id: string): Promise<ManagerInfo | null> {
  if (hasNotionParticipantDB()) {
    const nm = await getManagerByIdFromNotion(id);
    return nm ? notionManagerToInfo(nm) : null;
  }
  const mm = mockGetManagerById(id);
  return mm ? mockManagerToInfo(mm) : null;
}

export async function getParticipantsForManager(managerId: string): Promise<ParticipantInfo[]> {
  if (hasNotionParticipantDB()) {
    const nps = await getParticipantsForManagerFromNotion(managerId);
    return nps.map(notionParticipantToInfo);
  }
  return mockGetParticipantsForManager(managerId).map(mockParticipantToInfo);
}

export async function isAdminToken(token: string): Promise<boolean> {
  if (hasNotionParticipantDB()) {
    return await isAdminTokenFromNotion(token);
  }
  // Fallback: hardcoded admin tokens for mock mode
  const ADMIN_TOKENS = ["munetomo-admin", "UE8m8SSJAgRBwsSZ"];
  return ADMIN_TOKENS.includes(token);
}
