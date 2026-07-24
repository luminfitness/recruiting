/**
 * Default job-posting language per role, used when a brand has no copy template
 * of its own yet. Admins edit these per brand at Settings → Postings; these are
 * the starting point and the "reset to default" target.
 *
 * PLACEHOLDERS — substituted at posting time by renderPostingCopy():
 *   {{brand}}            the hiring brand's name
 *   {{market}}           the market the posting is for (e.g. "Alpharetta, GA")
 *   {{scheduling_link}}  role-correct apply/scheduling URL
 *   {{contact_number}}   role-correct contact line
 *
 * The link and number are NOT per-user — they resolve per (brand, role) via
 * resolveRolePackage(), which looks both up together so a trainer ad can never
 * carry the manager line.
 */

export const POSTING_PLACEHOLDERS = ["brand", "market", "scheduling_link", "contact_number"] as const;
export type PostingPlaceholder = (typeof POSTING_PLACEHOLDERS)[number];

export const DEFAULT_MANAGER_POSTING = `Now Hiring
Assistant Fitness Manager
{{market}}
Personal Training · Club Operations
Full-time · In person · $27–$40 per session hour trained + $18–$20/hr non-session time + incentive compensation

Assistant Fitness Managers lead and manage the training experience. Leaders in this role are passionate about fitness and committed to delivering positive results by driving culture, developing their team, and creating a great member experience. You will work with the General Manager and Regional Personal Training Manager to deliver the brand, the member experience, and the business goals.

WHAT YOU WILL DO
• Drive fitness sales, revenue, and promotional activity to move the business forward
• Build member retention through 30–50 outreach calls per day
• Service 2–4 FitStart appointments per day and train 60+ session hours per month
• Run weekly audits of training agreements — tracking sales, scheduling sessions, and reporting on budget, sessions, and members
• Recruit, hire, onboard, and continually train a strong team of Personal Trainers
• Observe, shadow, and coach trainers to deliver a consistently positive member experience
• Meet with prospective members and represent the company with professionalism
• Keep the club clean, safe, fun, and welcoming

WHO YOU ARE
• Current Personal Training certification from an accredited program required (a four-year degree in a related field may substitute), plus 1 year in fitness or retail management
• College degree in business, retail, or hospitality preferred
• CPR/AED certification required within the first 30 days of hire
• Hungry, coachable, mentally tough, and enthusiastic — you generate your own appointments and thrive on results
• Strong communication, organization, and time management; proficient with Excel, Outlook, and Word
• Availability to work weekends and holidays as needed

TEAM PERKS
Free club membership · 401(k) · Medical / Dental / Vision · Paid Time Off · Paid Parental Leave (30+ hrs/week) · Retail and vendor discounts (NASM and more) · Professional development and clear promotion structure.

Apply / schedule: {{scheduling_link}}
Questions? {{contact_number}}`;

export const DEFAULT_TRAINER_POSTING = `Now Hiring
Certified Personal Trainer
{{market}}
Personal Training
Full-time or part-time · In person · $22–$35 per session hour trained + $16–$18/hr non-session time + uncapped commission

Personal Trainers create the results our members stay for. This role is for coaches who are passionate about fitness, genuinely enjoy people, and want a clear path to grow — into senior training, specialty coaching, or management. You will work with the Assistant Fitness Manager and the training team to deliver the brand, the member experience, and real member results.

WHAT YOU WILL DO
• Deliver safe, effective, personalized training sessions and train 60+ session hours per month
• Service 2–4 FitStart appointments per day and turn them into long-term training relationships
• Build your book through floor engagement, member outreach, and referrals
• Track member progress and adjust programming so results keep coming
• Keep sessions scheduled, training agreements current, and records accurate
• Support the training floor — greet members, coach form, and answer questions
• Keep the club clean, safe, fun, and welcoming

WHO YOU ARE
• Current Personal Training certification from an accredited program required (a four-year degree in a related field may substitute)
• CPR/AED certification required within the first 30 days of hire
• Hungry, coachable, mentally tough, and enthusiastic — you generate your own appointments and thrive on results
• Strong communication, organization, and time management; comfortable learning our scheduling and tracking tools
• Availability to work weekends and holidays as needed

TEAM PERKS
Free club membership · 401(k) · Medical / Dental / Vision · Paid Time Off · Paid Parental Leave (30+ hrs/week) · Retail and vendor discounts (NASM and more) · Continuing-education support and a clear promotion path into management.

Apply / schedule: {{scheduling_link}}
Questions? {{contact_number}}`;

export function defaultPostingCopy(roleType: "manager" | "trainer"): string {
  return roleType === "manager" ? DEFAULT_MANAGER_POSTING : DEFAULT_TRAINER_POSTING;
}

/**
 * Substitutes {{placeholders}} into a posting body. Unknown placeholders are
 * left untouched rather than blanked, so a typo is visible in the preview
 * instead of silently deleting a line of the ad.
 */
export function renderPostingCopy(
  body: string,
  vars: { brand?: string; market?: string; schedulingLink?: string; contactNumber?: string },
): string {
  const map: Record<string, string | undefined> = {
    brand: vars.brand,
    market: vars.market,
    scheduling_link: vars.schedulingLink,
    contact_number: vars.contactNumber,
  };
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => {
    const value = map[key];
    return value != null && value !== "" ? value : whole;
  });
}
