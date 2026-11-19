// Shared venue links (/live/t/<venue>, /menu, /waitlist): the page with the venue's own preview tags.
// Manage links (/live/t/r, /live/t/w) pass through unchanged. See edge/serve.ts.
import { servePreview } from '../../../edge/serve';

export const onRequestGet = (ctx: Parameters<typeof servePreview>[0]) => servePreview(ctx);
