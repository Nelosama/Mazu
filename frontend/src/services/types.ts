export type Role = 'OWNER' | 'ADMIN' | 'STAFF';
export type AppointmentStatus = 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
export type AppointmentType = 'ONLINE' | 'WALK_IN' | 'BLOCKED';
export type BlockReason = 'BREAK' | 'ABSENCE' | 'EXTRAORDINARY' | 'OTHER';
export type BusinessType =
  'BARBERSHOP' | 'BEAUTY_SALON' | 'NAIL_STUDIO' | 'AESTHETICS' | 'SPA' | 'OTHER';
export type WouldReturn = 'YES' | 'MAYBE' | 'NO';
export type FollowUp = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';

export interface User {
  id: string;
  name: string;
  email: string;
  preferredLocale: string | null;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  type: BusinessType;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string;
  country: string;
  currency: string;
  locale: string;
  timezone: string;
  status: 'ACTIVE' | 'SUSPENDED';
  slotIntervalMinutes: number;
  minLeadMinutes: number;
  maxAdvanceDays: number;
  cancelWindowMinutes: number;
  feedbackEnabled: boolean;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: string;
  currency: string;
  maxStaff: number | null;
  maxBranches: number | null;
  maxMonthlyBookings: number | null;
  customBranding: boolean;
  satisfactionReports: boolean;
  advancedReports: boolean;
  isActive: boolean;
  subscriptions?: number;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface BusinessDetail extends Business {
  branches: Branch[];
  subscription: { status: string; trialEndsAt: string | null; plan: Plan } | null;
}

export interface Membership {
  role: Role;
  staffId: string | null;
  business: Business;
}

export interface Me {
  user: User;
  isPlatformAdmin: boolean;
  memberships: Membership[];
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: string;
  currency: string;
  durationMinutes: number;
  photoUrl: string | null;
  active: boolean;
  staffIds: string[];
}

export interface Staff {
  id: string;
  branchId: string;
  name: string;
  specialty: string | null;
  bio: string | null;
  photoUrl: string | null;
  commissionPercent: string | null;
  active: boolean;
  serviceIds: string[];
}

export interface TimeRange {
  weekday: number;
  startMinute: number;
  endMinute: number;
  label?: string | null;
}

export interface StaffSchedule {
  workingHours: TimeRange[];
  breaks: TimeRange[];
  exceptions: {
    id: string;
    date: string;
    isClosed: boolean;
    startMinute: number | null;
    endMinute: number | null;
    note: string | null;
  }[];
  timeOff: { id: string; type: string; startsAt: string; endsAt: string; note: string | null }[];
}

export interface Slot {
  startsAt: string;
  endsAt: string;
  staffIds: string[];
}

export interface DaySlots {
  date: string;
  slots: Slot[];
}

export interface AdminAppointment {
  id: string;
  type: AppointmentType;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  staff: { id: string; name: string };
  service: { id: string; name: string } | null;
  customer: { id: string; name: string; phone: string } | null;
  walkInName: string | null;
  blockReason: BlockReason | null;
  notes: string | null;
  price: string | null;
  currency: string | null;
  feedback: { responded: boolean; rating: number | null } | null;
  feedbackUrl?: string;
}

export interface PublicProfile {
  business: {
    name: string;
    slug: string;
    type: BusinessType;
    description: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    primaryColor: string;
    country: string;
    currency: string;
    locale: string;
    timezone: string;
    cancelWindowMinutes: number;
    maxAdvanceDays: number;
  };
  branches: { id: string; name: string; address: string | null; timezone: string }[];
  services: Omit<Service, 'active'>[];
  staff: {
    id: string;
    name: string;
    specialty: string | null;
    bio: string | null;
    photoUrl: string | null;
    serviceIds: string[];
  }[];
  portfolio: { id: string; staffId: string | null; caption: string | null; url: string }[];
}

export interface PublicAppointment {
  id: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  timezone: string;
  business: {
    name: string;
    slug: string;
    primaryColor: string;
    locale: string;
    cancelWindowMinutes: number;
  };
  branch: { name: string; address: string | null };
  service: { id: string; name: string; durationMinutes: number } | null;
  staff: { id: string; name: string };
  customerName: string | null;
  price: string | null;
  currency: string | null;
  canCancel: boolean;
  canReschedule: boolean;
  manageToken?: string;
}

export interface Interval95 {
  mean: number | null;
  low: number | null;
  high: number | null;
  n: number;
  reliable: boolean;
}

export interface FeedbackDashboard {
  summary: {
    invitations: number;
    responses: number;
    responseRate: number | null;
    rating: Interval95;
    distribution: { star: number; count: number }[];
    wouldReturn: {
      yes: number;
      maybe: number;
      no: number;
      yesRate: number | null;
      yesInterval: { low: number; high: number } | null;
    };
    minReliableSample: number;
    reliable: boolean;
  };
  detailed: boolean;
  byStaff?: { id: string; name: string; rating: Interval95; yesRate: number }[];
  byService?: { id: string; name: string; rating: Interval95; yesRate: number }[];
  monthly?: { month: string; responses: number; avg: number | null; reliable: boolean }[];
  commentCategories?: Record<string, number>;
  pendingNegative?: number;
}

export interface FeedbackItem {
  id: string;
  rating: number;
  wouldReturn: WouldReturn;
  comment: string | null;
  categories: string[];
  respondedAt: string;
  followUpStatus: FollowUp;
  followUpNote: string | null;
  staff: { id: string; name: string };
  service: { id: string; name: string } | null;
  appointmentAt: string;
  customerName: string | null;
  negative: boolean;
}
