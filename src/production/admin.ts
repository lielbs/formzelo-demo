/**
 * Production-only administration: the team of a workspace and the RockStack operator console.
 * Every call is authorised on the server (RLS-checked RPCs, or Edge Functions that verify the
 * caller's JWT); the browser never decides who may do what.
 */
import { DomainRuleError } from '../data/repository';
import { publicBaseUrl } from '../lib/links';
import { getProductionSupabaseClient } from './supabaseClient';

export interface TeamMember { userId: string; email: string; role: 'owner' | 'staff'; since: string; self: boolean }
export interface TeamInvitation { id: string; email: string; role: 'owner' | 'staff'; expiresAt: string }
export interface OperatorOrganization {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string;
  owners: number;
  staff: number;
  workflows: number;
  pendingOwnerInvitation: { email: string; expiresAt: string } | null;
}

const MESSAGES: Record<string, string> = {
  invitation_email_invalid: 'כתובת האימייל אינה תקינה.',
  already_member: 'הכתובת הזו כבר חברה בצוות.',
  invitation_closed: 'ההזמנה כבר אינה פעילה.',
  member_not_found: 'החבר כבר אינו בצוות.',
  last_owner: 'אי אפשר להסיר את הבעלים האחרון של העסק.',
  account_not_found: 'אין חשבון עם הכתובת הזו.',
};

function explain(error: { code?: string; message?: string } | null, fallback: string): never {
  if (error?.message && MESSAGES[error.message]) throw new DomainRuleError(MESSAGES[error.message]!);
  if (error?.code === '42501') throw new DomainRuleError('אין הרשאה לפעולה הזו.');
  if (error?.code === '54000') throw new DomainRuleError('נשלחו הרבה הזמנות בזמן קצר. נסו שוב בעוד שעה.');
  throw new Error(fallback);
}

/** The link an invited person opens: secrets stay in the fragment. */
export const invitationLink = (token: string, organizationId: string) =>
  `${publicBaseUrl()}/invite#invitation_token=${encodeURIComponent(token)}&organization_id=${encodeURIComponent(organizationId)}`;

export async function listTeam(orgId: string): Promise<{ members: TeamMember[]; invitations: TeamInvitation[] }> {
  const client = await getProductionSupabaseClient();
  const { data, error } = await client.rpc('list_team', { p_organization_id: orgId });
  if (error) explain(error, 'Unable to load team');
  const root = (data ?? {}) as { members?: TeamMember[]; invitations?: TeamInvitation[] };
  return { members: root.members ?? [], invitations: root.invitations ?? [] };
}

export async function inviteStaff(orgId: string, email: string): Promise<{ link: string; expiresAt: string }> {
  const client = await getProductionSupabaseClient();
  const { data, error } = await client.rpc('create_staff_invitation', { p_organization_id: orgId, p_email: email });
  if (error || !data?.[0]) explain(error, 'Unable to create invitation');
  return { link: invitationLink(data[0].invitation_token, orgId), expiresAt: data[0].invitation_expires_at };
}

export async function revokeInvitation(orgId: string, invitationId: string) {
  const client = await getProductionSupabaseClient();
  const { error } = await client.rpc('revoke_team_invitation', { p_organization_id: orgId, p_invitation_id: invitationId });
  if (error) explain(error, 'Unable to revoke invitation');
}

export async function removeMember(orgId: string, userId: string) {
  const client = await getProductionSupabaseClient();
  const { error } = await client.rpc('remove_member', { p_organization_id: orgId, p_user_id: userId });
  if (error) explain(error, 'Unable to remove member');
}

/** The link a person opens to choose a new password; valid 2 hours, once. */
export const recoveryLink = (token: string) => `${publicBaseUrl()}/reset#recovery_token=${encodeURIComponent(token)}`;

/** Operators: a recovery link for an account (typically a business owner). */
export async function issueAccountRecovery(email: string) {
  const client = await getProductionSupabaseClient();
  const { data, error } = await client.rpc('operator_issue_password_recovery', { p_email: email });
  if (error || typeof data !== 'string') explain(error, 'Unable to create recovery link');
  return recoveryLink(data);
}

/** Owners: a recovery link for a staff member of their own workspace. */
export async function issueStaffRecovery(orgId: string, userId: string) {
  const client = await getProductionSupabaseClient();
  const { data, error } = await client.rpc('owner_issue_staff_recovery', { p_organization_id: orgId, p_user_id: userId });
  if (error || typeof data !== 'string') explain(error, 'Unable to create recovery link');
  return recoveryLink(data);
}

export async function isPlatformOperator(): Promise<boolean> {
  const client = await getProductionSupabaseClient();
  const { data, error } = await client.rpc('is_platform_operator');
  return !error && data === true;
}

export async function operatorOrganizations(): Promise<OperatorOrganization[]> {
  const client = await getProductionSupabaseClient();
  const { data, error } = await client.rpc('operator_list_organizations');
  if (error) explain(error, 'Unable to load organizations');
  return (data ?? []) as unknown as OperatorOrganization[];
}

const FUNCTION_ERRORS: Record<number, string> = {
  400: 'בדקו את הפרטים: כתובת אתר באותיות לטיניות קטנות ומקפים, ואימייל תקין.',
  401: 'פג תוקף ההתחברות. התחברו מחדש.',
  403: 'אין הרשאת מפעיל, הכתובת כבר תפוסה, או שעברתם את מגבלת הקצב (5 עסקים ברבע שעה).',
};

async function invokeOperator(name: 'operator-organizations' | 'operator-invitations', body: Record<string, string>) {
  const client = await getProductionSupabaseClient();
  const { data, error } = await client.functions.invoke<{ organizationId: string; invitationToken: string }>(name, { body });
  const status = (error as { context?: Response } | null)?.context?.status;
  if (error || !data) throw new DomainRuleError((status && FUNCTION_ERRORS[status]) || 'הפעולה נכשלה. נסו שוב.');
  return data;
}

/** Creates the business, its settings and Brand Kit, and the owner's invitation (one transaction). */
export async function provisionBusiness(input: { name: string; slug: string; ownerEmail: string }) {
  const data = await invokeOperator('operator-organizations', input);
  return { organizationId: data.organizationId, link: invitationLink(data.invitationToken, data.organizationId) };
}

/** A fresh owner invitation, e.g. when the first one expired. */
export async function reinviteOwner(organizationId: string, email: string) {
  const data = await invokeOperator('operator-invitations', { organizationId, email });
  return invitationLink(data.invitationToken, organizationId);
}
