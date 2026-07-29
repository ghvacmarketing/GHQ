import type { LeadSource } from "@shared/schema";

/** Lead-source options, shared by the CRM's account-create wizard and the
 *  mobile New Customer page so the two can't drift apart. */
export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Referral" },
  { value: "GOOGLE", label: "Google" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "YELP", label: "Yelp" },
  { value: "HOME_ADVISOR", label: "HomeAdvisor" },
  { value: "ANGI", label: "Angi" },
  { value: "THUMBTACK", label: "Thumbtack" },
  { value: "WALK_IN", label: "Walk-In" },
  { value: "PHONE", label: "Phone" },
  { value: "REPEAT_CUSTOMER", label: "Repeat Customer" },
  { value: "FIELDEDGE", label: "FieldEdge" },
  { value: "OTHER", label: "Other" },
];
