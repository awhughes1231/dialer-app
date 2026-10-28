import { defineNavigationMenuItem, NavigationMenuItemType } from "twenty-sdk/define";
import { DIALER_BASE_URL } from "../dialer-url";

export default defineNavigationMenuItem({
  universalIdentifier: "8f3c2a1e-6b47-4d1a-8c55-2a7e0b6d4f14",
  name: "Wala Dialer",
  icon: "IconPhone",
  color: "green",
  position: 5,
  type: NavigationMenuItemType.LINK,
  link: DIALER_BASE_URL,
});
