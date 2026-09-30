import type { HelpGuide } from "../types";
import sUsers from "@/assets/help-team-users.png.asset.json";
import sActions from "@/assets/help-team-actions.png.asset.json";
import sAvailability from "@/assets/help-team-availability.png.asset.json";
import sAdd from "@/assets/help-team-add-member.png.asset.json";
import sBlocks from "@/assets/help-team-timeblocks.png.asset.json";

export const teamUsersGuide: HelpGuide = {
  slug: "team-users",
  title: "Team & Users",
  description: "Add staff, manage engineer availability and control user access.",
  audience: ["office", "admin", "owner"],
  lastUpdated: "30/09/26",
  sourceDocument: "BookedJobs Team & Users Guide (iPhone 14, Final v3)",
  keywords: ["team", "users", "staff", "engineers", "roles", "availability", "invite", "access"],
  intro: ["This guide is for owners, managers and authorised office users who manage the BookedJobs team."],
  quickReference: [{
    title: "Quick Reference",
    table: {
      head: ["Action", "What it does"],
      rows: [
        ["+ Add Member", "Add a new team member."],
        ["Engineer Availability", "RGI number, working days, blocked slots and holidays."],
        ["Job Time Blocks", "Scheduling windows and maximum jobs."],
        ["Resend Invite", "Resend a user's invitation."],
        ["Reset Password", "Help a user regain access."],
        ["Block User", "Temporarily stop access."],
        ["Deactivate", "Deactivate the account."],
      ],
    },
  }],
  steps: [
    {
      slug: "team-list",
      title: "Team & Users",
      shortDescription: "See everyone who has access to BookedJobs and their role.",
      body: ["Open Settings → Team & Users to see everyone who has access to BookedJobs and the role assigned to them."],
      callouts: [
        { label: "+ Add Member", text: "Add a new person." },
        { label: "Search", text: "Find a team member by name or email." },
        { label: "Filters", text: "Filter the list by Admins, Office, Engineers or Blocked." },
        { label: "Role badge", text: "Shows whether the person is an Owner / Manager, Admin, Office user or Engineer." },
        { label: "Login status", text: "Shows whether the team member has linked their BookedJobs login." },
      ],
      note: { tone: "info", text: "Use the Blocked filter when you need to find a user whose access has been temporarily blocked." },
      screenshots: [{ src: sUsers.url, device: "mobile", alt: "Team & Users page with role counts, search, filters and the member list" }],
      keywords: ["search", "filter", "admins", "office", "blocked", "login linked", "role"],
    },
    {
      slug: "add-member",
      title: "Add a Team Member",
      shortDescription: "Choose the correct role, then enter the person's details.",
      body: ["Tap + Add Member, choose the correct role, then enter the person's details."],
      callouts: [
        { label: "Owner / Manager", text: "Owner-level access across the Office and Engineer apps." },
        { label: "Admin", text: "Full office access, including users, settings and data." },
        { label: "Office", text: "Office control for scheduling, customers, quotes and payments." },
        { label: "Engineer", text: "Field access to assigned jobs and Engineer App tools." },
      ],
      instructions: [
        "Choose the person's role.",
        "Enter Full Name.",
        "Enter Email.",
        "Enter Phone.",
        "Tap the Add button shown for the selected role.",
      ],
      note: { tone: "info", text: "For Engineer, the screen shows the engineer permissions before you add the person: own assigned jobs, start and complete jobs, call and navigate, completion notes and photo uploads." },
      screenshots: [{ src: sAdd.url, device: "mobile", alt: "Add Team Member with role choices, engineer permissions, Full Name, Email and Phone" }],
      keywords: ["add member", "add engineer", "add user", "invite", "new staff", "role"],
    },
    {
      slug: "engineer-availability",
      title: "Engineer Availability",
      shortDescription: "RGI number, working days and time off for each engineer.",
      body: ["Set each engineer's RGI number, normal working days and time off so the office has the correct availability information."],
      instructions: [
        "Select the engineer.",
        "Enter the engineer's RGI number where applicable and tap Save.",
        "Turn the normal working days on or off.",
        "Use + Add Block for holidays, days off or another period when the engineer should not be scheduled.",
      ],
      note: { tone: "warning", text: "Check the selected engineer before changing working days or adding a blocked period." },
      screenshots: [{ src: sAvailability.url, device: "mobile", alt: "Engineer Availability with engineer picker, RGI number, working days and blocked slots" }],
      keywords: ["engineer availability", "working days", "rgi", "holidays", "time off", "add block"],
    },
    {
      slug: "job-time-blocks",
      title: "Job Time Blocks",
      shortDescription: "Scheduling windows and the maximum jobs in each block.",
      body: ["Job Time Blocks define the scheduling windows used by the office and the maximum number of jobs allowed in each block."],
      callouts: [
        { label: "Morning", text: "Set the start and finish time and Max jobs." },
        { label: "Midday", text: "Set the start and finish time and Max jobs." },
        { label: "Afternoon", text: "Set the start and finish time and Max jobs." },
      ],
      instructions: ["Tap Save Time Blocks after making changes."],
      note: { tone: "info", text: "The times shown in the screenshot are examples from the current setup. Use the time blocks that suit your business." },
      screenshots: [{ src: sBlocks.url, device: "mobile", alt: "Job Time Blocks with Morning, Midday and Afternoon slots, max jobs and Save Time Blocks" }],
      keywords: ["time blocks", "scheduling", "slots", "max jobs", "morning", "afternoon"],
    },
    {
      slug: "manage-user",
      title: "Manage a Team Member",
      shortDescription: "Tap the three dots beside a team member to see their actions.",
      body: ["From Team & Users, tap the three dots beside a team member to open the actions available for that user."],
      callouts: [
        { label: "Edit Details", text: "Update the team member's information." },
        { label: "Change Role", text: "Change the person's access role." },
        { label: "Set as Admin / Office / Engineer", text: "Quickly assign the required role." },
        { label: "Resend Invite", text: "Resend the BookedJobs invitation." },
        { label: "Reset Password", text: "Start the password reset process for the user." },
        { label: "Block User", text: "Temporarily prevent access." },
        { label: "Deactivate", text: "Deactivate the team member's account." },
      ],
      note: { tone: "warning", text: "Block User and Deactivate are separate actions. Use the action that matches what you need to do." },
      screenshots: [{ src: sActions.url, device: "mobile", alt: "Member actions menu with Edit Details, Change Role, Resend Invite, Reset Password, Block User and Deactivate" }],
      keywords: ["edit", "change role", "admin", "resend invite", "reset password", "deactivate"],
    },
    {
      slug: "block-unblock",
      title: "Block or Restore User Access",
      shortDescription: "Temporarily stop access, and find blocked users later.",
      body: [
        "Use Block User when access needs to be stopped temporarily.",
        "Blocked users can be found again from the Blocked filter on Team & Users.",
      ],
      instructions: [
        "Find the team member and tap the three dots.",
        "Choose Block User when temporary access should be stopped.",
        "To find a blocked person later, open the Blocked filter.",
        "Open the user's actions menu and use the restore/unblock action shown in the current app.",
      ],
      note: { tone: "warning", text: "The exact restore action should match the wording shown in the current BookedJobs app. Do not use Deactivate as a substitute for a temporary block." },
      screenshots: [{ src: sActions.url, device: "mobile", alt: "Member actions menu showing Block User and Deactivate as separate actions" }],
      keywords: ["block user", "unblock", "restore", "blocked", "access"],
    },
  ],
};
