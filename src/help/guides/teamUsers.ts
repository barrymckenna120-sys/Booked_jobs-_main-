import type { HelpGuide } from "../types";
import sUsers from "@/assets/help-team-users.png.asset.json";
import sActions from "@/assets/help-team-actions.png.asset.json";
import sAvailability from "@/assets/help-team-availability.png.asset.json";
import sBlocks from "@/assets/help-team-timeblocks.png.asset.json";

export const teamUsersGuide: HelpGuide = {
  slug: "team-users",
  title: "Team & Users",
  description: "Add staff, manage roles and access, and set engineer availability, time-off and job time blocks.",
  audience: ["office", "admin", "owner"],
  lastUpdated: "30/09/26",
  keywords: ["team", "users", "staff", "engineers", "roles", "availability", "invite", "access"],
  steps: [
    {
      slug: "team-list",
      title: "The Team & Users page",
      shortDescription: "See everyone with access, and filter by role.",
      body: [
        "Team & Users lives in Settings. It shows everyone who has access to your company, with a count of active members at the top.",
        "The cards show how many Admins, Office users, Engineers and Blocked users you have. Tap a filter chip — All, Admins, Office, Engineers, Blocked — to narrow the list.",
        "Each person shows their role badge (Owner / Manager, Engineer, etc.) and whether their login is linked. \"No login linked\" means they haven't accepted their invite yet.",
      ],
      instructions: [
        "Open Settings, then Team & Users.",
        "Use the search box to find someone by name or email.",
        "Tap + Add Member to invite someone new.",
      ],
      screenshots: [{ src: sUsers.url, device: "mobile", alt: "Team & Users page with role counts, search, filters and the member list" }],
      keywords: ["add member", "search", "filter", "admins", "office", "blocked", "login linked", "invite"],
    },
    {
      slug: "manage-member",
      title: "Manage a member",
      shortDescription: "Edit details, change roles, resend invites and more.",
      body: ["Tap the ⋯ menu on a member's row to see everything you can do with their account."],
      callouts: [
        { label: "Edit Details", text: "Change their name or contact details." },
        { label: "Change Role", text: "Set as Admin, Set as Office or Set as Engineer — controls what they can see and do." },
        { label: "Resend Invite", text: "Sends the invite again if they haven't joined yet." },
        { label: "Reset Password", text: "Sends them a password reset link." },
        { label: "Block User", text: "Immediately stops them signing in, without deleting their record." },
        { label: "Deactivate", text: "Removes them from the active team." },
      ],
      screenshots: [{ src: sActions.url, device: "mobile", alt: "Member actions menu with Edit Details, Change Role, Resend Invite, Reset Password, Block User and Deactivate" }],
      keywords: ["edit", "role", "admin", "resend invite", "reset password", "block", "deactivate"],
    },
    {
      slug: "engineer-availability",
      title: "Engineer Availability",
      shortDescription: "Set working days, RGI number and time-off for each engineer.",
      body: [
        "Below the member list, Engineer Availability lets you manage each engineer separately — tap their name to switch between them.",
        "RGI Number — enter the engineer's RGI registration number and tap Save. This is needed for certificates.",
        "Working Days — tap a day to toggle it On or Off. Days that are Off won't be offered when scheduling jobs for that engineer.",
        "Blocked Slots & Holidays — tap + Add Block to mark time off, e.g. holidays or appointments.",
      ],
      screenshots: [{ src: sAvailability.url, device: "mobile", alt: "Engineer Availability with engineer picker, RGI number, working days and blocked slots" }],
      keywords: ["availability", "working days", "rgi", "holidays", "time off", "blocked slots"],
    },
    {
      slug: "job-time-blocks",
      title: "Job Time Blocks",
      shortDescription: "Define the scheduling blocks and how many jobs fit in each.",
      body: [
        "Job Time Blocks control the time slots jobs can be booked into — for example Morning 09:00–11:00, Midday 11:00–14:00, Afternoon 14:00–17:00.",
        "Max jobs sets how many jobs can be booked into each block.",
        "These blocks are what you pick from when scheduling a job.",
      ],
      instructions: [
        "Adjust the start and end times for each block.",
        "Set Max jobs for each block.",
        "Tap Save Time Blocks.",
      ],
      screenshots: [{ src: sBlocks.url, device: "mobile", alt: "Job Time Blocks with Morning, Midday and Afternoon slots, max jobs and Save Time Blocks" }],
      keywords: ["time blocks", "scheduling", "slots", "max jobs", "morning", "afternoon"],
    },
  ],
};
