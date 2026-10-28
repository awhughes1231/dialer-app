import { defineFrontComponent, PageLayoutType, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from "twenty-sdk/define";
import { useSelectedObjectMetadata, useSelectedRecordIds } from "twenty-sdk/front-component";
import { dialerLinks } from "../dialer-url";

export const CALL_BUTTON_FRONT_COMPONENT_ID = "8f3c2a1e-6b47-4d1a-8c55-2a7e0b6d4f10";

const CallButton = () => {
  const objectMetadata = useSelectedObjectMetadata();
  const recordIds = useSelectedRecordIds();
  const links = dialerLinks(objectMetadata?.nameSingular, recordIds);

  if (!objectMetadata || (objectMetadata.nameSingular !== "person" && objectMetadata.nameSingular !== "company" && objectMetadata.nameSingular !== "opportunity")) {
    return (
      <p style={{ fontFamily: "sans-serif", padding: 12 }}>
        Open a person, company, or opportunity, then use Call.
      </p>
    );
  }

  if (links.length === 0) {
    return (
      <p style={{ fontFamily: "sans-serif", padding: 12 }}>
        Select one record, then use Call. The dialer opens in a real browser tab because WebRTC cannot run inside Twenty&apos;s sandbox.
      </p>
    );
  }

  return (
    <div style={{ fontFamily: "sans-serif", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <strong>Call with Wala Dialer</strong>
      {links.map((href) => (
        <a key={href} href={href} target="_blank" rel="noreferrer">
          {href}
        </a>
      ))}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: CALL_BUTTON_FRONT_COMPONENT_ID,
  name: "wala-dialer-call-button",
  description: "Opens the Wala dialer for the current person, company, or opportunity.",
  component: CallButton,
  widgetAvailability: {
    pageLayoutType: PageLayoutType.RECORD_PAGE,
    objectUniversalIdentifiers: [
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
    ],
  },
});
