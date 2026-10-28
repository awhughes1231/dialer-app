# Twenty app

This folder is a Twenty application. It does not contain the softphone.

Twenty front components run in a sandboxed worker with a partial DOM, so microphone access and WebRTC are not reliable there. The app adds:

- a sidebar link to the dialer
- a pinned Call action on person, company, and opportunity pages

The action renders a normal link to `https://dialer.ecommercewala.co/call?personId=...` (or `companyId` / `opportunityId`). The call happens in that browser tab.

Edit `src/dialer-url.ts` before installing. Then, from a machine that can reach the Twenty workspace:

```bash
cd twenty-app
npm install
npx twenty app dev
```

`twenty app apply` is the one-shot install when you do not need the watch mode. Use a non-production workspace first if you have one. Installing the app does not change people, companies, or opportunities. The Call object and do-not-call fields come from `npm run twenty:setup` in the dialer repo.
