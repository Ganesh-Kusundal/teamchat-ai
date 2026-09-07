/**
 * TeamChat AI - Core Domain Types
 * Defines models for Multi-Tenancy, Real-Time Chat, User Attribution,
 * Clinical Seed Data, and Gemini Tool Calling.
 */

export type UserRole = 'admin' | 'member';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgSlug: string;
  avatarUrl?: string;
  avatar?: string;
  title?: string;
  statusText?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  description: string;
  memberCount: number;
  logoColor: string;
  baseRate?: number;
}

export interface Room {
  id: string;
  orgSlug: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
  memberIds: string[];
  createdAt: string;
  createdBy: string;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageTimestamp?: string;
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'running' | 'completed' | 'error';
  error?: string;
}

export interface MessageReadReceipt {
  userId: string;
  userName: string;
  readAt: string;
}

export interface Message {
  id: string;
  roomId: string;
  orgSlug: string;
  senderId: string;
  senderName: string;
  senderRole?: UserRole;
  isAi: boolean;
  content: string;
  timestamp: string;
  mentionsAi?: boolean;
  isStreaming?: boolean;
  toolCalls?: ToolCallRecord[];
  replyToId?: string;
  replyToSnippet?: string;
  readBy?: MessageReadReceipt[];
}

export interface TypingUser {
  userId: string;
  userName: string;
}

export interface TypingIndicator {
  userId: string;
  userName: string;
  roomId: string;
  orgSlug: string;
  timestamp: number;
}

export interface PresenceRecord {
  userId: string;
  userName: string;
  orgSlug: string;
  currentRoomId?: string;
  isOnline: boolean;
  lastActive: string;
}

// Healthcare Condition & HCC Risk Adjustment Seed Data Types
export interface ConditionCode {
  icd10_code: string;
  description: string;
  code_family: string;
  chapter: string;
  chronic: boolean;
  specificity: 'specified' | 'unspecified';
  hcc_v28_code?: string;
  hcc_v28_label?: string;
}

export interface HCCFactor {
  hcc_v28_code: string;
  hcc_v28_label: string;
  coeff_community_nondual_aged: number;
  coeff_community_fbdual_aged: number;
  hierarchy_supersedes: string[];
}

export interface DemographicFactor {
  sex: 'M' | 'F';
  age_band: string;
  coeff_community_nondual_aged: number;
  coeff_community_fbdual_aged: number;
}

export interface PatientCondition {
  icd10_code: string;
  description: string;
  hcc_v28_code?: string;
  last_documented: string;
  encounter_id?: string;
  evidence?: string;
}

export interface Patient {
  patient_id: string;
  org_slug: string;
  name: string;
  age: number;
  sex: 'M' | 'F';
  enrollment: {
    model_segment: 'community_nondual_aged' | 'community_fbdual_aged';
    medicaid_dual: boolean;
    plan: string;
  };
  last_visit: string;
  attending_provider: string;
  documented_conditions_2026: PatientCondition[];
  suspected_conditions: PatientCondition[];
}

export interface TeamMemory {
  memory_id: string;
  org_slug: string;
  key: string;
  value: Record<string, string | number | boolean>;
  created_by: string;
  created_at: string;
  room: string;
}

export interface RAFCalculationResult {
  patient_id?: string;
  org_slug: string;
  dataset_version: string;
  model_segment: string;
  demographic_factor: {
    sex: 'M' | 'F';
    age_band: string;
    coefficient: number;
  };
  mapped_conditions: {
    icd10_code: string;
    description: string;
    hcc_code: string;
    hcc_label: string;
    raw_coefficient: number;
    is_superseded: boolean;
    superseded_by?: string;
    final_coefficient: number;
  }[];
  unmapped_conditions: {
    icd10_code: string;
    description: string;
    reason: string;
  }[];
  demographic_coefficient: number;
  hcc_coefficient_sum: number;
  raf_total: number;
  base_rate: number;
  estimated_annual_payment: number;
}
