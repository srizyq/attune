# Community — notes for App Store review

Apps with user-generated content have to show Apple (guideline 1.2) that people
can't be exposed to abuse. This lists what Community has, so it can be pasted
into the review notes. Items marked **owner to confirm** need a decision from
whoever runs the app before submitting.

## What it is
An optional social tab for sharing meals, days and recipes (calories and macros)
with followers. 16+ only (checked against the date of birth or age in the
profile). Off for everyone until `app_settings.community_enabled` is switched on.

## Safeguards in the app
- **Filtering.** Usernames, display names, bios and post notes are checked for
  abusive language, and links are blocked in bios and notes. Photos are checked
  automatically (Claude) and must be a safe photo of food (profile pictures must
  be safe); anything else is rejected and deleted. A photo is never visible to
  anyone but its owner until it has been approved.
- **Reporting.** "More" on any post → Report post; on any profile → Report. Six
  reasons (inappropriate photo, harassment, harmful dieting, spam,
  impersonation, other).
- **Blocking.** From any post or profile. Blocking hides both people from each
  other everywhere and removes any follow. Blocked people are listed (and can be
  unblocked) under your profile → Blocked people.
- **Moderation.** Every report is emailed to attun3app@gmail.com and listed on a
  moderation page that only moderators can open (Community → shield icon). A
  moderator can hide or delete a post, ban an account, or dismiss a report. A post
  reported by three different people is hidden automatically until reviewed.
- **Abuse limits.** Per person per day: 20 posts, 100 follows, 20 reports. A photo whose automatic check failed is checked again the next time the app opens it.
- **Privacy by default.** People choose public or private when they join (the
  database default is private). Private accounts approve followers. Weight is
  never shown. Likes are visible only to the person who posted.
- **Contact.** attun3app@gmail.com (also in the Privacy Policy and Terms).
- **Terms.** Community rules are in the Terms of Service (section 6): no abusive,
  sexual or violent content, no content promoting eating disorders, no
  advertising, and a right to remove content and suspend accounts.
- **Health safeguard.** Sharing a finished day under 1,200 kcal shows a gentle
  check-in with eating-disorder support information before it can be posted.

## To confirm before submitting
- How quickly reports are looked at (**owner to confirm**; Apple asks for a
  commitment such as "within 24 hours").
- Who the moderators are (`community_moderators`), and a backup person.
- That the moderator email address receives and is monitored.
- A demo account for the reviewers, with a few example posts.
