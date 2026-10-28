import { defineCommandMenuItem, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from "twenty-sdk/define";
import { CALL_BUTTON_FRONT_COMPONENT_ID } from "../front-components/call-button";

export default defineCommandMenuItem({
  universalIdentifier: "8f3c2a1e-6b47-4d1a-8c55-2a7e0b6d4f13",
  label: "Call with Wala Dialer",
  shortLabel: "Call",
  isPinned: true,
  availabilityType: "GLOBAL_OBJECT_CONTEXT",
  availabilityObjectUniversalIdentifier: STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  frontComponentUniversalIdentifier: CALL_BUTTON_FRONT_COMPONENT_ID,
});
